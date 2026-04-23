const {
  SlashCommandBuilder,
  EmbedBuilder
} = require('discord.js');

const { getRows, appendRow, updateRow, clearRange } = require('../utils/sheets');
const { EVENTS_RANGE } = require('../config');

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

function findEventRowByName(rows, eventName) {
  const lowered = eventName.toLowerCase();

  for (let i = 1; i < rows.length; i++) {
    if ((rows[i][1] || '').toLowerCase() === lowered) {
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

/* ---------------- EMBEDS ---------------- */

function eventCreateEmbed(eventId, eventName, hostUser, eventTime, createdBy) {
  return new EmbedBuilder()
    .setColor(0x8C1D00)
    .setTitle('EVENT RECORD CREATED')
    .addFields(
      { name: 'Event ID', value: `\`${formatId(eventId)}\`` },
      { name: 'Event Name', value: `\`${eventName}\`` },
      { name: 'Host', value: `\`${hostUser.tag}\`` },
      { name: 'Host Discord ID', value: `\`${hostUser.id}\`` },
      { name: 'Event Time', value: `\`${eventTime}\`` },
      { name: 'Status', value: '`Scheduled`' },
      { name: 'Created By', value: `\`${createdBy.tag}\`` },
      { name: 'Creator ID', value: `\`${createdBy.id}\`` }
    )
    .setFooter({ text: 'Empire Event System' })
    .setTimestamp();
}

function simpleEventEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(0x8C1D00)
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: 'Empire Event System' })
    .setTimestamp();
}

function attendanceEmbed(eventName, attendeeIds) {
  const description = attendeeIds.length
    ? attendeeIds.map((id, index) => `${index + 1}. \`${id}\``).join('\n')
    : 'No attendees logged.';

  return new EmbedBuilder()
    .setColor(0x9A2C00)
    .setTitle('EVENT ATTENDANCE')
    .setDescription(`Attendance for **${eventName}**\n\n${description}`)
    .addFields(
      { name: 'Attendance Count', value: `\`${attendeeIds.length}\`` }
    )
    .setFooter({ text: 'Empire Event System' })
    .setTimestamp();
}

function eventReportEmbed(row) {
  const attendeeIds = parseAttendeeIds(row[7] || '');

  return new EmbedBuilder()
    .setColor(0xA13A00)
    .setTitle('EVENT REPORT')
    .addFields(
      { name: 'Event ID', value: `\`${formatId(row[0] || '0')}\`` },
      { name: 'Event Name', value: `\`${row[1] || 'Unknown'}\`` },
      { name: 'Host Username', value: `\`${row[2] || 'Unknown'}\`` },
      { name: 'Host Discord ID', value: `\`${row[3] || 'Unknown'}\`` },
      { name: 'Event Time', value: `\`${row[4] || 'Unknown'}\`` },
      { name: 'Status', value: `\`${row[5] || 'Unknown'}\`` },
      { name: 'Attendance Count', value: `\`${row[6] || attendeeIds.length}\`` },
      { name: 'Created By', value: `\`${row[8] || 'Unknown'}\`` },
      { name: 'Created At', value: `\`${row[9] || 'Unknown'}\`` },
      { name: 'Closed At', value: `\`${row[10] || 'Not Closed'}\`` }
    )
    .setFooter({ text: 'Empire Event System' })
    .setTimestamp();
}

function eventHistoryEmbed(targetUser, rows) {
  const data = rows.slice(1).filter(row =>
    row[3] === targetUser.id ||
    parseAttendeeIds(row[7] || '').includes(targetUser.id)
  );

  const description = data.length
    ? data
        .slice(-10)
        .reverse()
        .map(row => {
          const asHost = row[3] === targetUser.id;

          return (
            `**${row[1] || 'Unknown Event'}**\n` +
            `Role: \`${asHost ? 'Host' : 'Attendee'}\`\n` +
            `Status: \`${row[5] || 'Unknown'}\`\n` +
            `Time: \`${row[4] || 'Unknown'}\``
          );
        })
        .join('\n\n')
    : 'No event history found for this user.';

  return new EmbedBuilder()
    .setColor(0x8C1D00)
    .setTitle('EVENT HISTORY')
    .setDescription(`Event history for **${targetUser.tag}**\n\n${description}`)
    .setFooter({ text: 'Empire Event System' })
    .setTimestamp();
}

function eventLeaderboardEmbed(rows) {
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
      s.setName('host')
        .setDescription('change event host')
        .addStringOption(o =>
          o.setName('event')
            .setDescription('event name')
            .setRequired(true)
        )
        .addUserOption(o =>
          o.setName('user')
            .setDescription('new host')
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
            .setDescription('attendee')
            .setRequired(true)
        )
    )
    .addSubcommand(s =>
      s.setName('attendance')
        .setDescription('show attendance for an event')
        .addStringOption(o =>
          o.setName('event')
            .setDescription('event name')
            .setRequired(true)
        )
    )
    .addSubcommand(s =>
      s.setName('history')
        .setDescription('show event history for a user')
        .addUserOption(o =>
          o.setName('user')
            .setDescription('target user')
            .setRequired(true)
        )
    )
    .addSubcommand(s =>
      s.setName('leaderboard')
        .setDescription('show event host leaderboard')
    )
    .addSubcommand(s =>
      s.setName('report')
        .setDescription('show event report')
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

  /* CREATE */
  if (sub === 'create') {
    const name = interaction.options.getString('name');
    const time = interaction.options.getString('time');
    const host = interaction.options.getUser('host');

    if (findEventRowByName(rows, name)) {
      await interaction.reply({
        content: 'An event with that exact name already exists.'
      });
      return true;
    }

    const eventId = getNextEventId(rows);

    await appendRow(EVENTS_RANGE, [
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
      embeds: [eventCreateEmbed(eventId, name, host, time, interaction.user)]
    });

    return true;
  }

  /* START */
  if (sub === 'start') {
    const name = interaction.options.getString('name');
    const rowNum = findEventRowByName(rows, name);

    if (!rowNum) {
      await interaction.reply({ content: 'That event was not found.' });
      return true;
    }

    const row = rows[rowNum - 1];
    row[5] = 'Active';

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
      embeds: [simpleEventEmbed('EVENT STARTED', `Event **${name}** is now marked as \`Active\`.`)]
    });

    return true;
  }

  /* END */
  if (sub === 'end') {
    const name = interaction.options.getString('name');
    const rowNum = findEventRowByName(rows, name);

    if (!rowNum) {
      await interaction.reply({ content: 'That event was not found.' });
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
      new Date().toISOString()
    ]);

    await interaction.reply({
      embeds: [simpleEventEmbed('EVENT CLOSED', `Event **${name}** has been closed.`)]
    });

    return true;
  }

  /* HOST */
  if (sub === 'host') {
    const name = interaction.options.getString('event');
    const host = interaction.options.getUser('user');
    const rowNum = findEventRowByName(rows, name);

    if (!rowNum) {
      await interaction.reply({ content: 'That event was not found.' });
      return true;
    }

    const row = rows[rowNum - 1];

    await updateRow(`Events!A${rowNum}:K${rowNum}`, [
      row[0] || '',
      row[1] || '',
      host.tag,
      host.id,
      row[4] || '',
      row[5] || '',
      row[6] || 0,
      row[7] || '',
      row[8] || '',
      row[9] || '',
      row[10] || ''
    ]);

    await interaction.reply({
      embeds: [simpleEventEmbed('EVENT HOST UPDATED', `Host for **${name}** is now **${host.tag}**.`)]
    });

    return true;
  }

  /* ATTENDEE */
  if (sub === 'attendee') {
    const name = interaction.options.getString('event');
    const attendee = interaction.options.getUser('user');
    const rowNum = findEventRowByName(rows, name);

    if (!rowNum) {
      await interaction.reply({ content: 'That event was not found.' });
      return true;
    }

    const row = rows[rowNum - 1];
    const attendeeIds = parseAttendeeIds(row[7] || '');

    if (!attendeeIds.includes(attendee.id)) {
      attendeeIds.push(attendee.id);
    }

    await updateRow(`Events!A${rowNum}:K${rowNum}`, [
      row[0] || '',
      row[1] || '',
      row[2] || '',
      row[3] || '',
      row[4] || '',
      row[5] || '',
      attendeeIds.length,
      stringifyAttendeeIds(attendeeIds),
      row[8] || '',
      row[9] || '',
      row[10] || ''
    ]);

    await interaction.reply({
      embeds: [simpleEventEmbed('ATTENDEE LOGGED', `**${attendee.tag}** has been added to **${name}**.`)]
    });

    return true;
  }

  /* ATTENDANCE */
  if (sub === 'attendance') {
    const name = interaction.options.getString('event');
    const rowNum = findEventRowByName(rows, name);

    if (!rowNum) {
      await interaction.reply({ content: 'That event was not found.' });
      return true;
    }

    const row = rows[rowNum - 1];
    const attendeeIds = parseAttendeeIds(row[7] || '');

    await interaction.reply({
      embeds: [attendanceEmbed(name, attendeeIds)]
    });

    return true;
  }

  /* HISTORY */
  if (sub === 'history') {
    const targetUser = interaction.options.getUser('user');

    await interaction.reply({
      embeds: [eventHistoryEmbed(targetUser, rows)]
    });

    return true;
  }

  /* LEADERBOARD */
  if (sub === 'leaderboard') {
    await interaction.reply({
      embeds: [eventLeaderboardEmbed(rows)]
    });

    return true;
  }

  /* REPORT */
  if (sub === 'report') {
    const name = interaction.options.getString('event');
    const rowNum = findEventRowByName(rows, name);

    if (!rowNum) {
      await interaction.reply({ content: 'That event was not found.' });
      return true;
    }

    await interaction.reply({
      embeds: [eventReportEmbed(rows[rowNum - 1])]
    });

    return true;
  }

  /* DELETE */
  if (sub === 'delete') {
    const name = interaction.options.getString('event');
    const rowNum = findEventRowByName(rows, name);

    if (!rowNum) {
      await interaction.reply({ content: 'That event was not found.' });
      return true;
    }

    await clearRange(`Events!A${rowNum}:K${rowNum}`);

    await interaction.reply({
      embeds: [simpleEventEmbed('EVENT RECORD DELETED', `The event record for **${name}** has been cleared.`)]
    });

    return true;
  }

  return false;
}

module.exports = {
  commands,
  handle
};
