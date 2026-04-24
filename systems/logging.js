const { getRows, appendRow } = require('../utils/sheets');
const { COMMAND_LOGS_RANGE } = require('../config');

function getNextLogId(rows) {
  if (rows.length <= 1) return 1;

  const ids = rows
    .slice(1)
    .map(row => Number(row[0]))
    .filter(id => !Number.isNaN(id));

  return ids.length ? Math.max(...ids) + 1 : 1;
}

function formatOptions(interaction) {
  if (!interaction.options?.data?.length) return 'None';

  return interaction.options.data.map(option => {
    if (option.options?.length) {
      const subOptions = option.options
        .map(sub => `${sub.name}: ${sub.value ?? 'N/A'}`)
        .join(', ');

      return `${option.name} (${subOptions})`;
    }

    return `${option.name}: ${option.value ?? 'N/A'}`;
  }).join(' | ');
}

async function logCommand(interaction) {
  if (!interaction.isChatInputCommand()) return;

  const rows = await getRows(COMMAND_LOGS_RANGE);
  const logId = getNextLogId(rows);

  await appendRow(COMMAND_LOGS_RANGE, [
    logId,
    interaction.user.tag,
    interaction.user.id,
    `/${interaction.commandName}`,
    formatOptions(interaction),
    interaction.channelId || 'Unknown',
    interaction.guildId || 'Unknown',
    new Date().toISOString()
  ]);
}

module.exports = {
  logCommand
};
