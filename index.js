require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  ActivityType,
  EmbedBuilder
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
const lockdown = require('./systems/lockdown');

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

function getInteractionName(interaction) {
  if (interaction.isChatInputCommand()) return interaction.commandName;
  if (interaction.isButton()) return 'button';
  if (interaction.isModalSubmit()) return 'modal';
  return 'interaction';
}

function createErrorCode(interaction) {
  const command = getInteractionName(interaction)
    .replace(/[^a-z0-9]/gi, '')
    .toUpperCase()
    .slice(0, 16) || 'BOT';
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();

  return `${command}-${timestamp}-${random}`;
}

function errorEmbed(errorCode) {
  return new EmbedBuilder()
    .setColor(0x990000)
    .setTitle('COMMAND ERROR')
    .setDescription('Something went wrong while running this command.')
    .addFields(
      { name: 'Error Code', value: `\`${errorCode}\`` },
      { name: 'Next Step', value: 'Send this code to the bot developer.' }
    )
    .setFooter({ text: 'Scourge Error System' })
    .setTimestamp();
}

async function respondWithError(interaction, errorCode) {
  const payload = {
    embeds: [errorEmbed(errorCode)]
  };

  if (interaction.deferred && !interaction.replied) {
    await interaction.editReply(payload).catch(() => {});
    return;
  }

  if (interaction.replied) {
    await interaction.followUp(payload).catch(() => {});
    return;
  }

  await interaction.reply(payload).catch(() => {});
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

      safeLogCommand(interaction, 'Allowed');
    }

    if (await info.handle(interaction)) return;
    if (await personnel.handle(interaction)) return;
    if (await moderation.handle(interaction)) return;
    if (await events.handle(interaction)) return;
    if (await reports.handle(interaction)) return;
    if (await ranks.handle(interaction)) return;
    if (await admin.handle(interaction)) return;
    if (await lockdown.handle(interaction)) return;

    if (interaction.isChatInputCommand()) {
      await safeLogCommand(interaction, 'Unhandled Command');
    }

  } catch (error) {
    const errorCode = createErrorCode(interaction);

    console.error(`[${errorCode}] Interaction error:`, error);

    await respondWithError(interaction, errorCode);

    if (interaction.isChatInputCommand()) {
      safeLogCommand(interaction, `Error ${errorCode}`);
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
    ...admin.commands,
    ...lockdown.commands
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
