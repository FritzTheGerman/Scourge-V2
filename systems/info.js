const {
  SlashCommandBuilder,
  EmbedBuilder
} = require('discord.js');

const BOT_VERSION = '1.09.3';
const BOT_CREATOR = 'mastermyoda';

function ownerMention() {
  return process.env.OWNER_DISCORD_ID
    ? `<@${process.env.OWNER_DISCORD_ID}>`
    : 'the server owner';
}

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
          '`/ping`\n' +
          '`/privacy`\n' +
          '`/support`'
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

function privacyEmbed() {
  return new EmbedBuilder()
    .setColor(0x880000)
    .setTitle('SCOURGE BOT PRIVACY')
    .setDescription('This bot stores only the information needed to run verification, moderation, rank, event, report, and command logging systems.')
    .addFields(
      {
        name: 'Data Stored',
        value:
          '`Discord username and ID`\n' +
          '`Discord role/rank information`\n' +
          '`Roblox username and ID`\n' +
          '`Verification codes and timestamps`\n' +
          '`Moderation, rank, report, event, and command logs`'
      },
      {
        name: 'Purpose',
        value: 'The data is used to verify members, manage personnel records, run moderation/rank systems, and maintain server logs.'
      },
      {
        name: 'Storage',
        value: 'Data is stored in the Google Sheet configured by the server owner.'
      },
      {
        name: 'Data Requests',
        value: `To ask for your data, request a correction, or request deletion, contact ${ownerMention()} or run \`/support\`.`
      },
      {
        name: 'Safety',
        value: 'The bot will never ask for your Discord password, Discord token, Roblox password, or any login credentials.'
      }
    )
    .setFooter({ text: 'Scourge Bot â€¢ Privacy Information' })
    .setTimestamp();
}

function supportEmbed() {
  return new EmbedBuilder()
    .setColor(0x880000)
    .setTitle('SCOURGE BOT SUPPORT')
    .setDescription(`For bot support, data requests, or policy concerns, contact ${ownerMention()}.`)
    .addFields(
      {
        name: 'Include',
        value: '`Your Discord username and ID`\n`What you need help with`\n`Any error code the bot showed you`'
      },
      {
        name: 'Discord Policy Reports',
        value: 'If you believe the bot or server violates Discord policy, use Discord\'s in-app report tools or official support channels.'
      }
    )
    .setFooter({ text: 'Scourge Bot â€¢ Support' })
    .setTimestamp();
}

const commands = [
  new SlashCommandBuilder()
    .setName('help')
    .setDescription('show bot command help'),

  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('show bot speed and status'),

  new SlashCommandBuilder()
    .setName('privacy')
    .setDescription('show bot privacy and data information'),

  new SlashCommandBuilder()
    .setName('support')
    .setDescription('show bot support and data request information')
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

  if (interaction.commandName === 'privacy') {
    await interaction.reply({
      embeds: [privacyEmbed()]
    });
    return true;
  }

  if (interaction.commandName === 'support') {
    await interaction.reply({
      embeds: [supportEmbed()]
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
