const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');

const { getRows, appendRow, updateRow } = require('../utils/sheets');
const { PERSONNEL_RANGE } = require('../config');

/* ---------------- HELPERS ---------------- */

function getRank(member) {
  const roles = member.roles.cache
    .filter(role => role.name !== '@everyone')
    .sort((a, b) => b.position - a.position);

  return roles.first()?.name || 'No Rank';
}

function formatId(id) {
  return String(id).padStart(4, '0');
}

function findUserRow(rows, id) {
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][2] === id) return i + 1;
  }
  return null;
}

/* ---------------- EMBEDS ---------------- */

function verifyEmbed(user, id, roblox, rank) {
  return new EmbedBuilder()
    .setColor(0x8B0000)
    .setTitle('EMPIRE DATABASE ENTRY RECORDED')
    .setDescription(`Hello **${user}**`)
    .addFields(
      { name: 'ID Number Issued', value: `\`${formatId(id)}\`` },
      { name: 'Roblox Username Logged', value: `\`${roblox}\`` },
      { name: 'Rank Logged', value: `\`${rank}\`` }
    )
    .setTimestamp();
}

function updateEmbed(user, id, roblox, rank) {
  return new EmbedBuilder()
    .setColor(0x4B0000)
    .setTitle('EMPIRE DATABASE UPDATED')
    .setDescription(`Hello **${user}**`)
    .addFields(
      { name: 'ID Number', value: `\`${formatId(id)}\`` },
      { name: 'Roblox Username', value: `\`${roblox}\`` },
      { name: 'Rank', value: `\`${rank}\`` }
    )
    .setTimestamp();
}

function profileEmbed(row) {
  return new EmbedBuilder()
    .setColor(0x700000)
    .setTitle('PERSONNEL RECORD')
    .addFields(
      { name: 'ID', value: `\`${formatId(row[0])}\`` },
      { name: 'Discord', value: `\`${row[1]}\`` },
      { name: 'Rank', value: `\`${row[3]}\`` },
      { name: 'Roblox', value: `\`${row[4]}\`` },
      { name: 'Status', value: `\`${row[6]}\`` }
    );
}

/* ---------------- BUTTON ---------------- */

function updateButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('update_modal_open')
      .setLabel('Update Record')
      .setStyle(ButtonStyle.Danger)
  );
}

function updateModal() {
  const modal = new ModalBuilder()
    .setCustomId('update_modal')
    .setTitle('Update Record');

  const input = new TextInputBuilder()
    .setCustomId('roblox')
    .setLabel('Roblox Username')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder().addComponents(input));
  return modal;
}

/* ---------------- COMMANDS ---------------- */

const commands = [
  new SlashCommandBuilder()
    .setName('verify')
    .setDescription('verify yourself')
    .addStringOption(o =>
      o.setName('roblox_username')
        .setDescription('roblox username')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('update')
    .setDescription('update your record')
    .addStringOption(o =>
      o.setName('roblox_username')
        .setDescription('roblox username')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('profile')
    .setDescription('view profile')
    .addUserOption(o =>
      o.setName('user')
        .setDescription('user')
        .setRequired(true)
    )
].map(c => c.toJSON());

/* ---------------- HANDLER ---------------- */

async function handle(interaction) {

  /* -------- VERIFY -------- */
  if (interaction.commandName === 'verify') {

    const roblox = interaction.options.getString('roblox_username');
    const rows = await getRows(PERSONNEL_RANGE);

    if (findUserRow(rows, interaction.user.id)) {
      await interaction.reply({ content: 'Already verified. Use /update.' });
      return true;
    }

    const member = await interaction.guild.members.fetch(interaction.user.id);
    const rank = getRank(member);

    const id = rows.length;

    await appendRow(PERSONNEL_RANGE, [
      id,
      interaction.user.tag,
      interaction.user.id,
      rank,
      roblox,
      new Date().toISOString(),
      'Active'
    ]);

    await interaction.reply({
      embeds: [verifyEmbed(interaction.user.tag, id, roblox, rank)],
      components: [updateButton()]
    });

    return true;
  }

  /* -------- UPDATE -------- */
  if (interaction.commandName === 'update') {

    const roblox = interaction.options.getString('roblox_username');
    const rows = await getRows(PERSONNEL_RANGE);

    const rowNum = findUserRow(rows, interaction.user.id);
    if (!rowNum) {
      await interaction.reply('Not verified.');
      return true;
    }

    const row = rows[rowNum - 1];

    const member = await interaction.guild.members.fetch(interaction.user.id);
    const rank = getRank(member);

    await updateRow(`A${rowNum}:G${rowNum}`, [
      row[0],
      interaction.user.tag,
      interaction.user.id,
      rank,
      roblox,
      new Date().toISOString(),
      row[6]
    ]);

    await interaction.reply({
      embeds: [updateEmbed(interaction.user.tag, row[0], roblox, rank)],
      components: [updateButton()]
    });

    return true;
  }

  /* -------- PROFILE -------- */
  if (interaction.commandName === 'profile') {

    const user = interaction.options.getUser('user');
    const rows = await getRows(PERSONNEL_RANGE);

    const rowNum = findUserRow(rows, user.id);
    if (!rowNum) {
      await interaction.reply('User not found.');
      return true;
    }

    await interaction.reply({
      embeds: [profileEmbed(rows[rowNum - 1])]
    });

    return true;
  }

  /* -------- BUTTON -------- */
  if (interaction.isButton()) {
    if (interaction.customId === 'update_modal_open') {
      await interaction.showModal(updateModal());
      return true;
    }
  }

  /* -------- MODAL -------- */
  if (interaction.isModalSubmit()) {

    if (interaction.customId === 'update_modal') {

      const roblox = interaction.fields.getTextInputValue('roblox');
      const rows = await getRows(PERSONNEL_RANGE);

      const rowNum = findUserRow(rows, interaction.user.id);
      if (!rowNum) {
        await interaction.reply('Not verified.');
        return true;
      }

      const row = rows[rowNum - 1];

      const member = await interaction.guild.members.fetch(interaction.user.id);
      const rank = getRank(member);

      await updateRow(`A${rowNum}:G${rowNum}`, [
        row[0],
        interaction.user.tag,
        interaction.user.id,
        rank,
        roblox,
        new Date().toISOString(),
        row[6]
      ]);

      await interaction.reply({
        embeds: [updateEmbed(interaction.user.tag, row[0], roblox, rank)],
        components: [updateButton()]
      });

      return true;
    }
  }

  return false;
}

module.exports = {
  commands,
  handle
};
