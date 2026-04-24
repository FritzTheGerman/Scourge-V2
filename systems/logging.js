const { getRows, appendRow } = require('../utils/sheets');
const { COMMAND_LOGS_RANGE } = require('../config');
const { getCSTTime } = require('../utils/time');

/* ---------------- HELPERS ---------------- */

function getNextLogId(rows) {
  if (rows.length <= 1) return 1;

  const ids = rows
    .slice(1)
    .map(row => Number(row[0]))
    .filter(id => !Number.isNaN(id));

  return ids.length ? Math.max(...ids) + 1 : 1;
}

function getTopRole(member) {
  const roles = member.roles.cache
    .filter(role => role.name !== '@everyone')
    .sort((a, b) => b.position - a.position);

  return roles.first() || null;
}

function formatOptionValue(option) {
  if (option.user) {
    return `${option.user.tag} (${option.user.id})`;
  }

  if (option.role) {
    return `${option.role.name} (${option.role.id})`;
  }

  if (option.channel) {
    return `${option.channel.name} (${option.channel.id})`;
  }

  if (option.member?.user) {
    return `${option.member.user.tag} (${option.member.user.id})`;
  }

  return option.value ?? 'N/A';
}

function formatOptions(interaction) {
  if (!interaction.options?.data?.length) return 'None';

  return interaction.options.data.map(option => {
    if (option.options?.length) {
      const subOptions = option.options
        .map(sub => `${sub.name}: ${formatOptionValue(sub)}`)
        .join(', ');

      return `${option.name} (${subOptions})`;
    }

    return `${option.name}: ${formatOptionValue(option)}`;
  }).join(' | ');
}

/* ---------------- MAIN ---------------- */

async function logCommand(interaction, result = 'Allowed') {
  if (!interaction.isChatInputCommand()) return;

  const rows = await getRows(COMMAND_LOGS_RANGE);
  const logId = getNextLogId(rows);

  let roleFormatted = 'No Role (N/A)';

  try {
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const topRole = getTopRole(member);

    if (topRole) {
      roleFormatted = `${topRole.name} (${topRole.id})`;
    }
  } catch (error) {
    console.error('Logging role fetch failed:', error);
  }

  const userFormatted = `${interaction.user.tag} (${interaction.user.id})`;
  const overrideMode = (process.env.OVERRIDE_MODE || 'no').toLowerCase();

  await appendRow(COMMAND_LOGS_RANGE, [
    logId,
    userFormatted,
    roleFormatted,
    `/${interaction.commandName}`,
    formatOptions(interaction),
    interaction.channelId || 'Unknown',
    interaction.guildId || 'Unknown',
    overrideMode,
    result,
    getCSTTime()
  ]);
}

module.exports = {
  logCommand
};
