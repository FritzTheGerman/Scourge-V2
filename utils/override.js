const { EmbedBuilder } = require('discord.js');

function isOwner(userId) {
  return userId === process.env.OWNER_DISCORD_ID;
}

function isOverrideEnabled() {
  return (process.env.OVERRIDE_MODE || 'no').toLowerCase() === 'yes';
}

async function checkOverride(interaction) {
  if (!interaction.isChatInputCommand()) return false;

  if (isOwner(interaction.user.id)) return false;

  if (isOverrideEnabled()) {
    const ownerId = process.env.OWNER_DISCORD_ID || 'Not Set';

    const embed = new EmbedBuilder()
      .setColor(0x8B0000)
      .setTitle('OVERRIDE MODE ACTIVE')
      .setDescription('The bot is currently in **Override Mode**. Only the owner may use commands.')
      .addFields(
        { name: 'Authorized Owner', value: ownerId !== 'Not Set' ? `<@${ownerId}>` : '`Not Set`' },
        { name: 'Authorized Owner ID', value: `\`${ownerId}\`` },
        { name: 'Your User ID', value: `\`${interaction.user.id}\`` }
      )
      .setFooter({ text: 'Scourge Override System' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
    return true;
  }

  return false;
}

module.exports = {
  checkOverride,
  isOwner
};
