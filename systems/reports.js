const {
  SlashCommandBuilder,
  EmbedBuilder
} = require('discord.js');

const { getRows, appendRow, updateRow } = require('../utils/sheets');
const { REPORTS_RANGE } = require('../config');
const { requireLevel } = require('../utils/permissions');
const { getCSTTime } = require('../utils/time');

/* ---------------- HELPERS ---------------- */

function formatId(id) {
  return String(id).padStart(4, '0');
}

function getNextCaseId(rows) {
  if (rows.length <= 1) return 1;

  const ids = rows
    .slice(1)
    .map(row => Number(row[0]))
    .filter(id => !Number.isNaN(id));

  return ids.length ? Math.max(...ids) + 1 : 1;
}

function findReportRowByCaseId(rows, caseId) {
  for (let i = 1; i < rows.length; i++) {
    if (Number(rows[i][0]) === Number(caseId)) {
      return i + 1;
    }
  }

  return null;
}

/* ---------------- EMBEDS ---------------- */

function reportSubmitEmbed(caseId, reportType, submittedBy) {
  return new EmbedBuilder()
    .setColor(0x6A0000)
    .setTitle('REPORT SUBMITTED')
    .addFields(
      { name: 'Case ID', value: `\`${formatId(caseId)}\`` },
      { name: 'Report Type', value: `\`${reportType}\`` },
      { name: 'Submitted By', value: `\`${submittedBy.tag}\`` },
      { name: 'Submitted By ID', value: `\`${submittedBy.id}\`` },
      { name: 'Status', value: '`Open`' }
    )
    .setFooter({ text: 'Empire Report System' })
    .setTimestamp();
}

function reportViewEmbed(row) {
  return new EmbedBuilder()
    .setColor(0x6A0000)
    .setTitle('REPORT CASE')
    .addFields(
      { name: 'Case ID', value: `\`${formatId(row[0] || '0')}\`` },
      { name: 'Report Type', value: `\`${row[1] || 'Unknown'}\`` },
      { name: 'Details', value: `\`${row[2] || 'No details'}\`` },
      { name: 'Submitted By Username', value: `\`${row[3] || 'Unknown'}\`` },
      { name: 'Submitted By ID', value: `\`${row[4] || 'Unknown'}\`` },
      { name: 'Assigned Staff Username', value: `\`${row[5] || 'Unassigned'}\`` },
      { name: 'Assigned Staff ID', value: `\`${row[6] || 'Unassigned'}\`` },
      { name: 'Status', value: `\`${row[7] || 'Open'}\`` },
      { name: 'Result', value: `\`${row[8] || 'Pending'}\`` },
      { name: 'Created At', value: `\`${row[9] || 'Unknown'}\`` },
      { name: 'Closed At', value: `\`${row[10] || 'Not Closed'}\`` }
    )
    .setFooter({ text: 'Empire Report System' })
    .setTimestamp();
}

function reportListEmbed(rows) {
  const data = rows.slice(1).slice(-10).reverse();

  const description = data.length
    ? data
        .map(row => {
          const caseId = formatId(row[0] || '0');
          const type = row[1] || 'Unknown';
          const status = row[7] || 'Open';
          const submitter = row[3] || 'Unknown';

          return (
            `**Case ${caseId}** • \`${type}\`\n` +
            `Status: \`${status}\`\n` +
            `Submitted By: \`${submitter}\``
          );
        })
        .join('\n\n')
    : 'No reports found.';

  return new EmbedBuilder()
    .setColor(0x6A0000)
    .setTitle('RECENT REPORTS')
    .setDescription(description)
    .setFooter({ text: 'Empire Report System' })
    .setTimestamp();
}

function reportHistoryEmbed(targetUser, rows) {
  const data = rows
    .slice(1)
    .filter(row =>
      row[4] === targetUser.id ||
      row[6] === targetUser.id
    );

  const description = data.length
    ? data
        .slice(-10)
        .reverse()
        .map(row => {
          const caseId = formatId(row[0] || '0');
          const type = row[1] || 'Unknown';
          const status = row[7] || 'Open';
          const role = row[4] === targetUser.id ? 'Submitter' : 'Assigned Staff';

          return (
            `**Case ${caseId}** • \`${type}\`\n` +
            `Role: \`${role}\`\n` +
            `Status: \`${status}\``
          );
        })
        .join('\n\n')
    : 'No report history found for this user.';

  return new EmbedBuilder()
    .setColor(0x6A0000)
    .setTitle('REPORT HISTORY')
    .setDescription(`Report history for **${targetUser.tag}**\n\n${description}`)
    .setFooter({ text: 'Empire Report System' })
    .setTimestamp();
}

function reportActionEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(0x6A0000)
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: 'Empire Report System' })
    .setTimestamp();
}

/* ---------------- COMMANDS ---------------- */

const commands = [
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
        .addStringOption(o =>
          o.setName('details')
            .setDescription('details')
            .setRequired(true)
        )
    )
    .addSubcommand(s =>
      s.setName('list')
        .setDescription('list recent reports')
    )
    .addSubcommand(s =>
      s.setName('view')
        .setDescription('view a report')
        .addStringOption(o =>
          o.setName('caseid')
            .setDescription('case id')
            .setRequired(true)
        )
    )
    .addSubcommand(s =>
      s.setName('assign')
        .setDescription('assign a report')
        .addStringOption(o =>
          o.setName('caseid')
            .setDescription('case id')
            .setRequired(true)
        )
        .addUserOption(o =>
          o.setName('staff')
            .setDescription('staff user')
            .setRequired(true)
        )
    )
    .addSubcommand(s =>
      s.setName('close')
        .setDescription('close a report')
        .addStringOption(o =>
          o.setName('caseid')
            .setDescription('case id')
            .setRequired(true)
        )
        .addStringOption(o =>
          o.setName('result')
            .setDescription('result')
            .setRequired(true)
        )
    )
    .addSubcommand(s =>
      s.setName('history')
        .setDescription('show report history for a user')
        .addUserOption(o =>
          o.setName('user')
            .setDescription('target user')
            .setRequired(true)
        )
    )
    .addSubcommand(s =>
      s.setName('reopen')
        .setDescription('reopen a report')
        .addStringOption(o =>
          o.setName('caseid')
            .setDescription('case id')
            .setRequired(true)
        )
    )
].map(c => c.toJSON());

/* ---------------- HANDLER ---------------- */

async function handle(interaction) {
  if (!interaction.isChatInputCommand()) return false;
  if (interaction.commandName !== 'report') return false;

  const sub = interaction.options.getSubcommand();
  const rows = await getRows(REPORTS_RANGE);

  /* SUBMIT - LEVEL 0 */
  if (sub === 'submit') {
    const reportType = interaction.options.getString('type');
    const details = interaction.options.getString('details');
    const caseId = getNextCaseId(rows);

    await appendRow(REPORTS_RANGE, [
      caseId,
      reportType,
      details,
      interaction.user.tag,
      interaction.user.id,
      '',
      '',
      'Open',
      '',
      getCSTTime(),
      ''
    ]);

    await interaction.reply({
      embeds: [reportSubmitEmbed(caseId, reportType, interaction.user)]
    });

    return true;
  }

  /* LIST - LEVEL 1 */
  if (sub === 'list') {
    if (!(await requireLevel(interaction, 1))) return true;

    await interaction.reply({
      embeds: [reportListEmbed(rows)]
    });

    return true;
  }

  /* VIEW - LEVEL 1 */
  if (sub === 'view') {
    if (!(await requireLevel(interaction, 1))) return true;

    const caseId = interaction.options.getString('caseid');
    const rowNum = findReportRowByCaseId(rows, caseId);

    if (!rowNum) {
      await interaction.reply({
        content: 'That report case was not found.'
      });
      return true;
    }

    await interaction.reply({
      embeds: [reportViewEmbed(rows[rowNum - 1])]
    });

    return true;
  }

  /* ASSIGN - LEVEL 2 */
  if (sub === 'assign') {
    if (!(await requireLevel(interaction, 2))) return true;

    const caseId = interaction.options.getString('caseid');
    const staff = interaction.options.getUser('staff');
    const rowNum = findReportRowByCaseId(rows, caseId);

    if (!rowNum) {
      await interaction.reply({
        content: 'That report case was not found.'
      });
      return true;
    }

    const row = rows[rowNum - 1];

    await updateRow(`Reports!A${rowNum}:K${rowNum}`, [
      row[0] || '',
      row[1] || '',
      row[2] || '',
      row[3] || '',
      row[4] || '',
      staff.tag,
      staff.id,
      'Assigned',
      row[8] || '',
      row[9] || '',
      row[10] || ''
    ]);

    await interaction.reply({
      embeds: [
        reportActionEmbed(
          'REPORT ASSIGNED',
          `Case **${formatId(caseId)}** has been assigned to **${staff.tag}**.\n\nStaff ID: \`${staff.id}\``
        )
      ]
    });

    return true;
  }

  /* CLOSE - LEVEL 3 */
  if (sub === 'close') {
    if (!(await requireLevel(interaction, 3))) return true;

    const caseId = interaction.options.getString('caseid');
    const result = interaction.options.getString('result');
    const rowNum = findReportRowByCaseId(rows, caseId);

    if (!rowNum) {
      await interaction.reply({
        content: 'That report case was not found.'
      });
      return true;
    }

    const row = rows[rowNum - 1];

    await updateRow(`Reports!A${rowNum}:K${rowNum}`, [
      row[0] || '',
      row[1] || '',
      row[2] || '',
      row[3] || '',
      row[4] || '',
      row[5] || '',
      row[6] || '',
      'Closed',
      result,
      row[9] || '',
      getCSTTime()
    ]);

    await interaction.reply({
      embeds: [
        reportActionEmbed(
          'REPORT CLOSED',
          `Case **${formatId(caseId)}** has been closed.\n\nResult: \`${result}\``
        )
      ]
    });

    return true;
  }

  /* HISTORY - LEVEL 0 */
  if (sub === 'history') {
    const targetUser = interaction.options.getUser('user');

    await interaction.reply({
      embeds: [reportHistoryEmbed(targetUser, rows)]
    });

    return true;
  }

  /* REOPEN - LEVEL 3 */
  if (sub === 'reopen') {
    if (!(await requireLevel(interaction, 3))) return true;

    const caseId = interaction.options.getString('caseid');
    const rowNum = findReportRowByCaseId(rows, caseId);

    if (!rowNum) {
      await interaction.reply({
        content: 'That report case was not found.'
      });
      return true;
    }

    const row = rows[rowNum - 1];

    await updateRow(`Reports!A${rowNum}:K${rowNum}`, [
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
      embeds: [
        reportActionEmbed(
          'REPORT REOPENED',
          `Case **${formatId(caseId)}** has been reopened.`
        )
      ]
    });

    return true;
  }

  return false;
}

module.exports = {
  commands,
  handle
};
