const { getRows } = require('./sheets');
const { ADMIN_ROLES_RANGE } = require('../config');

function isOwner(userId) {
  return userId === process.env.OWNER_DISCORD_ID;
}

async function getPermissionLevel(member) {
  if (isOwner(member.id)) return 999;

  const rows = await getRows(ADMIN_ROLES_RANGE);

  let highestLevel = 0;

  for (const row of rows.slice(1)) {
    const roleId = row[1];
    const level = Number(row[2]);

    if (!roleId || Number.isNaN(level)) continue;

    if (member.roles.cache.has(roleId)) {
      if (level > highestLevel) highestLevel = level;
    }
  }

  return highestLevel;
}

async function requireLevel(interaction, requiredLevel) {
  const member = await interaction.guild.members.fetch(interaction.user.id);
  const userLevel = await getPermissionLevel(member);

  if (userLevel < requiredLevel) {
    await interaction.reply({
      content:
        `You do not have permission to use this command.\n` +
        `Required Level: ${requiredLevel}\n` +
        `Your Level: ${userLevel}`,
      ephemeral: true
    });

    return false;
  }

  return true;
}

async function requireOwner(interaction) {
  if (!isOwner(interaction.user.id)) {
    await interaction.reply({
      content: 'Only the bot owner can use this command.',
      ephemeral: true
    });

    return false;
  }

  return true;
}

module.exports = {
  isOwner,
  getPermissionLevel,
  requireLevel,
  requireOwner
};
