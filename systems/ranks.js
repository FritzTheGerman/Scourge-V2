const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits
} = require('discord.js');

const { getRows, appendRow, updateRow } = require('../utils/sheets');
const { PERSONNEL_RANGE, RANK_HISTORY_RANGE } = require('../config');

/* ---------------- HELPERS ---------------- */

function formatId(id) {
  return String(id).padStart(4, '0');
}

function findUserRow(rows, discordId) {
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][2] === discordId) return i + 1;
  }
  return null;
}

function getNextCaseId(rows) {
  if (rows.length <= 1) return 1;

  const ids = rows
    .slice(1)
    .map(row => Number(row[0]))
    .filter(id => !Number.isNaN(id));

  return ids.length ? Math.max(...ids) + 1 : 1;
}

async function applyRankRole(guild, userId, oldRankName, newRole) {
  try {
    const member = await guild.members.fetch(userId);

    if (oldRankName && oldRankName !== 'No Rank' && oldRankName !== '@everyone') {
      const oldRole = guild.roles.cache.find(role => role.name === oldRankName);

      if (oldRole && member.roles.cache.has(oldRole.id)) {
        await member.roles.remove(oldRole);
      }
    }

    if (newRole.name !== '@everyone' && !member.roles.cache.has(newRole.id)) {
      await member.roles.add(newRole);
    }

    return true;
  } catch (error) {
    console.error('Rank role change failed:', error);
    return false;
  }
}

/* ---------------- EMBEDS ---------------- */

function rankChangeEmbed(actionType, targetUser, caseId, oldRank, newRank, reason, moderator, roleApplied) {
  return new EmbedBuilder()
    .setColor(0x990000)
    .setTitle('RANK ACTION LOGGED')
    .setDescription(`A rank action has been recorded for **${targetUser.tag}**.`)
    .addFields(
      { name: 'Case ID', value: `\`${formatId(caseId)}\`` },
      { name: 'Action Type', value: `\`${actionType}\`` },
      { name: 'Old Rank', value: `\`${oldRank}\`` },
      { name: 'New Rank', value: `\`${newRank}\`` },
      { name: 'Reason', value: `\`${reason}\`` },
      { name: 'Logged By', value: `\`${moderator.tag}\`` },
      { name: 'Moderator ID', value: `\`${moderator.id}\`` },
      { name: 'Discord Role Applied', value: roleApplied ? '`Yes`' : '`No`' }
    )
    .setFooter({ text: 'Empire Promotion System' })
    .setTimestamp();
}

function rankHistoryEmbed(targetUser, rows) {
  const userRows = rows
    .slice(1)
    .filter(row => row[2] === targetUser.id);

  const description = userRows.length
    ? userRows
        .slice(-10)
        .reverse()
        .map(row => {
          const caseId = formatId(row[0] || '0');
          const actionType = row[3] || 'Unknown';
          const oldRank = row[4] || 'Unknown';
          const newRank = row[5] || 'Unknown';
          const reason = row[6] || 'No reason provided';
          const moderator = row[7] || 'Unknown';
          const moderatorId = row[8] || 'Unknown';
          const timestamp = row[9] || 'Unknown';

          return (
            `**Case ${caseId}** • \`${actionType}\`\n` +
            `Old Rank: \`${oldRank}\`\n` +
            `New Rank: \`${newRank}\`\n` +
            `Reason: \`${reason}\`\n` +
            `By: \`${moderator}\`\n` +
            `Moderator ID: \`${moderatorId}\`\n` +
            `Time: \`${timestamp}\``
          );
        })
        .join('\n\n')
    : 'No rank history found for this user.';

  return new EmbedBuilder()
    .setColor(0x7F0000)
    .setTitle('RANK HISTORY')
    .setDescription(`Rank history for **${targetUser.tag}**\n\n${description}`)
    .setFooter({ text: 'Empire Promotion System' })
    .setTimestamp();
}

function recentRankLogEmbed(title, rows, filterType) {
  const data = rows
    .slice(1)
    .filter(row => row[3] === filterType)
    .slice(-10)
    .reverse();

  const description = data.length
    ? data
        .map(row => {
          const caseId = formatId(row[0] || '0');
          const target = row[1] || 'Unknown';
          const oldRank = row[4] || 'Unknown';
          const newRank = row[5] || 'Unknown';
          const moderator = row[7] || 'Unknown';
          const moderatorId = row[8] || 'Unknown';

          return (
            `**Case ${caseId}** • ${target}\n` +
            `\`${oldRank}\` → \`${newRank}\`\n` +
            `By: \`${moderator}\`\n` +
            `Moderator ID: \`${moderatorId}\``
          );
        })
        .join('\n\n')
    : `No ${filterType.toLowerCase()} records found.`;

  return new EmbedBuilder()
    .setColor(0x6F0000)
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: 'Empire Promotion System' })
    .setTimestamp();
}

function whoPromotedEmbed(targetUser, row) {
  return new EmbedBuilder()
    .setColor(0x760000)
    .setTitle('LAST RANK CHANGE')
    .setDescription(`Last recorded rank change for **${targetUser.tag}**`)
    .addFields(
      { name: 'Action Type', value: `\`${row[3] || 'Unknown'}\`` },
      { name: 'Old Rank', value: `\`${row[4] || 'Unknown'}\`` },
      { name: 'New Rank', value: `\`${row[5] || 'Unknown'}\`` },
      { name: 'Reason', value: `\`${row[6] || 'Unknown'}\`` },
      { name: 'Logged By', value: `\`${row[7] || 'Unknown'}\`` },
      { name: 'Moderator ID', value: `\`${row[8] || 'Unknown'}\`` },
      { name: 'Timestamp', value: `\`${row[9] || 'Unknown'}\`` }
    )
    .setFooter({ text: 'Empire Promotion System' })
    .setTimestamp();
}

/* ---------------- COMMANDS ---------------- */

const commands = [
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
    .setName('promotionlog')
    .setDescription('show recent promotions'),

  new SlashCommandBuilder()
    .setName('demotionlog')
    .setDescription('show recent demotions'),

  new SlashCommandBuilder()
    .setName('who_promoted')
    .setDescription('show who last changed a user rank')
    .addUserOption(o =>
      o.setName('user')
        .setDescription('target user')
        .setRequired(true)
    )
].map(c => c.toJSON());

/* ---------------- HANDLER ---------------- */

async function handle(interaction) {
  if (!interaction.isChatInputCommand()) return false;

  /* PROMOTE / DEMOTE / SETRANK */
  if (
    interaction.commandName === 'promote' ||
    interaction.commandName === 'demote' ||
    interaction.commandName === 'setrank'
  ) {
    const targetUser = interaction.options.getUser('user');
    const newRankRole = interaction.options.getRole('new_rank');
    const reason = interaction.options.getString('reason');

    if (newRankRole.name === '@everyone') {
      await interaction.reply({
        content: 'You cannot use @everyone as a rank role. Use a real rank role instead.'
      });
      return true;
    }

    const personnelRows = await getRows(PERSONNEL_RANGE);
    const rowNum = findUserRow(personnelRows, targetUser.id);

    if (!rowNum) {
      await interaction.reply({
        content: 'That user is not in the personnel database.'
      });
      return true;
    }

    const rankRows = await getRows(RANK_HISTORY_RANGE);
    const caseId = getNextCaseId(rankRows);
    const personnelRow = personnelRows[rowNum - 1];

    const oldRank = personnelRow[3] || 'Unknown';

    const actionType =
      interaction.commandName === 'promote'
        ? 'Promote'
        : interaction.commandName === 'demote'
          ? 'Demote'
          : 'Set Rank';

    const roleApplied = await applyRankRole(
      interaction.guild,
      targetUser.id,
      oldRank,
      newRankRole
    );

    await updateRow(`A${rowNum}:G${rowNum}`, [
      personnelRow[0] || '',
      personnelRow[1] || '',
      personnelRow[2] || '',
      newRankRole.name,
      personnelRow[4] || '',
      new Date().toISOString(),
      personnelRow[6] || 'Active'
    ]);

    await appendRow(RANK_HISTORY_RANGE, [
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
      embeds: [
        rankChangeEmbed(
          actionType,
          targetUser,
          caseId,
          oldRank,
          newRankRole.name,
          reason,
          interaction.user,
          roleApplied
        )
      ]
    });

    return true;
  }

  /* RANK HISTORY */
  if (interaction.commandName === 'rankhistory') {
    const targetUser = interaction.options.getUser('user');
    const rows = await getRows(RANK_HISTORY_RANGE);

    await interaction.reply({
      embeds: [rankHistoryEmbed(targetUser, rows)]
    });

    return true;
  }

  /* PROMOTION LOG */
  if (interaction.commandName === 'promotionlog') {
    const rows = await getRows(RANK_HISTORY_RANGE);

    await interaction.reply({
      embeds: [recentRankLogEmbed('RECENT PROMOTIONS', rows, 'Promote')]
    });

    return true;
  }

  /* DEMOTION LOG */
  if (interaction.commandName === 'demotionlog') {
    const rows = await getRows(RANK_HISTORY_RANGE);

    await interaction.reply({
      embeds: [recentRankLogEmbed('RECENT DEMOTIONS', rows, 'Demote')]
    });

    return true;
  }

  /* WHO PROMOTED */
  if (interaction.commandName === 'who_promoted') {
    const targetUser = interaction.options.getUser('user');
    const rows = await getRows(RANK_HISTORY_RANGE);

    const userRows = rows
      .slice(1)
      .filter(row => row[2] === targetUser.id);

    if (!userRows.length) {
      await interaction.reply({
        content: 'No rank history found for that user.'
      });
      return true;
    }

    const latest = userRows[userRows.length - 1];

    await interaction.reply({
      embeds: [whoPromotedEmbed(targetUser, latest)]
    });

    return true;
  }

  return false;
}

module.exports = {
  commands,
  handle
};
