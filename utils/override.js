const { EmbedBuilder } = require('discord.js');

function isOwner(userId) {
  return userId === process.env.OWNER_DISCORD_ID;
}

function isOverrideEnabled() {
  return (process.env.OVERRIDE_MODE || 'no').toLowerCase() === 'yes';
}

function isMaintenanceEnabled() {
  return (process.env.MAINTENANCE_MODE || 'no').toLowerCase() === 'yes';
}

function isPanicEnabled() {
  return (process.env.PANIC_LOCKDOWN || 'no').toLowerCase() === 'yes';
}

async function blockEmbed(interaction, title, description) {
  const ownerId = process.env.OWNER_DISCORD_ID || 'Not Set';

  const embed = new EmbedBuilder()
    .setColor(0x8B0000)
    .setTitle(title)
    .setDescription(description)
    .addFields(
      { name: 'Authorized Owner', value: ownerId !== 'Not Set' ? `<@${ownerId}>` : '`Not Set`' },
      { name: 'Authorized Owner ID', value: `\`${ownerId}\`` },
      { name: 'Your User ID', value: `\`${interaction.user.id}\`` }
    )
    .setFooter({ text: 'Scourge Control System' })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

async function checkOverride(interaction) {
  if (!interaction.isChatInputCommand()) return false;

  if (isOwner(interaction.user.id)) return false;

  if (isPanicEnabled()) {
    await blockEmbed(
      interaction,
      'PANIC LOCKDOWN ACTIVE',
      'The bot is currently in **Panic Lockdown**. Only the owner may use commands.'
    );
    return true;
  }

  if (isOverrideEnabled()) {
    await blockEmbed(
      interaction,
      'OVERRIDE MODE ACTIVE',
      'The bot is currently in **Override Mode**. Only the owner may use commands.'
    );
    return true;
  }

  if (isMaintenanceEnabled()) {
    await blockEmbed(
      interaction,
      'MAINTENANCE MODE ACTIVE',
      'The bot is currently in **Maintenance Mode**. Commands are temporarily disabled for non-owner users.'
    );
    return true;
  }

  return false;
}

module.exports = {
  checkOverride,
  isOwner
};
