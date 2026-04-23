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
    await interaction.reply({
      content: '⚠️ Bot is in override mode. Only the authorized owner may use commands.',
      ephemeral: true
    });
    return true;
  }

  return false;
}

module.exports = {
  checkOverride
};
