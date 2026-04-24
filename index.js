require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  ActivityType
} = require('discord.js');

const { checkOverride } = require('./utils/override');
const { logCommand } = require('./systems/logging');

const personnel = require('./systems/personnel');
const moderation = require('./systems/moderation');
const events = require('./systems/events');
const reports = require('./systems/reports');
const ranks = require('./systems/ranks');
const admin = require('./systems/admin');
const info = require('./systems/info');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

client.once('ready', () => {
  console.log('BOT ONLINE');

  client.user.setPresence({
    activities: [
      {
        name: `${info.BOT_VERSION} • Created by ${info.BOT_CREATOR} • /help`,
        type: ActivityType.Watching
      }
    ],
    status: 'online'
  });
});

async function safeLogCommand(interaction, result) {
  try {
    if (interaction.isChatInputCommand()) {
      await logCommand(interaction, result);
    }
  } catch (error) {
    console.error('Command logging failed:', error);
  }
}

client.on('interactionCreate', async interaction => {
  try {
    if (
      !interaction.isChatInputCommand() &&
      !interaction.isButton() &&
      !interaction.isModalSubmit()
    ) return;

    if (interaction.isChatInputCommand()) {
      const blocked = await checkOverride(interaction);

      if (blocked) {
        await safeLogCommand(interaction, 'Blocked by Override Mode');
        return;
      }

      await safeLogCommand(interaction, 'Allowed');
    }

    if (await info.handle(interaction)) return;
    if (await personnel.handle(interaction)) return;
    if (await moderation.handle(interaction)) return;
    if (await events.handle(interaction)) return;
    if (await reports.handle(interaction)) return;
    if (await ranks.handle(interaction)) return;
    if (await admin.handle(interaction)) return;

    if (interaction.isChatInputCommand()) {
      await safeLogCommand(interaction, 'Unhandled Command');
    }

  } catch (error) {
    console.error(error);

    if (interaction.isChatInputCommand()) {
      await safeLogCommand(interaction, 'Error');
    }

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: 'Something went wrong.'
      }).catch(() => {});
    } else {
      await interaction.reply({
        content: 'Something went wrong.'
      }).catch(() => {});
    }
  }
});

async function start() {
  const commands = [
    ...info.commands,
    ...personnel.commands,
    ...moderation.commands,
    ...events.commands,
    ...reports.commands,
    ...ranks.commands,
    ...admin.commands
  ];

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);

  await rest.put(
    Routes.applicationGuildCommands(
      process.env.DISCORD_CLIENT_ID,
      process.env.DISCORD_GUILD_ID
    ),
    { body: commands }
  );

  client.login(process.env.DISCORD_BOT_TOKEN);
}

start();
