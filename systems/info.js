const {
  SlashCommandBuilder,
  EmbedBuilder
} = require('discord.js');

const BOT_VERSION = 'v2.1.0';
const BOT_CREATOR = 'mastermyoda';

function helpEmbed() {
  return new EmbedBuilder()
    .setColor(0x880000)
    .setTitle('SCOURGE BOT HELP')
    .setDescription(
      `**Scourge Bot ${BOT_VERSION}**\n` +
      `Created by **${BOT_CREATOR}**\n\n` +
      `Use the command categories below to manage the system.`
    )
    .addFields(
      {
        name: 'Personnel',
        value:
          '`/verify roblox_username:<name>`\n' +
          '`/confirmverify`\n' +
          '`/update roblox_username:<name>`\n' +
          '`/confirmupdate`\n' +
          '`/profile user:@user`\n' +
          '`/checkverify target:<all|user> user:@user`\n' +
          '`/verifiedrole role:@role`'
      },
      {
        name: 'Moderation',
        value:
          '`/warn user:@user reason:<reason>`\n' +
          '`/punishments user:@user`'
      },
      {
        name: 'Ranks',
        value:
          '`/promote user:@user new_rank:@role reason:<reason>`\n' +
          '`/demote user:@user new_rank:@role reason:<reason>`\n' +
          '`/setrank user:@user new_rank:@role reason:<reason>`\n' +
          '`/rankhistory user:@user`\n' +
          '`/promotionlog`\n' +
          '`/demotionlog`\n' +
          '`/who_promoted user:@user`'
      },
      {
        name: 'Events',
        value:
          '`/event create name:<name> time:<time> host:@user`\n' +
          '`/event start name:<name>`\n' +
          '`/event end name:<name>`\n' +
          '`/event attendee event:<name> user:@user`\n' +
          '`/event attendance event:<name>`\n' +
          '`/event report event:<name>`'
      },
      {
        name: 'Reports',
        value:
          '`/report submit type:<type> details:<details>`\n' +
          '`/report list`\n' +
          '`/report view caseid:<id>`\n' +
          '`/report assign caseid:<id> staff:@user`\n' +
          '`/report close caseid:<id> result:<result>`'
      },
      {
        name: 'Admin',
        value:
          '`/admin addrole role:@role level:<level>`\n' +
          '`/admin setrolelevel role:@role level:<level>`\n' +
          '`/admin roles`\n' +
          '`/admin mypermission`\n' +
          '`/admin override_on`\n' +
          '`/admin override_off`\n' +
          '`/admin restart`\n' +
          '`/admin shutdown`'
      },
      {
        name: 'Info',
        value:
          '`/help`\n' +
          '`/ping`'
      }
    )
    .setFooter({ text: 'Scourge Bot • Command Help' })
    .setTimestamp();
}

function pingEmbed(interaction, sentAt) {
  const responseSpeed = Date.now() - sentAt;
  const websocketPing = interaction.client.ws.ping;

  return new EmbedBuilder()
    .setColor(0x008800)
    .setTitle('SCOURGE BOT STATUS')
    .addFields(
      { name: 'Status', value: '`Online`', inline: true },
      { name: 'Version', value: `\`${BOT_VERSION}\``, inline: true },
      { name: 'Created By', value: `\`${BOT_CREATOR}\``, inline: false },
      { name: 'Response Speed', value: `\`${responseSpeed}ms\``, inline: true },
      { name: 'WebSocket Ping', value: `\`${websocketPing}ms\``, inline: true },
      { name: 'Help Command', value: '`/help`', inline: false }
    )
    .setFooter({ text: 'Scourge Bot • System Information' })
    .setTimestamp();
}

const commands = [
  new SlashCommandBuilder()
    .setName('help')
    .setDescription('show bot command help'),

  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('show bot speed and status')
].map(c => c.toJSON());

async function handle(interaction) {
  if (!interaction.isChatInputCommand()) return false;

  if (interaction.commandName === 'help') {
    await interaction.reply({
      embeds: [helpEmbed()]
    });
    return true;
  }

  if (interaction.commandName === 'ping') {
    const sentAt = Date.now();

    await interaction.reply({
      embeds: [
        pingEmbed(interaction, sentAt)
      ]
    });

    return true;
  }

  return false;
}

module.exports = {
  commands,
  handle,
  BOT_VERSION,
  BOT_CREATOR
};
