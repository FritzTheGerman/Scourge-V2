const {
  SlashCommandBuilder,
  EmbedBuilder
} = require('discord.js');

const { getRows, updateRows, clearRange, ensureSheet } = require('../utils/sheets');
const { LOCKDOWN_BACKUP_SHEET, LOCKDOWN_BACKUP_RANGE } = require('../config');
const { getPermissionLevel } = require('../utils/permissions');
const { getCSTTime } = require('../utils/time');

const REQUIRED_LEVEL = 5;

const LOCKDOWN_DENIES = {
  SendMessages: false,
  SendMessagesInThreads: false,
  CreatePublicThreads: false,
  CreatePrivateThreads: false
};

/* ---------------- HELPERS ---------------- */

function hasChannelOverwrites(channel) {
  return Boolean(channel?.permissionOverwrites?.cache);
}

function serializeOverwrite(overwrite) {
  if (!overwrite) {
    return {
      hadOverwrite: 'no',
      allow: '0',
      deny: '0'
    };
  }

  return {
    hadOverwrite: 'yes',
    allow: overwrite.allow.bitfield.toString(),
    deny: overwrite.deny.bitfield.toString()
  };
}

function parseBitfield(value) {
  try {
    return BigInt(String(value || '0'));
  } catch {
    return 0n;
  }
}

function buildCurrentOverwrites(channel, everyoneRoleId, savedAllow, savedDeny) {
  const overwrites = channel.permissionOverwrites.cache
    .filter(overwrite => overwrite.id !== everyoneRoleId)
    .map(overwrite => ({
      id: overwrite.id,
      type: overwrite.type,
      allow: overwrite.allow.bitfield,
      deny: overwrite.deny.bitfield
    }));

  overwrites.push({
    id: everyoneRoleId,
    type: 0,
    allow: parseBitfield(savedAllow),
    deny: parseBitfield(savedDeny)
  });

  return overwrites;
}

async function getBackupRows() {
  await ensureSheet(LOCKDOWN_BACKUP_SHEET);
  return getRows(LOCKDOWN_BACKUP_RANGE);
}

function getActiveBackupRows(rows) {
  return rows.slice(1).filter(row => row[0]);
}

async function requireLockdownLevel(interaction) {
  const member = await interaction.guild.members.fetch(interaction.user.id);
  const level = await getPermissionLevel(member);

  if (level < REQUIRED_LEVEL) {
    await interaction.reply({
      embeds: [
        systemEmbed(
          'LOCKDOWN DENIED',
          `You need permission level \`${REQUIRED_LEVEL}\` to use this command.\nYour level: \`${level}\``
        )
      ]
    });
    return false;
  }

  return true;
}

/* ---------------- EMBEDS ---------------- */

function systemEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(0x990000)
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: 'Scourge Lockdown System' })
    .setTimestamp();
}

function summaryEmbed(title, description, stats) {
  return new EmbedBuilder()
    .setColor(0x990000)
    .setTitle(title)
    .setDescription(description)
    .addFields(
      { name: 'Channels Updated', value: `\`${stats.updated}\``, inline: true },
      { name: 'Channels Skipped', value: `\`${stats.skipped}\``, inline: true },
      { name: 'Failed', value: `\`${stats.failed}\``, inline: true }
    )
    .setFooter({ text: 'Scourge Lockdown System' })
    .setTimestamp();
}

/* ---------------- COMMANDS ---------------- */

const commands = [
  new SlashCommandBuilder()
    .setName('shithitthefan')
    .setDescription('level 5: lock all channels from member messages'),

  new SlashCommandBuilder()
    .setName('shitcleanedup')
    .setDescription('level 5: restore channel permissions from the lockdown backup')
].map(command => command.toJSON());

/* ---------------- ACTIONS ---------------- */

async function handleLockdown(interaction) {
  if (!(await requireLockdownLevel(interaction))) return true;

  await interaction.deferReply();

  const existingBackupRows = getActiveBackupRows(await getBackupRows());

  if (existingBackupRows.length) {
    await interaction.editReply({
      embeds: [
        systemEmbed(
          'LOCKDOWN ALREADY ACTIVE',
          'A lockdown backup already exists. Run `/shitcleanedup` before starting another lockdown.'
        )
      ]
    });
    return true;
  }

  const everyoneRole = interaction.guild.roles.everyone;
  const channels = await interaction.guild.channels.fetch();
  const backupRows = [
    ['Channel ID', 'Channel Name', 'Had Everyone Overwrite', 'Allow', 'Deny', 'Locked At']
  ];
  const lockTargets = [];

  for (const channel of channels.values()) {
    if (!hasChannelOverwrites(channel)) continue;

    const overwrite = channel.permissionOverwrites.cache.get(everyoneRole.id);
    const backup = serializeOverwrite(overwrite);

    backupRows.push([
      channel.id,
      channel.name || 'Unknown Channel',
      backup.hadOverwrite,
      backup.allow,
      backup.deny,
      getCSTTime()
    ]);

    lockTargets.push(channel);
  }

  if (backupRows.length <= 1) {
    await interaction.editReply({
      embeds: [
        systemEmbed('NO CHANNELS FOUND', 'No channels with editable permission overwrites were found.')
      ]
    });
    return true;
  }

  await clearRange(LOCKDOWN_BACKUP_RANGE);
  await updateRows(`${LOCKDOWN_BACKUP_SHEET}!A1:F${backupRows.length}`, backupRows);

  const stats = {
    updated: 0,
    skipped: channels.size - lockTargets.length,
    failed: 0
  };

  for (const channel of lockTargets) {
    try {
      await channel.permissionOverwrites.edit(
        everyoneRole,
        LOCKDOWN_DENIES,
        { reason: `Raid lockdown started by ${interaction.user.tag}` }
      );
      stats.updated++;
    } catch (error) {
      console.error(`Lockdown failed for channel ${channel.id}:`, error);
      stats.failed++;
    }
  }

  if (stats.updated === 0) {
    await clearRange(LOCKDOWN_BACKUP_RANGE);
  }

  await interaction.editReply({
    embeds: [
      summaryEmbed(
        stats.updated > 0 ? 'SERVER LOCKDOWN ACTIVE' : 'SERVER LOCKDOWN FAILED',
        stats.updated > 0
          ? 'Members can no longer send messages in locked channels. Previous `@everyone` channel overwrites were saved for cleanup.'
          : 'No channels were locked. The lockdown backup was cleared because no channel permissions changed.',
        stats
      )
    ]
  });

  return true;
}

async function handleCleanup(interaction) {
  if (!(await requireLockdownLevel(interaction))) return true;

  await interaction.deferReply();

  const backupRows = getActiveBackupRows(await getBackupRows());

  if (!backupRows.length) {
    await interaction.editReply({
      embeds: [
        systemEmbed('NO LOCKDOWN BACKUP', 'No lockdown backup exists. There is nothing to restore.')
      ]
    });
    return true;
  }

  const everyoneRole = interaction.guild.roles.everyone;
  const channels = await interaction.guild.channels.fetch();
  const stats = {
    updated: 0,
    skipped: 0,
    failed: 0
  };

  for (const row of backupRows) {
    const channelId = row[0];
    const hadOverwrite = row[2] === 'yes';
    const allow = row[3] || '0';
    const deny = row[4] || '0';
    const channel = channels.get(channelId);

    if (!hasChannelOverwrites(channel)) {
      stats.skipped++;
      continue;
    }

    try {
      if (hadOverwrite) {
        await channel.permissionOverwrites.set(
          buildCurrentOverwrites(channel, everyoneRole.id, allow, deny),
          `Raid lockdown cleaned up by ${interaction.user.tag}`
        );
      } else {
        await channel.permissionOverwrites.delete(
          everyoneRole,
          `Raid lockdown cleaned up by ${interaction.user.tag}`
        ).catch(error => {
          if (error?.code !== 10009) throw error;
        });
      }

      stats.updated++;
    } catch (error) {
      console.error(`Lockdown cleanup failed for channel ${channelId}:`, error);
      stats.failed++;
    }
  }

  const restoredCleanly = stats.failed === 0;

  if (restoredCleanly) {
    await clearRange(LOCKDOWN_BACKUP_RANGE);
  }

  await interaction.editReply({
    embeds: [
      summaryEmbed(
        restoredCleanly ? 'SERVER LOCKDOWN CLEANED UP' : 'LOCKDOWN CLEANUP INCOMPLETE',
        restoredCleanly
          ? 'Saved `@everyone` channel overwrites have been restored where possible.'
          : 'Some channels failed to restore. The lockdown backup was kept so you can rerun `/shitcleanedup`.',
        stats
      )
    ]
  });

  return true;
}

/* ---------------- HANDLER ---------------- */

async function handle(interaction) {
  if (!interaction.isChatInputCommand()) return false;

  if (interaction.commandName === 'shithitthefan') {
    return handleLockdown(interaction);
  }

  if (interaction.commandName === 'shitcleanedup') {
    return handleCleanup(interaction);
  }

  return false;
}

module.exports = {
  commands,
  handle
};
