const { EmbedBuilder } = require('discord.js');

function isOverrideEnabled() {
  return (process.env.OVERRIDE_MODE || 'no').toLowerCase() === 'yes';
}

function isOwner(userId) {
  return userId === process.env.OWNER_DISCORD_ID;
}

async function checkOverride(interaction) {
  if (
    interaction.isChatInputCommand() &&
    isOverrideEnabled() &&
    !isOwner(interaction.user.id)
  ) {
    const ownerId = process.env.OWNER_DISCORD_ID || 'Not Set';

    const embed = new EmbedBuilder()
      .setColor(0x8B0000)
      .setTitle('OVERRIDE MODE ACTIVE')
      .setDescription(
        `The bot is currently in **Override Mode**.\n\n` +
        `Only the authorized owner may use commands at this time.`
      )
      .addFields(
        {
          name: 'Authorized User',
          value: `<@${ownerId}>`,
          inline: false
        },
        {
          name: 'Authorized User ID',
          value: `\`${ownerId}\``,
          inline: false
        },
        {
          name: 'Your User ID',
          value: `\`${interaction.user.id}\``,
          inline: false
        }
      )
      .setFooter({ text: 'Scourge Override System' })
      .setTimestamp();

    await interaction.reply({
      embeds: [embed]
    });

    return true;
  }

  return false;
}

module.exports = {
  checkOverride
};
