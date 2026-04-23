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
const EVENTS_RANGE = 'Events!A:K';
const REPORTS_RANGE = 'Reports!A:K';

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

async function getEventRows() {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: EVENTS_RANGE,
  });

  return response.data.values || [];
}

async function getReportRows() {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: REPORTS_RANGE,
  });

  return response.data.values || [];
}

async function ensurePersonnelHeader() {
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

async function ensureEventsHeader() {
  const rows = await getEventRows();

  if (rows.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: 'Events!A1:K1',
      valueInputOption: 'RAW',
      requestBody: {
        values: [[
          'Event ID',
          'Event Name',
          'Host Username',
          'Host Discord ID',
          'Event Time',
          'Status',
          'Attendance Count',
          'Attendee IDs',
          'Created By',
          'Created At',
          'Closed At'
        ]]
      }
    });
  }
}

async function ensureReportsHeader() {
  const rows = await getReportRows();

  if (rows.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: 'Reports!A1:K1',
      valueInputOption: 'RAW',
      requestBody: {
        values: [[
          'Case ID',
          'Report Type',
          'Details',
          'Submitted By Username',
          'Submitted By ID',
          'Assigned Staff Username',
          'Assigned Staff ID',
          'Status',
          'Result',
          'Created At',
          'Closed At'
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

  return ids.length ? Math.max(...ids) + 1 : 1;
}

function getNextCaseId(rows) {
  if (rows.length <= 1) return 1;

  const ids = rows
    .slice(1)
    .map(row => Number(row[0]))
    .filter(id => !Number.isNaN(id));

  return ids.length ? Math.max(...ids) + 1 : 1;
}

function getNextEventId(rows) {
  if (rows.length <= 1) return 1;

  const ids = rows
    .slice(1)
    .map(row => Number(row[0]))
    .filter(id => !Number.isNaN(id));

  return ids.length ? Math.max(...ids) + 1 : 1;
}

function findEventRowByName(rows, eventName) {
  const lowered = eventName.toLowerCase();

  for (let i = 1; i < rows.length; i++) {
    if ((rows[i][1] || '').toLowerCase() === lowered) {
      return i + 1;
    }
  }

  return null;
}

function findReportRowByCaseId(rows, caseId) {
  for (let i = 1; i < rows.length; i++) {
    if (Number(rows[i][0]) === Number(caseId)) {
      return i + 1;
    }
  }
  return null;
}

function parseAttendeeIds(cellValue) {
  if (!cellValue) return [];
  return cellValue
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);
}

function stringifyAttendeeIds(ids) {
  return ids.join(', ');
}

async function addPersonnelRow(data) {
  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: PERSONNEL_RANGE,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [data] },
  });
}

async function updatePersonnelRow(rowNumber, data) {
  await sheets.spreadsheets.values.update({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `A${rowNumber}:G${rowNumber}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [data] },
  });
}

async function addPunishmentRow(data) {
  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: PUNISHMENTS_RANGE,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [data] },
  });
}

async function addEventRow(data) {
  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: EVENTS_RANGE,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [data] },
  });
}

async function updateEventRow(rowNumber, data) {
  await sheets.spreadsheets.values.update({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `Events!A${rowNumber}:K${rowNumber}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [data] },
  });
}

async function clearEventRow(rowNumber) {
  await sheets.spreadsheets.values.clear({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `Events!A${rowNumber}:K${rowNumber}`,
  });
}

async function addReportRow(data) {
  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: REPORTS_RANGE,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [data] },
  });
}

async function updateReportRow(rowNumber, data) {
  await sheets.spreadsheets.values.update({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `Reports!A${rowNumber}:K${rowNumber}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [data] },
  });
}

/* ----------------------------- EMBEDS ----------------------------- */

function buildVerifyEmbed(discordName, idNumber, robloxUsername, role, status) {
  return new EmbedBuilder()
    .setColor(0x8B0000)
    .setTitle('EMPIRE DATABASE ENTRY RECORDED')
    .setDescription(
      `Hello **${discordName}**\n\nThe following information has been successfully logged in the Empire Database.`
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
      `Hello **${discordName}**\n\nYour personnel record has been successfully updated in the Empire Database.`
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
      { name: 'Enlistment Status', value: `\`${row[6] || 'Active'}\``, inline: false }
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
      { name: 'Last Updated', value: `\`${row[5] || 'Unknown'}\``, inline: false }
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

        return `**${id}** • ${discordName}\nRank: \`${rank}\`\nRoblox: \`${roblox}\`\nStatus: \`${status}\``;
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
  const userRows = rows.slice(1).filter(row => row[2] === targetUser.id);

  const description = userRows.length
    ? userRows.slice(-10).reverse().map(row => {
        const caseId = formatIdNumber(row[0] || '0');
        const actionType = row[3] || 'Unknown';
        const reason = row[4] || 'No reason provided';
        const moderator = row[5] || 'Unknown';
        const timestamp = row[7] || 'Unknown';

        return `**Case ${caseId}** • \`${actionType}\`\nReason: \`${reason}\`\nModerator: \`${moderator}\`\nTime: \`${timestamp}\``;
      }).join('\n\n')
    : 'No punishments found for this user.';

  return new EmbedBuilder()
    .setColor(0x8A0000)
    .setTitle('PUNISHMENT HISTORY')
    .setDescription(`Punishment history for **${targetUser.tag}**\n\n${description}`)
    .setFooter({ text: 'Empire Moderation System • History Lookup' })
    .setTimestamp();
}

function buildEventCreateEmbed(eventId, eventName, hostUser, eventTime, createdBy) {
  return new EmbedBuilder()
    .setColor(0x8C1D00)
    .setTitle('EVENT RECORD CREATED')
    .addFields(
      { name: 'Event ID', value: `\`${formatIdNumber(eventId)}\``, inline: false },
      { name: 'Event Name', value: `\`${eventName}\``, inline: false },
      { name: 'Host', value: `\`${hostUser.tag}\``, inline: false },
      { name: 'Event Time', value: `\`${eventTime}\``, inline: false },
      { name: 'Status', value: '`Scheduled`', inline: false },
      { name: 'Created By', value: `\`${createdBy}\``, inline: false }
    )
    .setFooter({ text: 'Empire Event System • Event Created' })
    .setTimestamp();
}

function buildEventSimpleEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(0x8C1D00)
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: 'Empire Event System' })
    .setTimestamp();
}

function buildEventReportEmbed(row) {
  const attendeeIds = parseAttendeeIds(row[7] || '');
  return new EmbedBuilder()
    .setColor(0xA13A00)
    .setTitle('EVENT REPORT')
    .addFields(
      { name: 'Event ID', value: `\`${formatIdNumber(row[0] || '0')}\``, inline: false },
      { name: 'Event Name', value: `\`${row[1] || 'Unknown'}\``, inline: false },
      { name: 'Host Username', value: `\`${row[2] || 'Unknown'}\``, inline: false },
      { name: 'Host Discord ID', value: `\`${row[3] || 'Unknown'}\``, inline: false },
      { name: 'Event Time', value: `\`${row[4] || 'Unknown'}\``, inline: false },
      { name: 'Status', value: `\`${row[5] || 'Unknown'}\``, inline: false },
      { name: 'Attendance Count', value: `\`${row[6] || attendeeIds.length}\``, inline: false },
      { name: 'Created By', value: `\`${row[8] || 'Unknown'}\``, inline: false },
      { name: 'Created At', value: `\`${row[9] || 'Unknown'}\``, inline: false },
      { name: 'Closed At', value: `\`${row[10] || 'Not Closed'}\``, inline: false }
    )
    .setFooter({ text: 'Empire Event System • Event Report' })
    .setTimestamp();
}

function buildAttendanceEmbed(eventName, attendeeIds) {
  const description = attendeeIds.length
    ? attendeeIds.map((id, index) => `${index + 1}. \`${id}\``).join('\n')
    : 'No attendees logged.';

  return new EmbedBuilder()
    .setColor(0x9A2C00)
    .setTitle('EVENT ATTENDANCE')
    .setDescription(`Attendance for **${eventName}**\n\n${description}`)
    .addFields(
      { name: 'Attendance Count', value: `\`${attendeeIds.length}\``, inline: false }
    )
    .setFooter({ text: 'Empire Event System • Attendance Log' })
    .setTimestamp();
}

function buildEventHistoryEmbed(targetUser, rows) {
  const data = rows.slice(1).filter(
    row => row[3] === targetUser.id || parseAttendeeIds(row[7] || '').includes(targetUser.id)
  );

  const description = data.length
    ? data.slice(-10).reverse().map(row => {
        const asHost = row[3] === targetUser.id;
        return `**${row[1] || 'Unknown Event'}**\nRole: \`${asHost ? 'Host' : 'Attendee'}\`\nStatus: \`${row[5] || 'Unknown'}\`\nTime: \`${row[4] || 'Unknown'}\``;
      }).join('\n\n')
    : 'No event history found for this user.';

  return new EmbedBuilder()
    .setColor(0x8C1D00)
    .setTitle('EVENT HISTORY')
    .setDescription(`Event history for **${targetUser.tag}**\n\n${description}`)
    .setFooter({ text: 'Empire Event System • History Lookup' })
    .setTimestamp();
}

function buildEventLeaderboardEmbed(rows) {
  const counts = {};

  for (const row of rows.slice(1)) {
    const host = row[2] || 'Unknown';
    counts[host] = (counts[host] || 0) + 1;
  }

  const description = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([host, count], index) => `${index + 1}. **${host}** — \`${count}\` event(s)`)
    .join('\n') || 'No event data found.';

  return new EmbedBuilder()
    .setColor(0x8C1D00)
    .setTitle('EVENT HOST LEADERBOARD')
    .setDescription(description)
    .setFooter({ text: 'Empire Event System • Leaderboard' })
    .setTimestamp();
}

function buildReportSubmitEmbed(caseId, reportType, submittedBy) {
  return new EmbedBuilder()
    .setColor(0x6A0000)
    .setTitle('REPORT SUBMITTED')
    .addFields(
      { name: 'Case ID', value: `\`${formatIdNumber(caseId)}\``, inline: false },
      { name: 'Report Type', value: `\`${reportType}\``, inline: false },
      { name: 'Submitted By', value: `\`${submittedBy}\``, inline: false },
      { name: 'Status', value: '`Open`', inline: false }
    )
    .setFooter({ text: 'Empire Report System • Case Created' })
    .setTimestamp();
}

function buildReportViewEmbed(row) {
  return new EmbedBuilder()
    .setColor(0x6A0000)
    .setTitle('REPORT CASE')
    .addFields(
      { name: 'Case ID', value: `\`${formatIdNumber(row[0] || '0')}\``, inline: false },
      { name: 'Report Type', value: `\`${row[1] || 'Unknown'}\``, inline: false },
      { name: 'Details', value: `\`${row[2] || 'No details'}\``, inline: false },
      { name: 'Submitted By Username', value: `\`${row[3] || 'Unknown'}\``, inline: false },
      { name: 'Submitted By ID', value: `\`${row[4] || 'Unknown'}\``, inline: false },
      { name: 'Assigned Staff Username', value: `\`${row[5] || 'Unassigned'}\``, inline: false },
      { name: 'Assigned Staff ID', value: `\`${row[6] || 'Unassigned'}\``, inline: false },
      { name: 'Status', value: `\`${row[7] || 'Open'}\``, inline: false },
      { name: 'Result', value: `\`${row[8] || 'Pending'}\``, inline: false },
      { name: 'Created At', value: `\`${row[9] || 'Unknown'}\``, inline: false },
      { name: 'Closed At', value: `\`${row[10] || 'Not Closed'}\``, inline: false }
    )
    .setFooter({ text: 'Empire Report System • Case Lookup' })
    .setTimestamp();
}

function buildReportListEmbed(rows) {
  const data = rows.slice(1).slice(-10).reverse();

  const description = data.length
    ? data.map(row => {
        const caseId = formatIdNumber(row[0] || '0');
        const type = row[1] || 'Unknown';
        const status = row[7] || 'Open';
        const submitter = row[3] || 'Unknown';
        return `**Case ${caseId}** • \`${type}\`\nStatus: \`${status}\`\nBy: \`${submitter}\``;
      }).join('\n\n')
    : 'No reports found.';

  return new EmbedBuilder()
    .setColor(0x6A0000)
    .setTitle('RECENT REPORTS')
    .setDescription(description)
    .setFooter({ text: 'Empire Report System • Recent Cases' })
    .setTimestamp();
}

function buildReportHistoryEmbed(targetUser, rows) {
  const data = rows.slice(1).filter(
    row => row[4] === targetUser.id || row[6] === targetUser.id
  );

  const description = data.length
    ? data.slice(-10).reverse().map(row => {
        const caseId = formatIdNumber(row[0] || '0');
        const type = row[1] || 'Unknown';
        const status = row[7] || 'Open';
        const role = row[4] === targetUser.id ? 'Submitter' : 'Assigned Staff';
        return `**Case ${caseId}** • \`${type}\`\nRole: \`${role}\`\nStatus: \`${status}\``;
      }).join('\n\n')
    : 'No report history found for this user.';

  return new EmbedBuilder()
    .setColor(0x6A0000)
    .setTitle('REPORT HISTORY')
    .setDescription(`Report history for **${targetUser.tag}**\n\n${description}`)
    .setFooter({ text: 'Empire Report System • History Lookup' })
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

  modal.addComponents(new ActionRowBuilder().addComponents(robloxInput));
  return modal;
}

async function replyNotBuilt(interaction, commandName) {
  await interaction.reply({
    content: `${commandName} is registered, but its backend has not been wired yet.`,
  });
}

/* ----------------------------- READY ----------------------------- */

client.once('ready', async () => {
  await ensurePersonnelHeader();
  await ensurePunishmentsHeader();
  await ensureEventsHeader();
  await ensureReportsHeader();
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

        await addPersonnelRow([
          idNumber,
          interaction.user.tag,
          interaction.user.id,
          role,
          robloxUsername,
          new Date().toISOString(),
          enlistmentStatus
        ]);

        await interaction.reply({
          embeds: [buildVerifyEmbed(interaction.user.tag, idNumber, robloxUsername, role, enlistmentStatus)],
          components: [buildUpdateButton()]
        });
        return;
      }

      if (command === 'update') {
        const member = await interaction.guild.members.fetch(interaction.user.id);
        let role = getRank(member);
        const rows = await getAllRows();
        const existingRowNumber = findUserRow(rows, interaction.user.id);

        if (!existingRowNumber) {
          await interaction.reply({ content: 'You are not verified yet. Use /verify first.' });
          return;
        }

        const robloxUsername = interaction.options.getString('roblox_username');
        const existingRow = rows[existingRowNumber - 1];
        const existingId = existingRow[0];
        const currentStatus = existingRow[6] || 'Active';

        if (role === 'No Rank' && existingRow[3]) {
          role = existingRow[3];
        }

        await updatePersonnelRow(existingRowNumber, [
          existingId,
          interaction.user.tag,
          interaction.user.id,
          role,
          robloxUsername,
          new Date().toISOString(),
          currentStatus
        ]);

        await interaction.reply({
          embeds: [buildUpdateEmbed(interaction.user.tag, existingId, robloxUsername, role, currentStatus)],
          components: [buildUpdateButton()]
        });
        return;
      }

      if (command === 'profile') {
        const targetUser = interaction.options.getUser('user');
        const rows = await getAllRows();
        const rowNumber = findUserRow(rows, targetUser.id);

        if (!rowNumber) {
          await interaction.reply({ content: 'That user does not have a record in the database.' });
          return;
        }

        await interaction.reply({
          embeds: [buildProfileEmbed(rows[rowNumber - 1])]
        });
        return;
      }

      if (command === 'setstatus') {
        const targetUser = interaction.options.getUser('user');
        const newStatus = interaction.options.getString('status');
        const rows = await getAllRows();
        const rowNumber = findUserRow(rows, targetUser.id);

        if (!rowNumber) {
          await interaction.reply({ content: 'That user is not in the database.' });
          return;
        }

        const row = rows[rowNumber - 1];

        await updatePersonnelRow(rowNumber, [
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
          await interaction.reply({ content: 'That user is not in the database.' });
          return;
        }

        await interaction.reply({
          embeds: [buildStatusEmbed(targetUser, rows[rowNumber - 1])]
        });
        return;
      }

      if (command === 'roster') {
        const rows = await getAllRows();
        await interaction.reply({ embeds: [buildRosterEmbed(rows)] });
        return;
      }

      if (command === 'rostercounts') {
        const rows = await getAllRows();
        await interaction.reply({ embeds: [buildRosterCountsEmbed(rows)] });
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

      if (command === 'event') {
        const sub = interaction.options.getSubcommand();
        const eventRows = await getEventRows();

        if (sub === 'create') {
          const name = interaction.options.getString('name');
          const time = interaction.options.getString('time');
          const host = interaction.options.getUser('host');

          const existing = findEventRowByName(eventRows, name);
          if (existing) {
            await interaction.reply({ content: 'An event with that exact name already exists.' });
            return;
          }

          const eventId = getNextEventId(eventRows);

          await addEventRow([
            eventId,
            name,
            host.tag,
            host.id,
            time,
            'Scheduled',
            0,
            '',
            interaction.user.tag,
            new Date().toISOString(),
            ''
          ]);

          await interaction.reply({
            embeds: [buildEventCreateEmbed(eventId, name, host, time, interaction.user.tag)]
          });
          return;
        }

        if (sub === 'start') {
          const name = interaction.options.getString('name');
          const rowNumber = findEventRowByName(eventRows, name);

          if (!rowNumber) {
            await interaction.reply({ content: 'That event was not found.' });
            return;
          }

          const row = eventRows[rowNumber - 1];
          row[5] = 'Active';

          await updateEventRow(rowNumber, [
            row[0] || '',
            row[1] || '',
            row[2] || '',
            row[3] || '',
            row[4] || '',
            row[5] || 'Active',
            row[6] || 0,
            row[7] || '',
            row[8] || '',
            row[9] || '',
            row[10] || ''
          ]);

          await interaction.reply({
            embeds: [buildEventSimpleEmbed('EVENT STARTED', `Event **${name}** is now marked as \`Active\`.`)]
          });
          return;
        }

        if (sub === 'end') {
          const name = interaction.options.getString('name');
          const rowNumber = findEventRowByName(eventRows, name);

          if (!rowNumber) {
            await interaction.reply({ content: 'That event was not found.' });
            return;
          }

          const row = eventRows[rowNumber - 1];
          row[5] = 'Closed';
          row[10] = new Date().toISOString();

          await updateEventRow(rowNumber, [
            row[0] || '',
            row[1] || '',
            row[2] || '',
            row[3] || '',
            row[4] || '',
            row[5] || 'Closed',
            row[6] || 0,
            row[7] || '',
            row[8] || '',
            row[9] || '',
            row[10] || ''
          ]);

          await interaction.reply({
            embeds: [buildEventSimpleEmbed('EVENT CLOSED', `Event **${name}** has been closed.`)]
          });
          return;
        }

        if (sub === 'host') {
          const name = interaction.options.getString('event');
          const hostUser = interaction.options.getUser('user');
          const rowNumber = findEventRowByName(eventRows, name);

          if (!rowNumber) {
            await interaction.reply({ content: 'That event was not found.' });
            return;
          }

          const row = eventRows[rowNumber - 1];
          row[2] = hostUser.tag;
          row[3] = hostUser.id;

          await updateEventRow(rowNumber, [
            row[0] || '',
            row[1] || '',
            row[2] || '',
            row[3] || '',
            row[4] || '',
            row[5] || '',
            row[6] || 0,
            row[7] || '',
            row[8] || '',
            row[9] || '',
            row[10] || ''
          ]);

          await interaction.reply({
            embeds: [buildEventSimpleEmbed('EVENT HOST UPDATED', `Host for **${name}** is now **${hostUser.tag}**.`)]
          });
          return;
        }

        if (sub === 'attendee') {
          const name = interaction.options.getString('event');
          const attendeeUser = interaction.options.getUser('user');
          const rowNumber = findEventRowByName(eventRows, name);

          if (!rowNumber) {
            await interaction.reply({ content: 'That event was not found.' });
            return;
          }

          const row = eventRows[rowNumber - 1];
          const attendeeIds = parseAttendeeIds(row[7] || '');

          if (!attendeeIds.includes(attendeeUser.id)) {
            attendeeIds.push(attendeeUser.id);
          }

          row[6] = attendeeIds.length;
          row[7] = stringifyAttendeeIds(attendeeIds);

          await updateEventRow(rowNumber, [
            row[0] || '',
            row[1] || '',
            row[2] || '',
            row[3] || '',
            row[4] || '',
            row[5] || '',
            row[6] || 0,
            row[7] || '',
            row[8] || '',
            row[9] || '',
            row[10] || ''
          ]);

          await interaction.reply({
            embeds: [buildEventSimpleEmbed('ATTENDEE LOGGED', `**${attendeeUser.tag}** has been added to **${name}**.`)]
          });
          return;
        }

        if (sub === 'attendance') {
          const name = interaction.options.getString('event');
          const rowNumber = findEventRowByName(eventRows, name);

          if (!rowNumber) {
            await interaction.reply({ content: 'That event was not found.' });
            return;
          }

          const row = eventRows[rowNumber - 1];
          const attendeeIds = parseAttendeeIds(row[7] || '');

          await interaction.reply({
            embeds: [buildAttendanceEmbed(name, attendeeIds)]
          });
          return;
        }

        if (sub === 'history') {
          const targetUser = interaction.options.getUser('user');
          await interaction.reply({
            embeds: [buildEventHistoryEmbed(targetUser, eventRows)]
          });
          return;
        }

        if (sub === 'leaderboard') {
          await interaction.reply({
            embeds: [buildEventLeaderboardEmbed(eventRows)]
          });
          return;
        }

        if (sub === 'report') {
          const name = interaction.options.getString('event');
          const rowNumber = findEventRowByName(eventRows, name);

          if (!rowNumber) {
            await interaction.reply({ content: 'That event was not found.' });
            return;
          }

          await interaction.reply({
            embeds: [buildEventReportEmbed(eventRows[rowNumber - 1])]
          });
          return;
        }

        if (sub === 'delete') {
          const name = interaction.options.getString('event');
          const rowNumber = findEventRowByName(eventRows, name);

          if (!rowNumber) {
            await interaction.reply({ content: 'That event was not found.' });
            return;
          }

          await clearEventRow(rowNumber);

          await interaction.reply({
            embeds: [buildEventSimpleEmbed('EVENT RECORD DELETED', `The event record for **${name}** has been cleared.`)]
          });
          return;
        }
      }

      if (command === 'report') {
        const sub = interaction.options.getSubcommand();
        const reportRows = await getReportRows();

        if (sub === 'submit') {
          const reportType = interaction.options.getString('type');
          const details = interaction.options.getString('details');
          const caseId = getNextCaseId(reportRows);

          await addReportRow([
            caseId,
            reportType,
            details,
            interaction.user.tag,
            interaction.user.id,
            '',
            '',
            'Open',
            '',
            new Date().toISOString(),
            ''
          ]);

          await interaction.reply({
            embeds: [buildReportSubmitEmbed(caseId, reportType, interaction.user.tag)]
          });
          return;
        }

        if (sub === 'list') {
          await interaction.reply({
            embeds: [buildReportListEmbed(reportRows)]
          });
          return;
        }

        if (sub === 'view') {
          const caseId = interaction.options.getString('caseid');
          const rowNumber = findReportRowByCaseId(reportRows, caseId);

          if (!rowNumber) {
            await interaction.reply({ content: 'That report case was not found.' });
            return;
          }

          await interaction.reply({
            embeds: [buildReportViewEmbed(reportRows[rowNumber - 1])]
          });
          return;
        }

        if (sub === 'assign') {
          const caseId = interaction.options.getString('caseid');
          const staff = interaction.options.getUser('staff');
          const rowNumber = findReportRowByCaseId(reportRows, caseId);

          if (!rowNumber) {
            await interaction.reply({ content: 'That report case was not found.' });
            return;
          }

          const row = reportRows[rowNumber - 1];
          row[5] = staff.tag;
          row[6] = staff.id;
          row[7] = row[7] || 'Assigned';

          await updateReportRow(rowNumber, [
            row[0] || '',
            row[1] || '',
            row[2] || '',
            row[3] || '',
            row[4] || '',
            row[5] || '',
            row[6] || '',
            'Assigned',
            row[8] || '',
            row[9] || '',
            row[10] || ''
          ]);

          await interaction.reply({
            content: `Case **${formatIdNumber(caseId)}** has been assigned to **${staff.tag}**.`
          });
          return;
        }

        if (sub === 'close') {
          const caseId = interaction.options.getString('caseid');
          const result = interaction.options.getString('result');
          const rowNumber = findReportRowByCaseId(reportRows, caseId);

          if (!rowNumber) {
            await interaction.reply({ content: 'That report case was not found.' });
            return;
          }

          const row = reportRows[rowNumber - 1];
          row[7] = 'Closed';
          row[8] = result;
          row[10] = new Date().toISOString();

          await updateReportRow(rowNumber, [
            row[0] || '',
            row[1] || '',
            row[2] || '',
            row[3] || '',
            row[4] || '',
            row[5] || '',
            row[6] || '',
            'Closed',
            row[8] || '',
            row[9] || '',
            row[10] || ''
          ]);

          await interaction.reply({
            content: `Case **${formatIdNumber(caseId)}** has been closed.`
          });
          return;
        }

        if (sub === 'history') {
          const targetUser = interaction.options.getUser('user');

          await interaction.reply({
            embeds: [buildReportHistoryEmbed(targetUser, reportRows)]
          });
          return;
        }

        if (sub === 'reopen') {
          const caseId = interaction.options.getString('caseid');
          const rowNumber = findReportRowByCaseId(reportRows, caseId);

          if (!rowNumber) {
            await interaction.reply({ content: 'That report case was not found.' });
            return;
          }

          const row = reportRows[rowNumber - 1];
          row[7] = 'Open';
          row[10] = '';

          await updateReportRow(rowNumber, [
            row[0] || '',
            row[1] || '',
            row[2] || '',
            row[3] || '',
            row[4] || '',
            row[5] || '',
            row[6] || '',
            'Open',
            row[8] || '',
            row[9] || '',
            ''
          ]);

          await interaction.reply({
            content: `Case **${formatIdNumber(caseId)}** has been reopened.`
          });
          return;
        }
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
            '`/profile user:@member`\n' +
            '`/setstatus user:@member status:<Active/Inactive/LOA/Discharged>`\n' +
            '`/status user:@member`\n' +
            '`/roster`\n' +
            '`/rostercounts`\n' +
            '`/warn user:@member reason:<text>`\n' +
            '`/punishments user:@member`\n' +
            '`/event create name:<text> time:<text> host:@user`\n' +
            '`/event start name:<text>`\n' +
            '`/event end name:<text>`\n' +
            '`/event host user:@user event:<text>`\n' +
            '`/event attendee event:<text> user:@user`\n' +
            '`/event attendance event:<text>`\n' +
            '`/event history user:@user`\n' +
            '`/event leaderboard`\n' +
            '`/event report event:<text>`\n' +
            '`/event delete event:<text>`\n' +
            '`/report submit type:<text> details:<text>`\n' +
            '`/report list`\n' +
            '`/report view caseid:<id>`\n' +
            '`/report assign caseid:<id> staff:@user`\n' +
            '`/report close caseid:<id> result:<text>`\n' +
            '`/report history user:@user`\n' +
            '`/report reopen caseid:<id>`\n' +
            '`/ping`'
        });
        return;
      }

      if (command === 'stats') {
        const rows = await getAllRows();
        const total = Math.max(rows.length - 1, 0);
        await interaction.reply({ content: `Current personnel records logged: **${total}**` });
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

        await interaction.reply({ content: text || 'No rank data found.' });
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

        await interaction.reply({ content: text || 'No status data found.' });
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
      if (command === 'promote') return replyNotBuilt(interaction, '/promote');
      if (command === 'demote') return replyNotBuilt(interaction, '/demote');
      if (command === 'setrank') return replyNotBuilt(interaction, '/setrank');
      if (command === 'rankhistory') return replyNotBuilt(interaction, '/rankhistory');
      if (command === 'promotionlog') return replyNotBuilt(interaction, '/promotionlog');
      if (command === 'demotionlog') return replyNotBuilt(interaction, '/demotionlog');
      if (command === 'who_promoted') return replyNotBuilt(interaction, '/who_promoted');
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
        let role = getRank(member);
        const rows = await getAllRows();
        const existingRowNumber = findUserRow(rows, interaction.user.id);

        if (!existingRowNumber) {
          await interaction.reply({ content: 'You are not verified yet. Use /verify first.' });
          return;
        }

        const existingRow = rows[existingRowNumber - 1];
        const existingId = existingRow[0];
        const currentStatus = existingRow[6] || 'Active';

        if (role === 'No Rank' && existingRow[3]) {
          role = existingRow[3];
        }

        await updatePersonnelRow(existingRowNumber, [
          existingId,
          interaction.user.tag,
          interaction.user.id,
          role,
          robloxUsername,
          new Date().toISOString(),
          currentStatus
        ]);

        await interaction.reply({
          embeds: [buildUpdateEmbed(interaction.user.tag, existingId, robloxUsername, role, currentStatus)],
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
      .setName('punishments')
      .setDescription('show punishment history for a user')
      .addUserOption(o =>
        o.setName('user')
          .setDescription('target user')
          .setRequired(true)
      ),

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
                { name: 'ranking', value: 'ranking' },
                { name: 'general', value: 'general' },
                { name: 'moderation', value: 'moderation' },
                { name: 'event', value: 'event' }
              )
          )
          .addStringOption(o => o.setName('details').setDescription('details').setRequired(true))
      )
      .addSubcommand(s =>
        s.setName('list')
          .setDescription('list reports')
      )
      .addSubcommand(s =>
        s.setName('view')
          .setDescription('view a report')
          .addStringOption(o => o.setName('caseid').setDescription('case id').setRequired(true))
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
      .setName('stats')
      .setDescription('show overall empire stats'),

    new SlashCommandBuilder()
      .setName('rankstats')
      .setDescription('show rank counts'),

    new SlashCommandBuilder()
      .setName('statusstats')
      .setDescription('show status counts'),

    new SlashCommandBuilder()
      .setName('idlookup')
      .setDescription('find a user by issued id number')
      .addIntegerOption(o =>
        o.setName('id')
          .setDescription('issued id number')
          .setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName('ping')
      .setDescription('check bot status'),

    new SlashCommandBuilder()
      .setName('help')
      .setDescription('show command help'),
  ].map(command => command.toJSON());

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);

  await rest.put(
    Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.DISCORD_GUILD_ID),
    { body: commands }
  );

  client.login(process.env.DISCORD_BOT_TOKEN);
}

start();
