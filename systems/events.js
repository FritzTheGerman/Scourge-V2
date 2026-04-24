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
    .setFooter({ text: 'Empire Event System' })
    .setTimestamp();
}

/* ---------------- COMMANDS ---------------- */

const commands = [
  new SlashCommandBuilder()
    .setName('event')
    .setDescription('event system')

    .addSubcommand(s =>
      s.setName('create')
        .setDescription('create an event')
        .addStringOption(o =>
          o.setName('name')
            .setDescription('event name')
            .setRequired(true)
        )
        .addStringOption(o =>
          o.setName('time')
            .setDescription('event time')
            .setRequired(true)
        )
        .addUserOption(o =>
          o.setName('host')
            .setDescription('event host')
            .setRequired(true)
        )
    )

    .addSubcommand(s =>
      s.setName('start')
        .setDescription('start an event')
        .addStringOption(o =>
          o.setName('name')
            .setDescription('event name')
            .setRequired(true)
        )
    )

    .addSubcommand(s =>
      s.setName('end')
        .setDescription('end an event')
        .addStringOption(o =>
          o.setName('name')
            .setDescription('event name')
            .setRequired(true)
        )
    )

    .addSubcommand(s =>
      s.setName('attendee')
        .setDescription('add an attendee to an event')
        .addStringOption(o =>
          o.setName('event')
            .setDescription('event name')
            .setRequired(true)
        )
        .addUserOption(o =>
          o.setName('user')
            .setDescription('attendee user')
            .setRequired(true)
        )
    )

    .addSubcommand(s =>
      s.setName('attendance')
        .setDescription('view event attendance')
        .addStringOption(o =>
          o.setName('event')
            .setDescription('event name')
            .setRequired(true)
        )
    )

    .addSubcommand(s =>
      s.setName('delete')
        .setDescription('delete an event record')
        .addStringOption(o =>
          o.setName('event')
            .setDescription('event name')
            .setRequired(true)
        )
    )
].map(c => c.toJSON());

/* ---------------- HANDLER ---------------- */

async function handle(interaction) {
  if (!interaction.isChatInputCommand()) return false;
  if (interaction.commandName !== 'event') return false;

  const sub = interaction.options.getSubcommand();
  const rows = await getRows(EVENTS_RANGE);

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
      embeds: [simpleEmbed('EVENT CREATED', `**${name}** has been scheduled.`)]
    });

    return true;
  }

  if (sub === 'start') {
    if (!(await requireLevel(interaction, 3))) return true;

    const name = interaction.options.getString('name');
    const rowNum = findEventRowByName(rows, name);

    if (!rowNum) {
      await interaction.reply({ content: 'Event not found.' });
      return true;
    }

    const row = rows[rowNum - 1];

    await updateRow(`Events!A${rowNum}:K${rowNum}`, [
      row[0] || '',
      row[1] || '',
      row[2] || '',
      row[3] || '',
      row[4] || '',
      'Active',
      row[6] || 0,
      row[7] || '',
      row[8] || '',
      row[9] || '',
      row[10] || ''
    ]);

    await interaction.reply({
      embeds: [simpleEmbed('EVENT STARTED', `**${name}** is now active.`)]
    });

    return true;
  }

  if (sub === 'end') {
    if (!(await requireLevel(interaction, 3))) return true;

    const name = interaction.options.getString('name');
    const rowNum = findEventRowByName(rows, name);

    if (!rowNum) {
      await interaction.reply({ content: 'Event not found.' });
      return true;
    }

    const row = rows[rowNum - 1];

    await updateRow(`Events!A${rowNum}:K${rowNum}`, [
      row[0] || '',
      row[1] || '',
      row[2] || '',
      row[3] || '',
      row[4] || '',
      'Closed',
      row[6] || 0,
      row[7] || '',
      row[8] || '',
      row[9] || '',
      getCSTTime()
    ]);

    await interaction.reply({
      embeds: [simpleEmbed('EVENT CLOSED', `**${name}** has been closed.`)]
    });

    return true;
  }

  if (sub === 'attendee') {
    if (!(await requireLevel(interaction, 3))) return true;

    const name = interaction.options.getString('event');
    const user = interaction.options.getUser('user');

    const rowNum = findEventRowByName(rows, name);
    if (!rowNum) {
      await interaction.reply({ content: 'Event not found.' });
      return true;
    }

    const row = rows[rowNum - 1];
    const attendees = parseAttendees(row[7]);

    if (!attendees.includes(user.id)) {
      attendees.push(user.id);
    }

    await updateRow(`Events!A${rowNum}:K${rowNum}`, [
      row[0] || '',
      row[1] || '',
      row[2] || '',
      row[3] || '',
      row[4] || '',
      row[5] || '',
      attendees.length,
      stringifyAttendees(attendees),
      row[8] || '',
      row[9] || '',
      row[10] || ''
    ]);

    await interaction.reply({
      embeds: [simpleEmbed('ATTENDEE ADDED', `**${user.tag}** has been added to **${name}**.`)]
    });

    return true;
  }

  if (sub === 'attendance') {
    if (!(await requireLevel(interaction, 1))) return true;

    const name = interaction.options.getString('event');
    const rowNum = findEventRowByName(rows, name);

    if (!rowNum) {
      await interaction.reply({ content: 'Event not found.' });
      return true;
    }

    const row = rows[rowNum - 1];
    const attendees = parseAttendees(row[7]);

    const list = attendees.length
      ? attendees.map((id, index) => `${index + 1}. \`${id}\``).join('\n')
      : 'No attendees logged.';

    await interaction.reply({
      embeds: [simpleEmbed('EVENT ATTENDANCE', `**${name}**\n\n${list}`)]
    });

    return true;
  }

  if (sub === 'delete') {
    if (!(await requireLevel(interaction, 4))) return true;

    const name = interaction.options.getString('event');
    const rowNum = findEventRowByName(rows, name);

    if (!rowNum) {
      await interaction.reply({ content: 'Event not found.' });
      return true;
    }

    await clearRange(`Events!A${rowNum}:K${rowNum}`);

    await interaction.reply({
      embeds: [simpleEmbed('EVENT DELETED', `**${name}** has been deleted.`)]
    });

    return true;
  }

  return false;
}

module.exports = {
  commands,
  handle
};
