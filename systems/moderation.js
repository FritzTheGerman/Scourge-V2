const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits
} = require('discord.js');

const { getRows, appendRow } = require('../utils/sheets');
const { PUNISHMENTS_RANGE } = require('../config');
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

/* ---------------- EMBEDS ---------------- */

function warnEmbed(targetUser, caseId, reason, moderator) {
  return new EmbedBuilder()
    .setColor(0xAA0000)
    .setTitle('DISCIPLINARY ACTION LOGGED')
    .setDescription(`A warning has been recorded in the Empire Database for **${targetUser.tag}**.`)
    .addFields(
      { name: 'Case ID', value: `\`${formatId(caseId)}\`` },
      { name: 'Action Type', value: '`Warn`' },
      { name: 'Reason', value: `\`${reason}\`` },
      { name: 'Logged By', value: `\`${moderator.tag}\`` },
      { name: 'Moderator ID', value: `\`${moderator.id}\`` }
    )
    .setFooter({ text: 'Empire Moderation System' })
    .setTimestamp();
}

function punishmentsEmbed(targetUser, rows) {
  const userRows = rows.slice(1).filter(row => row[2] === targetUser.id);

  const description = userRows.length
    ? userRows.slice(-10).reverse().map(row => {
        return (
          `**Case ${formatId(row[0] || '0')}** • \`${row[3] || 'Unknown'}\`\n` +
          `Reason: \`${row[4] || 'No reason provided'}\`\n` +
          `Moderator: \`${row[5] || 'Unknown'}\`\n` +
          `Time: \`${row[7] || 'Unknown'}\``
        );
      }).join('\n\n')
    : 'No punishments found for this user.';

  return new EmbedBuilder()
    .setColor(0x8A0000)
    .setTitle('PUNISHMENT HISTORY')
    .setDescription(`Punishment history for **${targetUser.tag}**\n\n${description}`)
    .setFooter({ text: 'Empire Moderation System' })
    .setTimestamp();
}

/* ---------------- COMMANDS ---------------- */

const commands = [
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
        .setDescription('reason for the warning')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('punishments')
    .setDescription('show punishment history for a user')
    .addUserOption(o =>
      o.setName('user')
        .setDescription('target user')
        .setRequired(true)
    )
].map(c => c.toJSON());

/* ---------------- HANDLER ---------------- */

async function handle(interaction) {
  if (!interaction.isChatInputCommand()) return false;

  if (interaction.commandName === 'warn') {
    if (!(await requireLevel(interaction, 2))) return true;

    const targetUser = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason');

    const rows = await getRows(PUNISHMENTS_RANGE);
    const caseId = getNextCaseId(rows);

    await appendRow(PUNISHMENTS_RANGE, [
      caseId,
      targetUser.tag,
      targetUser.id,
      'Warn',
      reason,
      interaction.user.tag,
      interaction.user.id,
      getCSTTime()
    ]);

    await interaction.reply({
      embeds: [warnEmbed(targetUser, caseId, reason, interaction.user)]
    });

    return true;
  }

  if (interaction.commandName === 'punishments') {
    if (!(await requireLevel(interaction, 2))) return true;

    const targetUser = interaction.options.getUser('user');
    const rows = await getRows(PUNISHMENTS_RANGE);

    await interaction.reply({
      embeds: [punishmentsEmbed(targetUser, rows)]
    });

    return true;
  }

  return false;
}

module.exports = {
  commands,
  handle
};
