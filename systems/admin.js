const {
  SlashCommandBuilder,
  EmbedBuilder
} = require('discord.js');

const { getRows, appendRow, updateRow } = require('../utils/sheets');
const { ADMIN_ROLES_RANGE } = require('../config');
const { requireOwner, requireLevel, getPermissionLevel } = require('../utils/permissions');

/* ---------------- HELPERS ---------------- */

function findRoleRow(rows, roleId) {
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][1] === roleId) return i + 1;
  }
  return null;
}

function simpleEmbed(title, desc) {
  return new EmbedBuilder()
    .setColor(0x880000)
    .setTitle(title)
    .setDescription(desc)
    .setFooter({ text: 'Scourge Admin System' })
    .setTimestamp();
}

function adminRolesEmbed(rows) {
  const data = rows.slice(1);

  const description = data.length
    ? data.map(row =>
        `**${row[0] || 'Unknown Role'}**\n` +
        `Role ID: \`${row[1] || 'Unknown'}\`\n` +
        `Level: \`${row[2] || '0'}\`\n` +
        `Added By: \`${row[3] || 'Unknown'}\``
      ).join('\n\n')
    : 'No admin roles have been added yet.';

  return new EmbedBuilder()
    .setColor(0x880000)
    .setTitle('ADMIN ROLE PERMISSIONS')
    .setDescription(description)
    .setFooter({ text: 'Scourge Admin System' })
    .setTimestamp();
}

/* ---------------- COMMANDS ---------------- */

const commands = [
  new SlashCommandBuilder()
    .setName('admin')
    .setDescription('admin dashboard')

    .addSubcommand(s =>
      s.setName('addrole')
        .setDescription('owner only: add admin role')
        .addRoleOption(o => o.setName('role').setDescription('role').setRequired(true))
        .addIntegerOption(o => o.setName('level').setDescription('permission level').setRequired(true))
    )

    .addSubcommand(s =>
      s.setName('setrolelevel')
        .setDescription('owner only: change admin role level')
        .addRoleOption(o => o.setName('role').setDescription('role').setRequired(true))
        .addIntegerOption(o => o.setName('level').setDescription('new level').setRequired(true))
    )

    .addSubcommand(s =>
      s.setName('roles')
        .setDescription('view admin roles')
    )

    .addSubcommand(s =>
      s.setName('mypermission')
        .setDescription('view your permission level')
    )

    .addSubcommand(s =>
      s.setName('override_on')
        .setDescription('owner only: enable override mode')
    )

    .addSubcommand(s =>
      s.setName('override_off')
        .setDescription('owner only: disable override mode')
    )

    .addSubcommand(s =>
      s.setName('set_owner')
        .setDescription('owner only: set owner for runtime')
        .addUserOption(o => o.setName('user').setDescription('new owner').setRequired(true))
    )

].map(c => c.toJSON());

/* ---------------- HANDLER ---------------- */

async function handle(interaction) {
  if (!interaction.isChatInputCommand()) return false;
  if (interaction.commandName !== 'admin') return false;

  const sub = interaction.options.getSubcommand();

  if (sub === 'addrole') {
    if (!(await requireOwner(interaction))) return true;

    const role = interaction.options.getRole('role');
    const level = interaction.options.getInteger('level');

    const rows = await getRows(ADMIN_ROLES_RANGE);
    const existingRow = findRoleRow(rows, role.id);

    if (existingRow) {
      await interaction.reply({
        embeds: [simpleEmbed('ADMIN ROLE ALREADY EXISTS', `Role **${role.name}** already exists.`)]
      });
      return true;
    }

    await appendRow(ADMIN_ROLES_RANGE, [
      role.name,
      role.id,
      level,
      `${interaction.user.tag} (${interaction.user.id})`,
      new Date().toISOString()
    ]);

    await interaction.reply({
      embeds: [simpleEmbed('ADMIN ROLE ADDED', `Role: **${role.name}**\nLevel: \`${level}\``)]
    });

    return true;
  }

  if (sub === 'setrolelevel') {
    if (!(await requireOwner(interaction))) return true;

    const role = interaction.options.getRole('role');
    const level = interaction.options.getInteger('level');

    const rows = await getRows(ADMIN_ROLES_RANGE);
    const rowNum = findRoleRow(rows, role.id);

    if (!rowNum) {
      await interaction.reply({
        embeds: [simpleEmbed('ADMIN ROLE NOT FOUND', `Use /admin addrole first.`)]
      });
      return true;
    }

    await updateRow(`Admin Roles!A${rowNum}:E${rowNum}`, [
      role.name,
      role.id,
      level,
      `${interaction.user.tag} (${interaction.user.id})`,
      new Date().toISOString()
    ]);

    await interaction.reply({
      embeds: [simpleEmbed('ROLE LEVEL UPDATED', `**${role.name}** → \`${level}\``)]
    });

    return true;
  }

  if (sub === 'roles') {
    if (!(await requireLevel(interaction, 1))) return true;

    const rows = await getRows(ADMIN_ROLES_RANGE);
    await interaction.reply({ embeds: [adminRolesEmbed(rows)] });
    return true;
  }

  if (sub === 'mypermission') {
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const level = await getPermissionLevel(member);

    await interaction.reply({
      embeds: [simpleEmbed('YOUR PERMISSION LEVEL', `Level: \`${level}\``)]
    });

    return true;
  }

  if (sub === 'override_on') {
    if (!(await requireOwner(interaction))) return true;

    process.env.OVERRIDE_MODE = 'yes';

    await interaction.reply({
      embeds: [simpleEmbed('OVERRIDE ENABLED', 'Owner only commands active')]
    });

    return true;
  }

  if (sub === 'override_off') {
    if (!(await requireOwner(interaction))) return true;

    process.env.OVERRIDE_MODE = 'no';

    await interaction.reply({
      embeds: [simpleEmbed('OVERRIDE DISABLED', 'Normal operation restored')]
    });

    return true;
  }

  if (sub === 'set_owner') {
    if (!(await requireOwner(interaction))) return true;

    const user = interaction.options.getUser('user');
    process.env.OWNER_DISCORD_ID = user.id;

    await interaction.reply({
      embeds: [simpleEmbed('OWNER UPDATED', `${user.tag}`)]
    });

    return true;
  }

  return false;
}

module.exports = {
  commands,
  handle
};
