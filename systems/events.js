const {
  SlashCommandBuilder,
  EmbedBuilder
} = require('discord.js');

const { getRows, appendRow, updateRow, clearRange } = require('../utils/sheets');
const { EVENTS_RANGE } = require('../config');
const { requireLevel } = require('../utils/permissions');
const { getCSTTime } = require('../utils/time');

/* ---------------- HELPERS ---------------- */

function formatId(id) {
  return String(id).padStart(4, '0');
}

function getNextEventId(rows) {
  if (rows.length <= 1) return 1;

  const ids = rows
    .slice(1)
    .map(row => Number(row[0]))
    .filter(id => !Number.isNaN(id));

  return ids.length ? Math.max(...ids) + 1 : 1;
}

function findEventRowByName(rows, name) {
  const lowered = name.toLowerCase();

  for (let i = 1; i < rows.length; i++) {
    if ((rows[i][1] || '').toLowerCase() === lowered) {
      return i + 1;
    }
  }

  return null;
}

function parseAttendees(str) {
  if (!str) return [];
  return str.split(',').map(v => v.trim()).filter(Boolean);
}

function stringifyAttendees(arr) {
  return arr.join(', ');
}

/* ---------------- EMBEDS ---------------- */

function simpleEmbed(title, desc) {
  return new EmbedBuilder()
    .setColor(0x8C1D00)
    .setTitle(title)
    .setDescription(desc)
    .setFooter({ text: 'Event System' })
    .setTimestamp();
}

/* ---------------- COMMANDS ---------------- */

const commands = [
  new SlashCommandBuilder()
    .setName('event')
    .setDescription('event system')

    .addSubcommand(s =>
      s.setName('create')
        .setDescription('create event')
        .addStringOption(o => o.setName('name').setRequired(true))
        .addStringOption(o => o.setName('time').setRequired(true))
        .addUserOption(o => o.setName('host').setRequired(true))
    )

    .addSubcommand(s =>
      s.setName('start')
        .addStringOption(o => o.setName('name').setRequired(true))
    )

    .addSubcommand(s =>
      s.setName('end')
        .addStringOption(o => o.setName('name').setRequired(true))
    )

    .addSubcommand(s =>
      s.setName('attendee')
        .addStringOption(o => o.setName('event').setRequired(true))
        .addUserOption(o => o.setName('user').setRequired(true))
    )

    .addSubcommand(s =>
      s.setName('attendance')
        .addStringOption(o => o.setName('event').setRequired(true))
    )

    .addSubcommand(s =>
      s.setName('delete')
        .addStringOption(o => o.setName('event').setRequired(true))
    )

].map(c => c.toJSON());

/* ---------------- HANDLER ---------------- */

async function handle(interaction) {
  if (!interaction.isChatInputCommand()) return false;
  if (interaction.commandName !== 'event') return false;

  const sub = interaction.options.getSubcommand();
  const rows = await getRows(EVENTS_RANGE);

  /* CREATE */
  if (sub === 'create') {
    if (!(await requireLevel(interaction, 3))) return true;

    const name = interaction.options.getString('name');
    const time = interaction.options.getString('time');
    const host = interaction.options.getUser('host');

    const id = getNextEventId(rows);

    await appendRow(EVENTS_RANGE, [
      id,
      name,
      host.tag,
      host.id,
      time,
      'Scheduled',
      0,
      '',
      interaction.user.tag,
      getCSTTime(),
      ''
    ]);

    await interaction.reply({
      embeds: [simpleEmbed('EVENT CREATED', `**${name}** scheduled.`)]
    });

    return true;
  }

  /* START */
  if (sub === 'start') {
    if (!(await requireLevel(interaction, 3))) return true;

    const name = interaction.options.getString('name');
    const rowNum = findEventRowByName(rows, name);

    if (!rowNum) {
      await interaction.reply({ content: 'Event not found' });
      return true;
    }

    const row = rows[rowNum - 1];

    await updateRow(`Events!A${rowNum}:K${rowNum}`, [
      ...row.slice(0, 5),
      'Active',
      row[6],
      row[7],
      row[8],
      row[9],
      row[10]
    ]);

    await interaction.reply({
      embeds: [simpleEmbed('EVENT STARTED', name)]
    });

    return true;
  }

  /* END */
  if (sub === 'end') {
    if (!(await requireLevel(interaction, 3))) return true;

    const name = interaction.options.getString('name');
    const rowNum = findEventRowByName(rows, name);

    if (!rowNum) {
      await interaction.reply({ content: 'Event not found' });
      return true;
    }

    const row = rows[rowNum - 1];

    await updateRow(`Events!A${rowNum}:K${rowNum}`, [
      ...row.slice(0, 5),
      'Closed',
      row[6],
      row[7],
      row[8],
      row[9],
      getCSTTime()
    ]);

    await interaction.reply({
      embeds: [simpleEmbed('EVENT CLOSED', name)]
    });

    return true;
  }

  /* ATTENDEE */
  if (sub === 'attendee') {
    if (!(await requireLevel(interaction, 3))) return true;

    const name = interaction.options.getString('event');
    const user = interaction.options.getUser('user');

    const rowNum = findEventRowByName(rows, name);
    if (!rowNum) {
      await interaction.reply({ content: 'Event not found' });
      return true;
    }

    const row = rows[rowNum - 1];
    const attendees = parseAttendees(row[7]);

    if (!attendees.includes(user.id)) {
      attendees.push(user.id);
    }

    await updateRow(`Events!A${rowNum}:K${rowNum}`, [
      ...row.slice(0, 6),
      attendees.length,
      stringifyAttendees(attendees),
      row[8],
      row[9],
      row[10]
    ]);

    await interaction.reply({
      embeds: [simpleEmbed('ATTENDEE ADDED', `${user.tag} added`)]
    });

    return true;
  }

  /* ATTENDANCE */
  if (sub === 'attendance') {
    if (!(await requireLevel(interaction, 1))) return true;

    const name = interaction.options.getString('event');
    const rowNum = findEventRowByName(rows, name);

    if (!rowNum) {
      await interaction.reply({ content: 'Event not found' });
      return true;
    }

    const row = rows[rowNum - 1];
    const attendees = parseAttendees(row[7]);

    await interaction.reply({
      embeds: [simpleEmbed('ATTENDANCE', `${attendees.length} attendees`)]
    });

    return true;
  }

  /* DELETE */
  if (sub === 'delete') {
    if (!(await requireLevel(interaction, 4))) return true;

    const name = interaction.options.getString('event');
    const rowNum = findEventRowByName(rows, name);

    if (!rowNum) {
      await interaction.reply({ content: 'Event not found' });
      return true;
    }

    await clearRange(`Events!A${rowNum}:K${rowNum}`);

    await interaction.reply({
      embeds: [simpleEmbed('EVENT DELETED', name)]
    });

    return true;
  }

  return false;
}

module.exports = {
  commands,
  handle
};
