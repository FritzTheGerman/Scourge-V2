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
const {
  PERSONNEL_RANGE,
  PENDING_VERIFICATIONS_RANGE
} = require('../config');
const { getCSTTime } = require('../utils/time');

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

function findPendingRow(rows, discordId) {
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][1] === discordId) return i + 1;
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

function generateCode() {
  const random = Math.floor(100000 + Math.random() * 900000);
  return `SC-${random}`;
}

async function lookupRobloxUser(username) {
  const usernameResponse = await fetch('https://users.roblox.com/v1/usernames/users', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      usernames: [username],
      excludeBannedUsers: true
    })
  });

  if (!usernameResponse.ok) {
    throw new Error(`Roblox username lookup failed: ${usernameResponse.status}`);
  }

  const usernameData = await usernameResponse.json();

  if (!usernameData.data || usernameData.data.length === 0) {
    return null;
  }

  const user = usernameData.data[0];

  const profileResponse = await fetch(`https://users.roblox.com/v1/users/${user.id}`);

  if (!profileResponse.ok) {
    throw new Error(`Roblox profile lookup failed: ${profileResponse.status}`);
  }

  const profile = await profileResponse.json();

  return {
    id: String(user.id),
    username: user.name,
    displayName: user.displayName || profile.displayName || user.name,
    description: profile.description || ''
  };
}

/* ---------------- EMBEDS ---------------- */

function pendingVerifyEmbed(robloxUsername, robloxId, code) {
  return new EmbedBuilder()
    .setColor(0x8B0000)
    .setTitle('ROBLOX VERIFICATION REQUIRED')
    .setDescription(
      `A verification code has been created for your Roblox account.\n\n` +
      `Put this code in your Roblox **About/Description** section, then run \`/confirmverify\`.`
    )
    .addFields(
      { name: 'Roblox Username', value: `\`${robloxUsername}\`` },
      { name: 'Roblox ID', value: `\`${robloxId}\`` },
      { name: 'Verification Code', value: `\`${code}\`` },
      { name: 'Next Step', value: '`/confirmverify`' }
    )
    .setFooter({ text: 'Empire Verification System' })
    .setTimestamp();
}

function pendingUpdateEmbed(robloxUsername, robloxId, code) {
  return new EmbedBuilder()
    .setColor(0x8B0000)
    .setTitle('ROBLOX UPDATE VERIFICATION REQUIRED')
    .setDescription(
      `A verification code has been created for your Roblox account update.\n\n` +
      `Put this code in your Roblox **About/Description** section, then run \`/confirmupdate\`.`
    )
    .addFields(
      { name: 'Roblox Username', value: `\`${robloxUsername}\`` },
      { name: 'Roblox ID', value: `\`${robloxId}\`` },
      { name: 'Verification Code', value: `\`${code}\`` },
      { name: 'Next Step', value: '`/confirmupdate`' }
    )
    .setFooter({ text: 'Empire Verification System' })
    .setTimestamp();
}

function verifyEmbed(user, id, roblox, robloxId, rank) {
  return new EmbedBuilder()
    .setColor(0x8B0000)
    .setTitle('EMPIRE DATABASE ENTRY RECORDED')
    .setDescription(
      `**Hello ${user}**\n\n` +
      `The following information has been verified and logged in the Empire Database:`
    )
    .addFields(
      { name: '1: ID Number Issued', value: `\`${formatId(id)}\`` },
      { name: '2: Roblox Username Logged', value: `\`${roblox}\`` },
      { name: '3: Roblox ID Logged', value: `\`${robloxId}\`` },
      { name: '4: Rank Logged', value: `\`${rank}\`` }
    )
    .setFooter({ text: 'Empire Verification System' })
    .setTimestamp();
}

function updateEmbed(user, id, roblox, robloxId, rank) {
  return new EmbedBuilder()
    .setColor(0x4B0000)
    .setTitle('EMPIRE DATABASE UPDATED')
    .setDescription(
      `**Hello ${user}**\n\n` +
      `Your verified record has been updated in the Empire Database:`
    )
    .addFields(
      { name: 'ID Number', value: `\`${formatId(id)}\`` },
      { name: 'Roblox Username', value: `\`${roblox}\`` },
      { name: 'Roblox ID', value: `\`${robloxId}\`` },
      { name: 'Rank Logged', value: `\`${rank}\`` }
    )
    .setFooter({ text: 'Empire Verification System' })
    .setTimestamp();
}

function profileEmbed(row) {
  return new EmbedBuilder()
    .setColor(0x700000)
    .setTitle('EMPIRE PERSONNEL RECORD')
    .addFields(
      { name: 'ID Number', value: `\`${formatId(row[0] || '0')}\`` },
      { name: 'Discord Username', value: `\`${row[1] || 'Unknown'}\`` },
      { name: 'Discord ID', value: `\`${row[2] || 'Unknown'}\`` },
      { name: 'Rank Logged', value: `\`${row[3] || 'Unknown'}\`` },
      { name: 'Roblox Username', value: `\`${row[4] || 'Unknown'}\`` },
      { name: 'Roblox ID', value: `\`${row[5] || 'Unknown'}\`` },
      { name: 'Last Updated', value: `\`${row[6] || 'Unknown'}\`` },
      { name: 'Enlistment Status', value: `\`${row[7] || 'Active'}\`` }
    )
    .setFooter({ text: 'Empire Verification System' })
    .setTimestamp();
}

/* ---------------- BUTTON / MODAL ---------------- */

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
    .setDescription('start Roblox verification')
    .addStringOption(o =>
      o.setName('roblox_username')
        .setDescription('your Roblox username')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('confirmverify')
    .setDescription('confirm your Roblox verification code'),

  new SlashCommandBuilder()
    .setName('update')
    .setDescription('update your verified Roblox record')
    .addStringOption(o =>
      o.setName('roblox_username')
        .setDescription('your Roblox username')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('confirmupdate')
    .setDescription('confirm your Roblox account update'),

  new SlashCommandBuilder()
    .setName('profile')
    .setDescription('view profile')
    .addUserOption(o =>
      o.setName('user')
        .setDescription('user')
        .setRequired(true)
    )
].map(c => c.toJSON());

/* ---------------- VERIFICATION FUNCTIONS ---------------- */

async function startVerification(interaction, robloxUsername) {
  const personnelRows = await getRows(PERSONNEL_RANGE);
  const pendingRows = await getRows(PENDING_VERIFICATIONS_RANGE);

  const existingPersonnel = findUserRow(personnelRows, interaction.user.id);

  if (existingPersonnel) {
    await interaction.reply({
      content: 'You are already verified. Use /update if you need to change your Roblox account.'
    });
    return true;
  }

  const robloxUser = await lookupRobloxUser(robloxUsername);

  if (!robloxUser) {
    await interaction.reply({
      content: 'That Roblox username was not found. Check the spelling and try again.'
    });
    return true;
  }

  const code = generateCode();
  const pendingRow = findPendingRow(pendingRows, interaction.user.id);

  const data = [
    interaction.user.tag,
    interaction.user.id,
    robloxUser.username,
    robloxUser.id,
    code,
    getCSTTime()
  ];

  if (pendingRow) {
    await updateRow(`Pending Verifications!A${pendingRow}:F${pendingRow}`, data);
  } else {
    await appendRow(PENDING_VERIFICATIONS_RANGE, data);
  }

  await interaction.reply({
    embeds: [pendingVerifyEmbed(robloxUser.username, robloxUser.id, code)]
  });

  return true;
}

async function confirmVerification(interaction) {
  const personnelRows = await getRows(PERSONNEL_RANGE);
  const pendingRows = await getRows(PENDING_VERIFICATIONS_RANGE);

  if (findUserRow(personnelRows, interaction.user.id)) {
    await interaction.reply({
      content: 'You are already verified. Use /update if you need to change your Roblox account.'
    });
    return true;
  }

  const pendingRowNum = findPendingRow(pendingRows, interaction.user.id);

  if (!pendingRowNum) {
    await interaction.reply({
      content: 'You do not have a pending verification. Run /verify first.'
    });
    return true;
  }

  const pending = pendingRows[pendingRowNum - 1];
  const robloxUsername = pending[2];
  const robloxId = pending[3];
  const code = pending[4];

  const robloxUser = await lookupRobloxUser(robloxUsername);

  if (!robloxUser) {
    await interaction.reply({
      content: 'Could not find your Roblox account anymore. Run /verify again.'
    });
    return true;
  }

  if (!robloxUser.description.includes(code)) {
    await interaction.reply({
      content:
        `Verification failed. Put this code in your Roblox About/Description, then run /confirmverify again:\n\n` +
        `\`${code}\``
    });
    return true;
  }

  const member = await interaction.guild.members.fetch(interaction.user.id);
  const rank = getRank(member);
  const id = getNextId(personnelRows);

  await appendRow(PERSONNEL_RANGE, [
    id,
    interaction.user.tag,
    interaction.user.id,
    rank,
    robloxUser.username,
    robloxId,
    getCSTTime(),
    'Active'
  ]);

  await updateRow(`Pending Verifications!A${pendingRowNum}:F${pendingRowNum}`, [
    '',
    '',
    '',
    '',
    '',
    ''
  ]);

  await interaction.reply({
    embeds: [verifyEmbed(interaction.user.tag, id, robloxUser.username, robloxId, rank)],
    components: [updateButton()]
  });

  return true;
}

async function updateVerifiedRecord(interaction, robloxUsername) {
  const personnelRows = await getRows(PERSONNEL_RANGE);
  const rowNum = findUserRow(personnelRows, interaction.user.id);

  if (!rowNum) {
    await interaction.reply({
      content: 'You are not verified yet. Use /verify first.'
    });
    return true;
  }

  const robloxUser = await lookupRobloxUser(robloxUsername);

  if (!robloxUser) {
    await interaction.reply({
      content: 'That Roblox username was not found. Check the spelling and try again.'
    });
    return true;
  }

  const code = generateCode();
  const pendingRows = await getRows(PENDING_VERIFICATIONS_RANGE);
  const pendingRow = findPendingRow(pendingRows, interaction.user.id);

  const data = [
    interaction.user.tag,
    interaction.user.id,
    robloxUser.username,
    robloxUser.id,
    code,
    getCSTTime()
  ];

  if (pendingRow) {
    await updateRow(`Pending Verifications!A${pendingRow}:F${pendingRow}`, data);
  } else {
    await appendRow(PENDING_VERIFICATIONS_RANGE, data);
  }

  await interaction.reply({
    embeds: [pendingUpdateEmbed(robloxUser.username, robloxUser.id, code)]
  });

  return true;
}

async function confirmUpdate(interaction) {
  const personnelRows = await getRows(PERSONNEL_RANGE);
  const rowNum = findUserRow(personnelRows, interaction.user.id);

  if (!rowNum) {
    await interaction.reply({
      content: 'You are not verified yet. Use /verify first.'
    });
    return true;
  }

  const pendingRows = await getRows(PENDING_VERIFICATIONS_RANGE);
  const pendingRowNum = findPendingRow(pendingRows, interaction.user.id);

  if (!pendingRowNum) {
    await interaction.reply({
      content: 'You do not have a pending verification update. Run /update first.'
    });
    return true;
  }

  const pending = pendingRows[pendingRowNum - 1];
  const robloxUsername = pending[2];
  const robloxId = pending[3];
  const code = pending[4];

  const robloxUser = await lookupRobloxUser(robloxUsername);

  if (!robloxUser) {
    await interaction.reply({
      content: 'Could not find that Roblox account. Run /update again.'
    });
    return true;
  }

  if (!robloxUser.description.includes(code)) {
    await interaction.reply({
      content:
        `Update verification failed. Put this code in your Roblox About/Description, then run /confirmupdate again:\n\n` +
        `\`${code}\``
    });
    return true;
  }

  const row = personnelRows[rowNum - 1];
  const member = await interaction.guild.members.fetch(interaction.user.id);
  let rank = getRank(member);

  if (rank === 'No Rank' && row[3]) {
    rank = row[3];
  }

  await updateRow(`A${rowNum}:H${rowNum}`, [
    row[0],
    interaction.user.tag,
    interaction.user.id,
    rank,
    robloxUser.username,
    robloxId,
    getCSTTime(),
    row[7] || 'Active'
  ]);

  await updateRow(`Pending Verifications!A${pendingRowNum}:F${pendingRowNum}`, [
    '',
    '',
    '',
    '',
    '',
    ''
  ]);

  await interaction.reply({
    embeds: [updateEmbed(interaction.user.tag, row[0], robloxUser.username, robloxId, rank)],
    components: [updateButton()]
  });

  return true;
}

/* ---------------- HANDLER ---------------- */

async function handle(interaction) {
  if (interaction.isButton()) {
    if (interaction.customId === 'update_modal_open') {
      await interaction.showModal(updateModal());
      return true;
    }
  }

  if (interaction.isModalSubmit()) {
    if (interaction.customId === 'update_modal') {
      const roblox = interaction.fields.getTextInputValue('roblox');
      return updateVerifiedRecord(interaction, roblox);
    }
  }

  if (!interaction.isChatInputCommand()) return false;

  if (interaction.commandName === 'verify') {
    const roblox = interaction.options.getString('roblox_username');
    return startVerification(interaction, roblox);
  }

  if (interaction.commandName === 'confirmverify') {
    return confirmVerification(interaction);
  }

  if (interaction.commandName === 'update') {
    const roblox = interaction.options.getString('roblox_username');
    return updateVerifiedRecord(interaction, roblox);
  }

  if (interaction.commandName === 'confirmupdate') {
    return confirmUpdate(interaction);
  }

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

  return false;
}

module.exports = {
  commands,
  handle
};
