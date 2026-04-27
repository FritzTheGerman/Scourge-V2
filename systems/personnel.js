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

const { getRows, appendRow, updateRow, ensureSheet } = require('../utils/sheets');
const {
  PERSONNEL_RANGE,
  PENDING_VERIFICATIONS_RANGE,
  BOT_SETTINGS_SHEET,
  BOT_SETTINGS_RANGE
} = require('../config');
const { isOwner } = require('../utils/permissions');
const { getCSTTime } = require('../utils/time');

const VERIFIED_ROLE_KEY = 'verified_role_id';
const CHECKVERIFY_ALL_LAST_SENT_KEY = 'checkverify_all_last_sent';
const CHECKVERIFY_ALL_COOLDOWN_MS = 24 * 60 * 60 * 1000;

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

function findSettingRow(rows, key) {
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === key) return i + 1;
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

function verifiedRoleStatusText(result) {
  if (!result || result.status === 'not_configured') return '`Not configured`';
  if (result.status === 'applied') return `Applied <@&${result.roleId}>`;
  if (result.status === 'already_has_role') return `Already had <@&${result.roleId}>`;
  if (result.status === 'role_not_found') return `Configured role \`${result.roleId}\` was not found`;
  if (result.status === 'member_not_found') return 'Member was not found in this server';
  return `Could not apply <@&${result.roleId}>`;
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

async function getSettingsRows() {
  await ensureSheet(BOT_SETTINGS_SHEET);

  let rows = await getRows(BOT_SETTINGS_RANGE);

  if (!rows.length) {
    await updateRow(`${BOT_SETTINGS_SHEET}!A1:D1`, [
      'Key',
      'Value',
      'Label',
      'Updated At'
    ]);

    rows = await getRows(BOT_SETTINGS_RANGE);
  }

  return rows;
}

async function getSetting(key) {
  const rows = await getSettingsRows();
  const row = rows.slice(1).find(settingRow => settingRow[0] === key);
  return row?.[1] || '';
}

async function setSetting(key, value, label) {
  const rows = await getSettingsRows();
  const rowNum = findSettingRow(rows, key);
  const data = [key, value, label, getCSTTime()];

  if (rowNum) {
    await updateRow(`${BOT_SETTINGS_SHEET}!A${rowNum}:D${rowNum}`, data);
  } else {
    await appendRow(BOT_SETTINGS_RANGE, data);
  }
}

async function getVerifiedRoleId() {
  try {
    const storedRoleId = await getSetting(VERIFIED_ROLE_KEY);
    return storedRoleId || process.env.VERIFIED_ROLE_ID || '';
  } catch (error) {
    console.error('Verified role setting lookup failed:', error);
    return process.env.VERIFIED_ROLE_ID || '';
  }
}

async function resolveVerifiedRole(guild) {
  const roleId = await getVerifiedRoleId();

  if (!roleId) {
    return { status: 'not_configured' };
  }

  const role = guild.roles.cache.get(roleId) || await guild.roles.fetch(roleId).catch(() => null);

  if (!role) {
    return { status: 'role_not_found', roleId };
  }

  return { status: 'found', role };
}

async function addVerifiedRole(member, role) {
  if (member.roles.cache.has(role.id)) {
    return { status: 'already_has_role', roleId: role.id };
  }

  try {
    await member.roles.add(role);
    return { status: 'applied', roleId: role.id };
  } catch (error) {
    console.error('Verified role assignment failed:', error);
    return { status: 'failed', roleId: role.id };
  }
}

async function applyVerifiedRole(guild, userId) {
  const resolved = await resolveVerifiedRole(guild);

  if (resolved.status !== 'found') {
    return resolved;
  }

  const member = await guild.members.fetch(userId).catch(() => null);

  if (!member) {
    return { status: 'member_not_found', roleId: resolved.role.id };
  }

  return addVerifiedRole(member, resolved.role);
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

function verifyEmbed(user, id, roblox, robloxId, rank, verifiedRoleResult) {
  const fields = [
    { name: '1: ID Number Issued', value: `\`${formatId(id)}\`` },
    { name: '2: Roblox Username Logged', value: `\`${roblox}\`` },
    { name: '3: Roblox ID Logged', value: `\`${robloxId}\`` },
    { name: '4: Rank Logged', value: `\`${rank}\`` }
  ];

  if (verifiedRoleResult) {
    fields.push({
      name: '5: Verified Role',
      value: verifiedRoleStatusText(verifiedRoleResult)
    });
  }

  return new EmbedBuilder()
    .setColor(0x8B0000)
    .setTitle('EMPIRE DATABASE ENTRY RECORDED')
    .setDescription(
      `**Hello ${user}**\n\n` +
      `The following information has been verified and logged in the Empire Database:`
    )
    .addFields(...fields)
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

function verificationSystemEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(0x8B0000)
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: 'Empire Verification System' })
    .setTimestamp();
}

async function sendVerificationResponse(interaction, embed) {
  const payload = { embeds: [embed] };

  if (interaction.deferred) {
    await interaction.editReply(payload);
    return;
  }

  await interaction.reply(payload);
}

function verificationPromptEmbed(guildName) {
  return new EmbedBuilder()
    .setColor(0x8B0000)
    .setTitle('VERIFICATION REQUIRED')
    .setDescription(
      `You are not verified in the **${guildName}** personnel database.\n\n` +
      `Run \`/verify roblox_username:<your Roblox username>\` in the server to start verification.\n\n` +
      `You received this because server staff requested a verification reminder for unverified members.`
    )
    .addFields(
      { name: 'Step 1', value: '`/verify roblox_username:<name>`' },
      { name: 'Step 2', value: 'Put the generated code in your Roblox About/Description.' },
      { name: 'Step 3', value: '`/confirmverify`' }
    )
    .setFooter({ text: 'Empire Verification System' })
    .setTimestamp();
}

function checkVerifyEmbed(title, stats) {
  return new EmbedBuilder()
    .setColor(0x8B0000)
    .setTitle(title)
    .addFields(
      { name: 'Verified Users Skipped', value: `\`${stats.verified}\``, inline: true },
      { name: 'Verification DMs Sent', value: `\`${stats.sent}\``, inline: true },
      { name: 'DMs Failed', value: `\`${stats.failed}\``, inline: true },
      { name: 'Bots Skipped', value: `\`${stats.bots}\``, inline: true }
    )
    .setFooter({ text: 'Empire Verification System' })
    .setTimestamp();
}

function verifiedRoleSetEmbed(role, stats) {
  return new EmbedBuilder()
    .setColor(0x8B0000)
    .setTitle('VERIFIED ROLE UPDATED')
    .setDescription(`Verified users will now receive ${role}.`)
    .addFields(
      { name: 'Role Name', value: `\`${role.name}\`` },
      { name: 'Role ID', value: `\`${role.id}\`` },
      { name: 'Applied Now', value: `\`${stats.applied}\``, inline: true },
      { name: 'Already Had Role', value: `\`${stats.already}\``, inline: true },
      { name: 'Members Missing', value: `\`${stats.missing}\``, inline: true },
      { name: 'Failed', value: `\`${stats.failed}\``, inline: true }
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
    ),

  new SlashCommandBuilder()
    .setName('checkverify')
    .setDescription('owner only: DM unverified users the verification prompt')
    .addStringOption(o =>
      o.setName('target')
        .setDescription('check all users or one user')
        .setRequired(true)
        .addChoices(
          { name: 'all', value: 'all' },
          { name: 'user', value: 'user' }
        )
    )
    .addUserOption(o =>
      o.setName('user')
        .setDescription('user to check when target is user')
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('verifiedrole')
    .setDescription('owner only: set the role given to verified users')
    .addRoleOption(o =>
      o.setName('role')
        .setDescription('role to give verified users')
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
      embeds: [
        verificationSystemEmbed('ALREADY VERIFIED', 'You are already verified. Use `/update` if you need to change your Roblox account.')
      ]
    });
    return true;
  }

  const robloxUser = await lookupRobloxUser(robloxUsername);

  if (!robloxUser) {
    await interaction.reply({
      embeds: [
        verificationSystemEmbed('ROBLOX USER NOT FOUND', 'That Roblox username was not found. Check the spelling and try again.')
      ]
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
      embeds: [
        verificationSystemEmbed('ALREADY VERIFIED', 'You are already verified. Use `/update` if you need to change your Roblox account.')
      ]
    });
    return true;
  }

  const pendingRowNum = findPendingRow(pendingRows, interaction.user.id);

  if (!pendingRowNum) {
    await interaction.reply({
      embeds: [
        verificationSystemEmbed('NO PENDING VERIFICATION', 'You do not have a pending verification. Run `/verify` first.')
      ]
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
      embeds: [
        verificationSystemEmbed('ROBLOX USER NOT FOUND', 'Could not find your Roblox account anymore. Run `/verify` again.')
      ]
    });
    return true;
  }

  if (!robloxUser.description.includes(code)) {
    await interaction.reply({
      embeds: [
        verificationSystemEmbed(
          'VERIFICATION FAILED',
          `Put this code in your Roblox About/Description, then run \`/confirmverify\` again:\n\n\`${code}\``
        )
      ]
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

  const verifiedRoleResult = await applyVerifiedRole(interaction.guild, interaction.user.id);

  await interaction.reply({
    embeds: [verifyEmbed(interaction.user.tag, id, robloxUser.username, robloxId, rank, verifiedRoleResult)],
    components: [updateButton()]
  });

  return true;
}

async function updateVerifiedRecord(interaction, robloxUsername) {
  const personnelRows = await getRows(PERSONNEL_RANGE);
  const rowNum = findUserRow(personnelRows, interaction.user.id);

  if (!rowNum) {
    await interaction.reply({
      embeds: [
        verificationSystemEmbed('NOT VERIFIED', 'You are not verified yet. Use `/verify` first.')
      ]
    });
    return true;
  }

  const robloxUser = await lookupRobloxUser(robloxUsername);

  if (!robloxUser) {
    await interaction.reply({
      embeds: [
        verificationSystemEmbed('ROBLOX USER NOT FOUND', 'That Roblox username was not found. Check the spelling and try again.')
      ]
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
      embeds: [
        verificationSystemEmbed('NOT VERIFIED', 'You are not verified yet. Use `/verify` first.')
      ]
    });
    return true;
  }

  const pendingRows = await getRows(PENDING_VERIFICATIONS_RANGE);
  const pendingRowNum = findPendingRow(pendingRows, interaction.user.id);

  if (!pendingRowNum) {
    await interaction.reply({
      embeds: [
        verificationSystemEmbed('NO PENDING UPDATE', 'You do not have a pending verification update. Run `/update` first.')
      ]
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
      embeds: [
        verificationSystemEmbed('ROBLOX USER NOT FOUND', 'Could not find that Roblox account. Run `/update` again.')
      ]
    });
    return true;
  }

  if (!robloxUser.description.includes(code)) {
    await interaction.reply({
      embeds: [
        verificationSystemEmbed(
          'UPDATE VERIFICATION FAILED',
          `Put this code in your Roblox About/Description, then run \`/confirmupdate\` again:\n\n\`${code}\``
        )
      ]
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

async function requireVerificationOwner(interaction) {
  if (isOwner(interaction.user.id)) return true;

  await interaction.reply({
    embeds: [
      verificationSystemEmbed('OWNER ONLY', 'Only the bot owner can use this verification management command.')
    ]
  });

  return false;
}

async function sendVerificationPrompt(member, guildName) {
  try {
    await member.user.send({
      embeds: [verificationPromptEmbed(guildName)]
    });

    return true;
  } catch (error) {
    console.error(`Verification prompt DM failed for ${member.id}:`, error);
    return false;
  }
}

async function handleCheckVerifyUser(interaction, targetUser, personnelRows) {
  if (targetUser.bot) {
    await sendVerificationResponse(
      interaction,
      verificationSystemEmbed('CHECK VERIFY COMPLETE', 'Bots do not need verification.')
    );
    return true;
  }

  if (findUserRow(personnelRows, targetUser.id)) {
    await sendVerificationResponse(
      interaction,
      verificationSystemEmbed(
        'CHECK VERIFY COMPLETE',
        `**${targetUser.tag}** is already verified in the personnel database.`
      )
    );
    return true;
  }

  const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

  if (!member) {
    await sendVerificationResponse(
      interaction,
      verificationSystemEmbed('CHECK VERIFY FAILED', 'That user is not a member of this server.')
    );
    return true;
  }

  const sent = await sendVerificationPrompt(member, interaction.guild.name);

  await sendVerificationResponse(
    interaction,
    verificationSystemEmbed(
      sent ? 'VERIFICATION PROMPT SENT' : 'VERIFICATION PROMPT FAILED',
      sent
        ? `Sent the verification prompt to **${targetUser.tag}**.`
        : `Could not DM **${targetUser.tag}**. They may have DMs disabled.`
    )
  );

  return true;
}

async function handleCheckVerifyAll(interaction) {
  await interaction.deferReply();

  const lastSent = Number(await getSetting(CHECKVERIFY_ALL_LAST_SENT_KEY));
  const now = Date.now();

  if (!Number.isNaN(lastSent) && now - lastSent < CHECKVERIFY_ALL_COOLDOWN_MS) {
    const availableAt = Math.ceil((lastSent + CHECKVERIFY_ALL_COOLDOWN_MS) / 1000);

    await interaction.editReply({
      embeds: [
        verificationSystemEmbed(
          'CHECK VERIFY COOLDOWN',
          `Bulk verification DMs can only be sent once every 24 hours.\nNext available: <t:${availableAt}:R>`
        )
      ]
    });
    return true;
  }

  const personnelRows = await getRows(PERSONNEL_RANGE);
  const members = await interaction.guild.members.fetch();
  const stats = {
    verified: 0,
    sent: 0,
    failed: 0,
    bots: 0
  };

  for (const member of members.values()) {
    if (member.user.bot) {
      stats.bots++;
      continue;
    }

    if (findUserRow(personnelRows, member.id)) {
      stats.verified++;
      continue;
    }

    const sent = await sendVerificationPrompt(member, interaction.guild.name);

    if (sent) {
      stats.sent++;
    } else {
      stats.failed++;
    }
  }

  await interaction.editReply({
    embeds: [checkVerifyEmbed('CHECK VERIFY COMPLETE', stats)]
  });

  await setSetting(CHECKVERIFY_ALL_LAST_SENT_KEY, String(now), 'Last /checkverify all run');

  return true;
}

async function handleCheckVerify(interaction) {
  if (!(await requireVerificationOwner(interaction))) return true;

  const target = interaction.options.getString('target');
  const targetUser = interaction.options.getUser('user');

  if (target === 'user') {
    if (!targetUser) {
      await sendVerificationResponse(
        interaction,
        verificationSystemEmbed('USER REQUIRED', 'Select a user when the target option is `user`.')
      );
      return true;
    }

    await interaction.deferReply();

    const personnelRows = await getRows(PERSONNEL_RANGE);
    return handleCheckVerifyUser(interaction, targetUser, personnelRows);
  }

  return handleCheckVerifyAll(interaction);
}

async function backfillVerifiedRole(guild, personnelRows, role) {
  const stats = {
    applied: 0,
    already: 0,
    missing: 0,
    failed: 0
  };

  for (const row of personnelRows.slice(1)) {
    const userId = row[2];

    if (!userId) continue;

    const member = await guild.members.fetch(userId).catch(() => null);

    if (!member) {
      stats.missing++;
      continue;
    }

    const result = await addVerifiedRole(member, role);

    if (result.status === 'applied') {
      stats.applied++;
    } else if (result.status === 'already_has_role') {
      stats.already++;
    } else {
      stats.failed++;
    }
  }

  return stats;
}

async function handleVerifiedRole(interaction) {
  if (!(await requireVerificationOwner(interaction))) return true;

  const role = interaction.options.getRole('role');

  if (role.name === '@everyone') {
    await interaction.reply({
      embeds: [
        verificationSystemEmbed('INVALID VERIFIED ROLE', 'You cannot use @everyone as the verified role.')
      ]
    });
    return true;
  }

  await interaction.deferReply();

  await setSetting(VERIFIED_ROLE_KEY, role.id, role.name);
  process.env.VERIFIED_ROLE_ID = role.id;

  const personnelRows = await getRows(PERSONNEL_RANGE);
  const stats = await backfillVerifiedRole(interaction.guild, personnelRows, role);

  await interaction.editReply({
    embeds: [verifiedRoleSetEmbed(role, stats)]
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
      await interaction.reply({
        embeds: [
          verificationSystemEmbed('USER NOT FOUND', 'That user is not in the personnel database.')
        ]
      });
      return true;
    }

    await interaction.reply({
      embeds: [profileEmbed(rows[rowNum - 1])]
    });

    return true;
  }

  if (interaction.commandName === 'checkverify') {
    return handleCheckVerify(interaction);
  }

  if (interaction.commandName === 'verifiedrole') {
    return handleVerifiedRole(interaction);
  }

  return false;
}

module.exports = {
  commands,
  handle
};
