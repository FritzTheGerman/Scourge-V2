require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits
} = require('discord.js');
const { google } = require('googleapis');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

const sheets = new google.sheets({
  version: 'v4',
  auth: new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  }),
});

const PERSONNEL_RANGE = 'A:G';
const PUNISHMENTS_RANGE = 'Punishments!A:H';
const RANK_HISTORY_RANGE = 'Rank History!A:J';

/* ----------------------------- HELPERS ----------------------------- */

function getRank(member) {
  const roles = member.roles.cache
    .filter(role => role.name !== '@everyone')
    .sort((a, b) => b.position - a.position);

  return roles.first()?.name || 'No Rank';
}

function formatIdNumber(id) {
  return String(id).padStart(4, '0');
}

async function getAllRows() {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: PERSONNEL_RANGE,
  });

  return response.data.values || [];
}

async function getPunishmentRows() {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: PUNISHMENTS_RANGE,
  });

  return response.data.values || [];
}

async function getRankHistoryRows() {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: RANK_HISTORY_RANGE,
  });

  return response.data.values || [];
}

async function ensureHeader() {
  const rows = await getAllRows();

  if (rows.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: 'A1:G1',
      valueInputOption: 'RAW',
      requestBody: {
        values: [[
          'ID Number',
          'Discord Username',
          'Discord ID',
          'Discord Role',
          'Roblox Username',
          'Last Updated',
          'Enlistment Status'
        ]]
      }
    });
  }
}

async function ensurePunishmentsHeader() {
  const rows = await getPunishmentRows();

  if (rows.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: 'Punishments!A1:H1',
      valueInputOption: 'RAW',
      requestBody: {
        values: [[
          'Case ID',
          'Target Discord Username',
          'Target Discord ID',
          'Action Type',
          'Reason',
          'Moderator Username',
          'Moderator ID',
          'Timestamp'
        ]]
      }
    });
  }
}

async function ensureRankHistoryHeader() {
  const rows = await getRankHistoryRows();

  if (rows.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: 'Rank History!A1:J1',
      valueInputOption: 'RAW',
      requestBody: {
        values: [[
          'Case ID',
          'Target Discord Username',
          'Target Discord ID',
          'Action Type',
          'Old Rank',
          'New Rank',
          'Reason',
          'Moderator Username',
          'Moderator ID',
          'Timestamp'
        ]]
      }
    });
  }
}

function findUserRow(rows, discordId) {
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][2] === discordId) {
      return i + 1;
    }
  }
  return null;
}

function getNextId(rows) {
  if (rows.length <= 1) return 1;

  const ids = rows
    .slice(1)
    .map(row => Number(row[0]))
    .filter(id => !Number.isNaN(id));

  if (ids.length === 0) return 1;
  return Math.max(...ids) + 1;
}

function getNextCaseId(rows) {
  if (rows.length <= 1) return 1;

  const ids = rows
    .slice(1)
    .map(row => Number(row[0]))
    .filter(id => !Number.isNaN(id));

  if (ids.length === 0) return 1;
  return Math.max(...ids) + 1;
}

async function addRow(data) {
  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: PERSONNEL_RANGE,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [data],
    },
  });
}

async function updateRow(rowNumber, data) {
  await sheets.spreadsheets.values.update({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `A${rowNumber}:G${rowNumber}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [data],
    },
  });
}

async function addPunishmentRow(data) {
  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: PUNISHMENTS_RANGE,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [data],
    },
  });
}

async function addRankHistoryRow(data) {
  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: RANK_HISTORY_RANGE,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [data],
    },
  });
}

async function tryApplyRoleChange(guild, userId, oldRankName, newRole) {
  try {
    const member = await guild.members.fetch(userId);

    if (oldRankName && oldRankName !== 'No Rank') {
      const oldRole = member.roles.cache.find(role => role.name === oldRankName);
      if (oldRole) {
        await member.roles.remove(oldRole);
      }
    }

    await member.roles.add(newRole);
    return true;
  } catch (error) {
    console.error('Role change failed:', error);
    return false;
  }
}

/* ----------------------------- EMBEDS ----------------------------- */

function buildVerifyEmbed(discordName, idNumber, robloxUsername, role, status) {
  return new EmbedBuilder()
    .setColor(0x8B0000)
    .setTitle('EMPIRE DATABASE ENTRY RECORDED')
    .setDescription(
      `Hello **${discordName}**\n\n` +
      `The following information has been successfully logged in the Empire Database.`
    )
    .addFields(
      { name: 'ID Number Issued', value: `\`${formatIdNumber(idNumber)}\``, inline: false },
      { name: 'Roblox Username Logged', value: `\`${robloxUsername}\``, inline: false },
      { name: 'Rank Logged', value: `\`${role}\``, inline: false },
      { name: 'Enlistment Status', value: `\`${status}\``, inline: false },
      { name: 'Status', value: '`Verified`', inline: false }
    )
    .setFooter({ text: 'Empire Verification System • Database Entry Confirmed' })
    .setTimestamp();
}

function buildUpdateEmbed(discordName, idNumber, robloxUsername, role, status) {
  return new EmbedBuilder()
    .setColor(0x4B0000)
    .setTitle('EMPIRE DATABASE ENTRY UPDATED')
    .setDescription(
      `Hello **${discordName}**\n\n` +
      `Your personnel record has been successfully updated in the Empire Database.`
    )
    .addFields(
      { name: 'ID Number Retained', value: `\`${formatIdNumber(idNumber)}\``, inline: false },
      { name: 'Roblox Username Logged', value: `\`${robloxUsername}\``, inline: false },
      { name: 'Rank Logged', value: `\`${role}\``, inline: false },
      { name: 'Enlistment Status', value: `\`${status}\``, inline: false },
      { name: 'Status', value: '`Updated`', inline: false }
    )
    .setFooter({ text: 'Empire Verification System • Record Successfully Updated' })
    .setTimestamp();
}

function buildProfileEmbed(row) {
  return new EmbedBuilder()
    .setColor(0x700000)
    .setTitle('EMPIRE PERSONNEL RECORD')
    .addFields(
      { name: 'ID Number', value: `\`${formatIdNumber(row[0] || '0')}\``, inline: false },
      { name: 'Discord Username', value: `\`${row[1] || 'Unknown'}\``, inline: false },
      { name: 'Discord ID', value: `\`${row[2] || 'Unknown'}\``, inline: false },
      { name: 'Rank Logged', value: `\`${row[3] || 'Unknown'}\``, inline: false },
      { name: 'Roblox Username', value: `\`${row[4] || 'Unknown'}\``, inline: false },
      { name: 'Last Updated', value: `\`${row[5] || 'Unknown'}\``, inline: false },
      { name: 'Enlistment Status', value: `\`${row[6] || 'Active'}\``, inline: false },
    )
    .setFooter({ text: 'Empire Verification System • Personnel Lookup' })
    .setTimestamp();
}

function buildStatusEmbed(targetUser, row) {
  return new EmbedBuilder()
    .setColor(0x650000)
    .setTitle('ENLISTMENT STATUS RECORD')
    .setDescription(`Status lookup for **${targetUser.tag}**`)
    .addFields(
      { name: 'ID Number', value: `\`${formatIdNumber(row[0] || '0')}\``, inline: false },
      { name: 'Rank Logged', value: `\`${row[3] || 'Unknown'}\``, inline: false },
      { name: 'Enlistment Status', value: `\`${row[6] || 'Active'}\``, inline: false },
      { name: 'Last Updated', value: `\`${row[5] || 'Unknown'}\``, inline: false },
    )
    .setFooter({ text: 'Empire Verification System • Status Lookup' })
    .setTimestamp();
}

function buildRosterEmbed(rows, page = 1, pageSize = 10) {
  const dataRows = rows.slice(1);
  const start = (page - 1) * pageSize;
  const pageRows = dataRows.slice(start, start + pageSize);

  const description = pageRows.length
    ? pageRows.map(row => {
        const id = formatIdNumber(row[0] || '0');
        const discordName = row[1] || 'Unknown';
        const rank = row[3] || 'Unknown';
        const roblox = row[4] || 'Unknown';
        const status = row[6] || 'Active';

        return `**${id}** • ${discordName}\n` +
               `Rank: \`${rank}\`\n` +
               `Roblox: \`${roblox}\`\n` +
               `Status: \`${status}\``;
      }).join('\n\n')
    : 'No personnel records found.';

  return new EmbedBuilder()
    .setColor(0x5A0000)
    .setTitle('EMPIRE ROSTER')
    .setDescription(description)
    .setFooter({ text: `Empire Verification System • Page ${page}` })
    .setTimestamp();
}

function buildRosterCountsEmbed(rows) {
  const dataRows = rows.slice(1);
  const total = dataRows.length;

  const statusCounts = {};
  const rankCounts = {};

  for (const row of dataRows) {
    const rank = row[3] || 'Unknown';
    const status = row[6] || 'Active';

    rankCounts[rank] = (rankCounts[rank] || 0) + 1;
    statusCounts[status] = (statusCounts[status] || 0) + 1;
  }

  const statusText = Object.entries(statusCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([status, count]) => `**${status}:** ${count}`)
    .join('\n') || 'No status data found.';

  const rankText = Object.entries(rankCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([rank, count]) => `**${rank}:** ${count}`)
    .join('\n') || 'No rank data found.';

  return new EmbedBuilder()
    .setColor(0x7A0000)
    .setTitle('EMPIRE ROSTER COUNTS')
    .addFields(
      { name: 'Total Personnel Records', value: `\`${total}\``, inline: false },
      { name: 'Counts by Enlistment Status', value: statusText, inline: false },
      { name: 'Top Rank Counts', value: rankText, inline: false }
    )
    .setFooter({ text: 'Empire Verification System • Roster Summary' })
    .setTimestamp();
}

function buildWarnEmbed(targetUser, caseId, reason, moderatorTag) {
  return new EmbedBuilder()
    .setColor(0xAA0000)
    .setTitle('DISCIPLINARY ACTION LOGGED')
    .setDescription(`A warning has been recorded in the Empire Database for **${targetUser.tag}**.`)
    .addFields(
      { name: 'Case ID', value: `\`${formatIdNumber(caseId)}\``, inline: false },
      { name: 'Action Type', value: '`Warn`', inline: false },
      { name: 'Reason', value: `\`${reason}\``, inline: false },
      { name: 'Logged By', value: `\`${moderatorTag}\``, inline: false }
    )
    .setFooter({ text: 'Empire Moderation System • Warning Logged' })
    .setTimestamp();
}

function buildPunishmentsEmbed(targetUser, rows) {
  const userRows = rows
    .slice(1)
    .filter(row => row[2] === targetUser.id);

  const description = userRows.length
    ? userRows.slice(-10).reverse().map(row => {
        const caseId = formatIdNumber(row[0] || '0');
        const actionType = row[3] || 'Unknown';
        const reason = row[4] || 'No reason provided';
        const moderator = row[5] || 'Unknown';
        const timestamp = row[7] || 'Unknown';

        return `**Case ${caseId}** • \`${actionType}\`\n` +
               `Reason: \`${reason}\`\n` +
               `Moderator: \`${moderator}\`\n` +
               `Time: \`${timestamp}\``;
      }).join('\n\n')
    : 'No punishments found for this user.';

  return new EmbedBuilder()
    .setColor(0x8A0000)
    .setTitle('PUNISHMENT HISTORY')
    .setDescription(`Punishment history for **${targetUser.tag}**\n\n${description}`)
    .setFooter({ text: 'Empire Moderation System • History Lookup' })
    .setTimestamp();
}

function buildRankChangeEmbed(actionType, targetUser, caseId, oldRank, newRank, reason, moderatorTag, moderatorId, roleApplied) {
  return new EmbedBuilder()
    .setColor(0x990000)
    .setTitle('RANK ACTION LOGGED')
    .setDescription(`A rank action has been recorded for **${targetUser.tag}**.`)
    .addFields(
      { name: 'Case ID', value: `\`${formatIdNumber(caseId)}\``, inline: false },
      { name: 'Action Type', value: `\`${actionType}\``, inline: false },
      { name: 'Old Rank', value: `\`${oldRank}\``, inline: false },
      { name: 'New Rank', value: `\`${newRank}\``, inline: false },
      { name: 'Reason', value: `\`${reason}\``, inline: false },
      { name: 'Logged By', value: `\`${moderatorTag}\``, inline: false },
      { name: 'Moderator ID', value: `\`${moderatorId}\``, inline: false },
      { name: 'Discord Role Applied', value: roleApplied ? '`Yes`' : '`No`', inline: false },
    )
    .setFooter({ text: 'Empire Promotion System • Rank Action Logged' })
    .setTimestamp();
}

function buildRankHistoryEmbed(targetUser, rows) {
  const userRows = rows
    .slice(1)
    .filter(row => row[2] === targetUser.id);

  const description = userRows.length
    ? userRows.slice(-10).reverse().map(row => {
        const caseId = formatIdNumber(row[0] || '0');
        const actionType = row[3] || 'Unknown';
        const oldRank = row[4] || 'Unknown';
        const newRank = row[5] || 'Unknown';
        const reason = row[6] || 'No reason provided';
        const moderator = row[7] || 'Unknown';
        const moderatorId = row[8] || 'Unknown';
        const timestamp = row[9] || 'Unknown';

        return `**Case ${caseId}** • \`${actionType}\`\n` +
               `Old Rank: \`${oldRank}\`\n` +
               `New Rank: \`${newRank}\`\n` +
               `Reason: \`${reason}\`\n` +
               `By: \`${moderator}\`\n` +
               `Moderator ID: \`${moderatorId}\`\n` +
               `Time: \`${timestamp}\``;
      }).join('\n\n')
    : 'No rank history found for this user.';

  return new EmbedBuilder()
    .setColor(0x7F0000)
    .setTitle('RANK HISTORY')
    .setDescription(`Rank history for **${targetUser.tag}**\n\n${description}`)
    .setFooter({ text: 'Empire Promotion System • History Lookup' })
    .setTimestamp();
}

function buildRecentRankLogEmbed(title, rows, filterType) {
  const data = rows
    .slice(1)
    .filter(row => row[3] === filterType)
    .slice(-10)
    .reverse();

  const description = data.length
    ? data.map(row => {
        const caseId = formatIdNumber(row[0] || '0');
        const target = row[1] || 'Unknown';
        const oldRank = row[4] || 'Unknown';
        const newRank = row[5] || 'Unknown';
        const moderator = row[7] || 'Unknown';
        const moderatorId = row[8] || 'Unknown';

        return `**Case ${caseId}** • ${target}\n` +
               `\`${oldRank}\` → \`${newRank}\`\n` +
               `By: \`${moderator}\`\n` +
               `Moderator ID: \`${moderatorId}\``;
      }).join('\n\n')
    : `No ${filterType.toLowerCase()} records found.`;

  return new EmbedBuilder()
    .setColor(0x6F0000)
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: 'Empire Promotion System • Recent Activity' })
    .setTimestamp();
}

function buildWhoPromotedEmbed(targetUser, row) {
  return new EmbedBuilder()
    .setColor(0x760000)
    .setTitle('LAST RANK CHANGE')
    .setDescription(`Last recorded rank change for **${targetUser.tag}**`)
    .addFields(
      { name: 'Action Type', value: `\`${row[3] || 'Unknown'}\``, inline: false },
      { name: 'Old Rank', value: `\`${row[4] || 'Unknown'}\``, inline: false },
      { name: 'New Rank', value: `\`${row[5] || 'Unknown'}\``, inline: false },
      { name: 'Reason', value: `\`${row[6] || 'Unknown'}\``, inline: false },
      { name: 'Logged By', value: `\`${row[7] || 'Unknown'}\``, inline: false },
      { name: 'Moderator ID', value: `\`${row[8] || 'Unknown'}\``, inline: false },
      { name: 'Timestamp', value: `\`${row[9] || 'Unknown'}\``, inline: false },
    )
    .setFooter({ text: 'Empire Promotion System • Last Change Lookup' })
    .setTimestamp();
}

function buildUpdateButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('open_update_modal')
      .setLabel('Update Record')
      .setStyle(ButtonStyle.Danger)
  );
}

function buildUpdateModal() {
  const modal = new ModalBuilder()
    .setCustomId('update_modal')
    .setTitle('Update Verification Record');

  const robloxInput = new TextInputBuilder()
    .setCustomId('roblox_username')
    .setLabel('Roblox Username')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(32)
    .setPlaceholder('Enter your Roblox username');

  const row = new ActionRowBuilder().addComponents(robloxInput);
  modal.addComponents(row);

  return modal;
}

async function replyNotBuilt(interaction, commandName) {
  await interaction.reply({
    content: `${commandName} is registered, but its backend has not been wired yet.`,
  });
}

/* ----------------------------- READY ----------------------------- */

client.once('ready', async () => {
  await ensureHeader();
  await ensurePunishmentsHeader();
  await ensureRankHistoryHeader();
  console.log('BOT ONLINE');
});

/* -------------------------- INTERACTIONS -------------------------- */

client.on('interactionCreate', async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      const command = interaction.commandName;

      if (command === 'verify') {
        const member = await interaction.guild.members.fetch(interaction.user.id);
        const role = getRank(member);
        const rows = await getAllRows();
        const existingRowNumber = findUserRow(rows, interaction.user.id);
        const robloxUsername = interaction.options.getString('roblox_username');

        if (existingRowNumber) {
          await interaction.reply({
            content: 'You are already verified. Use /update or press the Update Record button on your verification message.'
          });
          return;
        }

        const idNumber = getNextId(rows);
        const enlistmentStatus = 'Active';

        await addRow([
          idNumber,
          interaction.user.tag,
          interaction.user.id,
          role,
          robloxUsername,
          new Date().toISOString(),
          enlistmentStatus
        ]);

        const embed = buildVerifyEmbed(
          interaction.user.tag,
          idNumber,
          robloxUsername,
          role,
          enlistmentStatus
        );

        await interaction.reply({
          embeds: [embed],
          components: [buildUpdateButton()]
        });
        return;
      }

      if (command === 'update') {
        const member = await interaction.guild.members.fetch(interaction.user.id);
        const role = getRank(member);
        const rows = await getAllRows();
        const existingRowNumber = findUserRow(rows, interaction.user.id);

        if (!existingRowNumber) {
          await interaction.reply({
            content: 'You are not verified yet. Use /verify first.'
          });
          return;
        }

        const robloxUsername = interaction.options.getString('roblox_username');
        const existingRow = rows[existingRowNumber - 1];
        const existingId = existingRow[0];
        const currentStatus = existingRow[6] || 'Active';

        await updateRow(existingRowNumber, [
          existingId,
          interaction.user.tag,
          interaction.user.id,
          role,
          robloxUsername,
          new Date().toISOString(),
          currentStatus
        ]);

        const embed = buildUpdateEmbed(
          interaction.user.tag,
          existingId,
          robloxUsername,
          role,
          currentStatus
        );

        await interaction.reply({
          embeds: [embed],
          components: [buildUpdateButton()]
        });
        return;
      }

      if (command === 'profile') {
        const targetUser = interaction.options.getUser('user');
        const rows = await getAllRows();
        const rowNumber = findUserRow(rows, targetUser.id);

        if (!rowNumber) {
          await interaction.reply({
            content: 'That user does not have a record in the database.'
          });
          return;
        }

        const row = rows[rowNumber - 1];
        await interaction.reply({
          embeds: [buildProfileEmbed(row)]
        });
        return;
      }

      if (command === 'setstatus') {
        const targetUser = interaction.options.getUser('user');
        const newStatus = interaction.options.getString('status');

        const rows = await getAllRows();
        const rowNumber = findUserRow(rows, targetUser.id);

        if (!rowNumber) {
          await interaction.reply({
            content: 'That user is not in the database.'
          });
          return;
        }

        const row = rows[rowNumber - 1];

        await updateRow(rowNumber, [
          row[0] || '',
          row[1] || '',
          row[2] || '',
          row[3] || '',
          row[4] || '',
          new Date().toISOString(),
          newStatus
        ]);

        await interaction.reply({
          content: `${targetUser.tag}'s enlistment status has been set to **${newStatus}**.`
        });
        return;
      }

      if (command === 'status') {
        const targetUser = interaction.options.getUser('user');
        const rows = await getAllRows();
        const rowNumber = findUserRow(rows, targetUser.id);

        if (!rowNumber) {
          await interaction.reply({
            content: 'That user is not in the database.'
          });
          return;
        }

        const row = rows[rowNumber - 1];
        await interaction.reply({
          embeds: [buildStatusEmbed(targetUser, row)]
        });
        return;
      }

      if (command === 'roster') {
        const rows = await getAllRows();
        await interaction.reply({
          embeds: [buildRosterEmbed(rows)]
        });
        return;
      }

      if (command === 'rostercounts') {
        const rows = await getAllRows();
        await interaction.reply({
          embeds: [buildRosterCountsEmbed(rows)]
        });
        return;
      }

      if (command === 'warn') {
        const targetUser = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason');
        const punishmentRows = await getPunishmentRows();
        const caseId = getNextCaseId(punishmentRows);

        await addPunishmentRow([
          caseId,
          targetUser.tag,
          targetUser.id,
          'Warn',
          reason,
          interaction.user.tag,
          interaction.user.id,
          new Date().toISOString()
        ]);

        await interaction.reply({
          embeds: [buildWarnEmbed(targetUser, caseId, reason, interaction.user.tag)]
        });
        return;
      }

      if (command === 'punishments') {
        const targetUser = interaction.options.getUser('user');
        const punishmentRows = await getPunishmentRows();

        await interaction.reply({
          embeds: [buildPunishmentsEmbed(targetUser, punishmentRows)]
        });
        return;
      }

      if (command === 'promote' || command === 'demote' || command === 'setrank') {
        const targetUser = interaction.options.getUser('user');
        const newRankRole = interaction.options.getRole('new_rank');
        const reason = interaction.options.getString('reason');
        const rows = await getAllRows();
        const rowNumber = findUserRow(rows, targetUser.id);

        if (!rowNumber) {
          await interaction.reply({ content: 'That user is not in the personnel database.' });
          return;
        }

        const rankRows = await getRankHistoryRows();
        const caseId = getNextCaseId(rankRows);

        const personnelRow = rows[rowNumber - 1];
        const oldRank = personnelRow[3] || 'Unknown';
        const actionType =
          command === 'promote' ? 'Promote' :
          command === 'demote' ? 'Demote' : 'Set Rank';

        const roleApplied = await tryApplyRoleChange(
          interaction.guild,
          targetUser.id,
          oldRank,
          newRankRole
        );

        await updateRow(rowNumber, [
          personnelRow[0] || '',
          personnelRow[1] || '',
          personnelRow[2] || '',
          newRankRole.name,
          personnelRow[4] || '',
          new Date().toISOString(),
          personnelRow[6] || 'Active'
        ]);

        await addRankHistoryRow([
          caseId,
          targetUser.tag,
          targetUser.id,
          actionType,
          oldRank,
          newRankRole.name,
          reason,
          interaction.user.tag,
          interaction.user.id,
          new Date().toISOString()
        ]);

        await interaction.reply({
          embeds: [buildRankChangeEmbed(
            actionType,
            targetUser,
            caseId,
            oldRank,
            newRankRole.name,
            reason,
            interaction.user.tag,
            interaction.user.id,
            roleApplied
          )]
        });
        return;
      }

      if (command === 'rankhistory') {
        const targetUser = interaction.options.getUser('user');
        const rankRows = await getRankHistoryRows();

        await interaction.reply({
          embeds: [buildRankHistoryEmbed(targetUser, rankRows)]
        });
        return;
      }

      if (command === 'promotionlog') {
        const rankRows = await getRankHistoryRows();
        await interaction.reply({
          embeds: [buildRecentRankLogEmbed('RECENT PROMOTIONS', rankRows, 'Promote')]
        });
        return;
      }

      if (command === 'demotionlog') {
        const rankRows = await getRankHistoryRows();
        await interaction.reply({
          embeds: [buildRecentRankLogEmbed('RECENT DEMOTIONS', rankRows, 'Demote')]
        });
        return;
      }

      if (command === 'who_promoted') {
        const targetUser = interaction.options.getUser('user');
        const rankRows = await getRankHistoryRows();
        const userRows = rankRows.slice(1).filter(row => row[2] === targetUser.id);

        if (!userRows.length) {
          await interaction.reply({ content: 'No rank history found for that user.' });
          return;
        }

        const latest = userRows[userRows.length - 1];
        await interaction.reply({
          embeds: [buildWhoPromotedEmbed(targetUser, latest)]
        });
        return;
      }

      if (command === 'ping') {
        await interaction.reply({ content: 'Pong. Bot is online.' });
        return;
      }

      if (command === 'help') {
        await interaction.reply({
          content:
            '**Empire Bot Commands**\n\n' +
            '`/verify roblox_username:<name>` - first-time verification\n' +
            '`/update roblox_username:<name>` - update your existing record\n' +
            '`/profile user:@member` - show a user database record\n' +
            '`/setstatus user:@member status:<Active/Inactive/LOA/Discharged>` - change enlistment status\n' +
            '`/status user:@member` - show one user enlistment status\n' +
            '`/roster` - show personnel roster\n' +
            '`/rostercounts` - show roster totals\n' +
            '`/warn user:@member reason:<text>` - log a warning\n' +
            '`/punishments user:@member` - show punishment history\n' +
            '`/promote user:@member new_rank:@role reason:<text>` - log a promotion\n' +
            '`/demote user:@member new_rank:@role reason:<text>` - log a demotion\n' +
            '`/setrank user:@member new_rank:@role reason:<text>` - directly set rank\n' +
            '`/rankhistory user:@member` - show rank history\n' +
            '`/promotionlog` - recent promotions\n' +
            '`/demotionlog` - recent demotions\n' +
            '`/who_promoted user:@member` - show last rank changer\n' +
            '`/ping` - bot status\n\n' +
            'Other commands are registered and will be wired next.'
        });
        return;
      }

      if (command === 'stats') {
        const rows = await getAllRows();
        const total = Math.max(rows.length - 1, 0);

        await interaction.reply({
          content: `Current personnel records logged: **${total}**`
        });
        return;
      }

      if (command === 'rankstats') {
        const rows = await getAllRows();
        const counts = {};

        for (const row of rows.slice(1)) {
          const rank = row[3] || 'Unknown';
          counts[rank] = (counts[rank] || 0) + 1;
        }

        const text = Object.entries(counts)
          .sort((a, b) => b[1] - a[1])
          .map(([rank, count]) => `**${rank}:** ${count}`)
          .join('\n');

        await interaction.reply({
          content: text || 'No rank data found.'
        });
        return;
      }

      if (command === 'statusstats') {
        const rows = await getAllRows();
        const counts = {};

        for (const row of rows.slice(1)) {
          const status = row[6] || 'Active';
          counts[status] = (counts[status] || 0) + 1;
        }

        const text = Object.entries(counts)
          .sort((a, b) => b[1] - a[1])
          .map(([status, count]) => `**${status}:** ${count}`)
          .join('\n');

        await interaction.reply({
          content: text || 'No status data found.'
        });
        return;
      }

      if (command === 'finduser') {
        const query = interaction.options.getString('query').toLowerCase();
        const rows = await getAllRows();

        const found = rows.slice(1).find(row =>
          (row[0] || '').toString().toLowerCase() === query ||
          (row[1] || '').toLowerCase().includes(query) ||
          (row[2] || '').toLowerCase() === query ||
          (row[4] || '').toLowerCase().includes(query)
        );

        if (!found) {
          await interaction.reply({ content: 'No matching user was found.' });
          return;
        }

        await interaction.reply({ embeds: [buildProfileEmbed(found)] });
        return;
      }

      if (command === 'idlookup') {
        const id = interaction.options.getInteger('id');
        const rows = await getAllRows();
        const found = rows.slice(1).find(row => Number(row[0]) === id);

        if (!found) {
          await interaction.reply({ content: 'No matching ID number was found.' });
          return;
        }

        await interaction.reply({ embeds: [buildProfileEmbed(found)] });
        return;
      }

      if (command === 'discharge') return replyNotBuilt(interaction, '/discharge');
      if (command === 'loa') return replyNotBuilt(interaction, '/loa');
      if (command === 'return') return replyNotBuilt(interaction, '/return');

      if (command === 'strike') return replyNotBuilt(interaction, '/strike');
      if (command === 'note') return replyNotBuilt(interaction, '/note');
      if (command === 'mute') return replyNotBuilt(interaction, '/mute');
      if (command === 'kick') return replyNotBuilt(interaction, '/kick');
      if (command === 'ban') return replyNotBuilt(interaction, '/ban');
      if (command === 'unban') return replyNotBuilt(interaction, '/unban');
      if (command === 'modhistory') return replyNotBuilt(interaction, '/modhistory');
      if (command === 'clearwarn') return replyNotBuilt(interaction, '/clearwarn');
      if (command === 'cases') return replyNotBuilt(interaction, '/cases');

      if (command === 'event') {
        const sub = interaction.options.getSubcommand();
        return replyNotBuilt(interaction, `/event ${sub}`);
      }

      if (command === 'report') {
        const sub = interaction.options.getSubcommand();
        return replyNotBuilt(interaction, `/report ${sub}`);
      }

      if (command === 'history') return replyNotBuilt(interaction, '/history');
      if (command === 'userinfo') return replyNotBuilt(interaction, '/userinfo');
      if (command === 'audit') return replyNotBuilt(interaction, '/audit');
      if (command === 'staffstats') return replyNotBuilt(interaction, '/staffstats');
      if (command === 'hoststats') return replyNotBuilt(interaction, '/hoststats');
      if (command === 'syncroles') return replyNotBuilt(interaction, '/syncroles');
      if (command === 'syncall') return replyNotBuilt(interaction, '/syncall');
      if (command === 'backup') return replyNotBuilt(interaction, '/backup');
      if (command === 'setup') return replyNotBuilt(interaction, '/setup');
      if (command === 'setlogchannel') return replyNotBuilt(interaction, '/setlogchannel');
      if (command === 'permissions') return replyNotBuilt(interaction, '/permissions');
    }

    if (interaction.isButton()) {
      if (interaction.customId === 'open_update_modal') {
        await interaction.showModal(buildUpdateModal());
        return;
      }
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId === 'update_modal') {
        const robloxUsername = interaction.fields.getTextInputValue('roblox_username');
        const member = await interaction.guild.members.fetch(interaction.user.id);
        const role = getRank(member);
        const rows = await getAllRows();
        const existingRowNumber = findUserRow(rows, interaction.user.id);

        if (!existingRowNumber) {
          await interaction.reply({
            content: 'You are not verified yet. Use /verify first.'
          });
          return;
        }

        const existingRow = rows[existingRowNumber - 1];
        const existingId = existingRow[0];
        const currentStatus = existingRow[6] || 'Active';

        await updateRow(existingRowNumber, [
          existingId,
          interaction.user.tag,
          interaction.user.id,
          role,
          robloxUsername,
          new Date().toISOString(),
          currentStatus
        ]);

        const embed = buildUpdateEmbed(
          interaction.user.tag,
          existingId,
          robloxUsername,
          role,
          currentStatus
        );

        await interaction.reply({
          embeds: [embed],
          components: [buildUpdateButton()]
        });
        return;
      }
    }
  } catch (error) {
    console.error(error);

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: 'Something went wrong while processing that action.'
      }).catch(() => {});
    } else {
      await interaction.reply({
        content: 'Something went wrong while processing that action.'
      }).catch(() => {});
    }
  }
});

/* ------------------------ COMMAND REGISTRATION ------------------------ */

async function start() {
  const commands = [
    new SlashCommandBuilder()
      .setName('verify')
      .setDescription('verify yourself for the first time')
      .addStringOption(o =>
        o.setName('roblox_username')
          .setDescription('roblox username')
          .setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName('update')
      .setDescription('update your existing spreadsheet entry')
      .addStringOption(o =>
        o.setName('roblox_username')
          .setDescription('roblox username')
          .setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName('profile')
      .setDescription('show a user profile')
      .addUserOption(o =>
        o.setName('user')
          .setDescription('user to view')
          .setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName('setstatus')
      .setDescription('change enlistment status')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
      .addUserOption(o =>
        o.setName('user')
          .setDescription('target user')
          .setRequired(true)
      )
      .addStringOption(o =>
        o.setName('status')
          .setDescription('new status')
          .setRequired(true)
          .addChoices(
            { name: 'Active', value: 'Active' },
            { name: 'Inactive', value: 'Inactive' },
            { name: 'LOA', value: 'LOA' },
            { name: 'Discharged', value: 'Discharged' }
          )
      ),

    new SlashCommandBuilder()
      .setName('status')
      .setDescription('show enlistment status for a user')
      .addUserOption(o =>
        o.setName('user')
          .setDescription('user to check')
          .setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName('roster')
      .setDescription('show the roster'),

    new SlashCommandBuilder()
      .setName('rostercounts')
      .setDescription('show roster counts'),

    new SlashCommandBuilder()
      .setName('finduser')
      .setDescription('find a user by id, discord, or roblox')
      .addStringOption(o =>
        o.setName('query')
          .setDescription('search query')
          .setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName('discharge')
      .setDescription('mark a user as discharged')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
      .addUserOption(o =>
        o.setName('user')
          .setDescription('target user')
          .setRequired(true)
      )
      .addStringOption(o =>
        o.setName('reason')
          .setDescription('reason')
          .setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName('loa')
      .setDescription('mark a user as on leave of absence')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
      .addUserOption(o =>
        o.setName('user')
          .setDescription('target user')
          .setRequired(true)
      )
      .addStringOption(o =>
        o.setName('reason')
          .setDescription('reason')
          .setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName('return')
      .setDescription('return a user from LOA')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
      .addUserOption(o =>
        o.setName('user')
          .setDescription('target user')
          .setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName('warn')
      .setDescription('warn a user')
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
      .addUserOption(o =>
        o.setName('user')
          .setDescription('target user')
          .setRequired(true)
      )
      .addStringOption(o =>
        o.setName('reason')
          .setDescription('reason')
          .setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName('strike')
      .setDescription('strike a user')
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
      .addUserOption(o =>
        o.setName('user')
          .setDescription('target user')
          .setRequired(true)
      )
      .addStringOption(o =>
        o.setName('reason')
          .setDescription('reason')
          .setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName('note')
      .setDescription('add an internal note to a user')
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
      .addUserOption(o =>
        o.setName('user')
          .setDescription('target user')
          .setRequired(true)
      )
      .addStringOption(o =>
        o.setName('note')
          .setDescription('note text')
          .setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName('mute')
      .setDescription('mute a user')
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
      .addUserOption(o =>
        o.setName('user')
          .setDescription('target user')
          .setRequired(true)
      )
      .addStringOption(o =>
        o.setName('duration')
          .setDescription('duration, example: 1h')
          .setRequired(true)
      )
      .addStringOption(o =>
        o.setName('reason')
          .setDescription('reason')
          .setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName('kick')
      .setDescription('kick a user')
      .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
      .addUserOption(o =>
        o.setName('user')
          .setDescription('target user')
          .setRequired(true)
      )
      .addStringOption(o =>
        o.setName('reason')
          .setDescription('reason')
          .setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName('ban')
      .setDescription('ban a user')
      .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
      .addUserOption(o =>
        o.setName('user')
          .setDescription('target user')
          .setRequired(true)
      )
      .addStringOption(o =>
        o.setName('reason')
          .setDescription('reason')
          .setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName('unban')
      .setDescription('unban a user')
      .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
      .addStringOption(o =>
        o.setName('userid')
          .setDescription('user id to unban')
          .setRequired(true)
      )
      .addStringOption(o =>
        o.setName('reason')
          .setDescription('reason')
          .setRequired(false)
      ),

    new SlashCommandBuilder()
      .setName('punishments')
      .setDescription('show punishment history for a user')
      .addUserOption(o =>
        o.setName('user')
          .setDescription('target user')
          .setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName('modhistory')
      .setDescription('show full moderation history for a user')
      .addUserOption(o =>
        o.setName('user')
          .setDescription('target user')
          .setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName('clearwarn')
      .setDescription('clear a warning by case id')
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
      .addUserOption(o =>
        o.setName('user')
          .setDescription('target user')
          .setRequired(true)
      )
      .addStringOption(o =>
        o.setName('caseid')
          .setDescription('case id')
          .setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName('cases')
      .setDescription('show all logged cases for a user')
      .addUserOption(o =>
        o.setName('user')
          .setDescription('target user')
          .setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName('promote')
      .setDescription('promote a user')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
      .addUserOption(o =>
        o.setName('user')
          .setDescription('target user')
          .setRequired(true)
      )
      .addRoleOption(o =>
        o.setName('new_rank')
          .setDescription('new rank role')
          .setRequired(true)
      )
      .addStringOption(o =>
        o.setName('reason')
          .setDescription('reason')
          .setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName('demote')
      .setDescription('demote a user')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
      .addUserOption(o =>
        o.setName('user')
          .setDescription('target user')
          .setRequired(true)
      )
      .addRoleOption(o =>
        o.setName('new_rank')
          .setDescription('new rank role')
          .setRequired(true)
      )
      .addStringOption(o =>
        o.setName('reason')
          .setDescription('reason')
          .setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName('setrank')
      .setDescription('directly set a user rank')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
      .addUserOption(o =>
        o.setName('user')
          .setDescription('target user')
          .setRequired(true)
      )
      .addRoleOption(o =>
        o.setName('new_rank')
          .setDescription('new rank role')
          .setRequired(true)
      )
      .addStringOption(o =>
        o.setName('reason')
          .setDescription('reason')
          .setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName('rankhistory')
      .setDescription('show rank history for a user')
      .addUserOption(o =>
        o.setName('user')
          .setDescription('target user')
          .setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName('who_promoted')
      .setDescription('show who last changed a user rank')
      .addUserOption(o =>
        o.setName('user')
          .setDescription('target user')
          .setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName('promotionlog')
      .setDescription('show recent promotions'),

    new SlashCommandBuilder()
      .setName('demotionlog')
      .setDescription('show recent demotions'),

    new SlashCommandBuilder()
      .setName('event')
      .setDescription('event system')
      .addSubcommand(s =>
        s.setName('create')
          .setDescription('create an event')
          .addStringOption(o => o.setName('name').setDescription('event name').setRequired(true))
          .addStringOption(o => o.setName('time').setDescription('event time').setRequired(true))
          .addUserOption(o => o.setName('host').setDescription('event host').setRequired(true))
      )
      .addSubcommand(s =>
        s.setName('start')
          .setDescription('start an event')
          .addStringOption(o => o.setName('name').setDescription('event name').setRequired(true))
      )
      .addSubcommand(s =>
        s.setName('end')
          .setDescription('end an event')
          .addStringOption(o => o.setName('name').setDescription('event name').setRequired(true))
      )
      .addSubcommand(s =>
        s.setName('host')
          .setDescription('log a host for an event')
          .addUserOption(o => o.setName('user').setDescription('host user').setRequired(true))
          .addStringOption(o => o.setName('event').setDescription('event name').setRequired(true))
      )
      .addSubcommand(s =>
        s.setName('attendee')
          .setDescription('add an attendee to an event')
          .addStringOption(o => o.setName('event').setDescription('event name').setRequired(true))
          .addUserOption(o => o.setName('user').setDescription('attendee').setRequired(true))
      )
      .addSubcommand(s =>
        s.setName('attendance')
          .setDescription('show attendance for an event')
          .addStringOption(o => o.setName('event').setDescription('event name').setRequired(true))
      )
      .addSubcommand(s =>
        s.setName('history')
          .setDescription('show event history for a user')
          .addUserOption(o => o.setName('user').setDescription('target user').setRequired(true))
      )
      .addSubcommand(s =>
        s.setName('leaderboard')
          .setDescription('show event host leaderboard')
      )
      .addSubcommand(s =>
        s.setName('report')
          .setDescription('show summary for an event')
          .addStringOption(o => o.setName('event').setDescription('event name').setRequired(true))
      )
      .addSubcommand(s =>
        s.setName('delete')
          .setDescription('delete an event log')
          .addStringOption(o => o.setName('event').setDescription('event name').setRequired(true))
      ),

    new SlashCommandBuilder()
      .setName('report')
      .setDescription('report system')
      .addSubcommand(s =>
        s.setName('submit')
          .setDescription('submit a report')
          .addStringOption(o =>
            o.setName('type')
              .setDescription('report type')
              .setRequired(true)
              .addChoices(
                { name: 'Ranking', value: 'ranking' },
                { name: 'General', value: 'general' },
                { name: 'Moderation', value: 'moderation' },
                { name: 'Event', value: 'event' }
              )
          )
          .addStringOption(o => o.setName('details').setDescription('details').setRequired(true))
      )
      .addSubcommand(s =>
        s.setName('view')
          .setDescription('view a report')
          .addStringOption(o => o.setName('caseid').setDescription('case id').setRequired(true))
      )
      .addSubcommand(s =>
        s.setName('list')
          .setDescription('list reports')
      )
      .addSubcommand(s =>
        s.setName('assign')
          .setDescription('assign a report')
          .addStringOption(o => o.setName('caseid').setDescription('case id').setRequired(true))
          .addUserOption(o => o.setName('staff').setDescription('staff user').setRequired(true))
      )
      .addSubcommand(s =>
        s.setName('close')
          .setDescription('close a report')
          .addStringOption(o => o.setName('caseid').setDescription('case id').setRequired(true))
          .addStringOption(o => o.setName('result').setDescription('result').setRequired(true))
      )
      .addSubcommand(s =>
        s.setName('history')
          .setDescription('show report history for a user')
          .addUserOption(o => o.setName('user').setDescription('target user').setRequired(true))
      )
      .addSubcommand(s =>
        s.setName('reopen')
          .setDescription('reopen a report')
          .addStringOption(o => o.setName('caseid').setDescription('case id').setRequired(true))
      ),

    new SlashCommandBuilder()
      .setName('history')
      .setDescription('show full combined history for a user')
      .addUserOption(o =>
        o.setName('user')
          .setDescription('target user')
          .setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName('idlookup')
      .setDescription('find a user by issued id number')
      .addIntegerOption(o =>
        o.setName('id')
          .setDescription('issued id number')
          .setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName('userinfo')
      .setDescription('show quick user info')
      .addUserOption(o =>
        o.setName('user')
          .setDescription('target user')
          .setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName('audit')
      .setDescription('show all actions involving a user')
      .addUserOption(o =>
        o.setName('user')
          .setDescription('target user')
          .setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName('stats')
      .setDescription('show overall empire stats'),

    new SlashCommandBuilder()
      .setName('staffstats')
      .setDescription('show staff stats'),

    new SlashCommandBuilder()
      .setName('hoststats')
      .setDescription('show host stats'),

    new SlashCommandBuilder()
      .setName('rankstats')
      .setDescription('show rank counts'),

    new SlashCommandBuilder()
      .setName('statusstats')
      .setDescription('show status counts'),

    new SlashCommandBuilder()
      .setName('syncroles')
      .setDescription('refresh a user role in the database')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
      .addUserOption(o =>
        o.setName('user')
          .setDescription('target user')
          .setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName('syncall')
      .setDescription('refresh all users in the database')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    new SlashCommandBuilder()
      .setName('backup')
      .setDescription('export a backup')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
      .setName('ping')
      .setDescription('check bot status'),

    new SlashCommandBuilder()
      .setName('help')
      .setDescription('show command help'),

    new SlashCommandBuilder()
      .setName('setup')
      .setDescription('open the setup panel')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
      .setName('setlogchannel')
      .setDescription('set a log channel')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .addStringOption(o =>
        o.setName('type')
          .setDescription('log type')
          .setRequired(true)
          .addChoices(
            { name: 'Moderation', value: 'moderation' },
            { name: 'Event', value: 'event' },
            { name: 'Promotion', value: 'promotion' },
            { name: 'Report', value: 'report' }
          )
      )
      .addChannelOption(o =>
        o.setName('channel')
          .setDescription('log channel')
          .setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName('permissions')
      .setDescription('set permission level for a role')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .addRoleOption(o =>
        o.setName('role')
          .setDescription('role')
          .setRequired(true)
      )
      .addIntegerOption(o =>
        o.setName('level')
          .setDescription('permission level')
          .setRequired(true)
      ),
  ].map(command => command.toJSON());

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);

  await rest.put(
    Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.DISCORD_GUILD_ID),
    { body: commands }
  );

  client.login(process.env.DISCORD_BOT_TOKEN);
}

start();
