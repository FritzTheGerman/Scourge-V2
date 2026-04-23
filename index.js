require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  REST,
  Routes
} = require('discord.js');

const { checkOverride } = require('./utils/override');

const personnel = require('./systems/personnel');
const moderation = require('./systems/moderation');
const events = require('./systems/events');
const reports = require('./systems/reports');
const ranks = require('./systems/ranks');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

client.once('ready', async () => {
  console.log('BOT ONLINE');
});

client.on('interactionCreate', async interaction => {
  try {
    if (!interaction.isChatInputCommand() && !interaction.isButton() && !interaction.isModalSubmit()) return;

    const blocked = await checkOverride(interaction);
    if (blocked) return;

    if (await personnel.handle(interaction)) return;
    if (await moderation.handle(interaction)) return;
    if (await events.handle(interaction)) return;
    if (await reports.handle(interaction)) return;
    if (await ranks.handle(interaction)) return;

  } catch (error) {
    console.error(error);

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: 'Something went wrong while processing that action.'
      }).catch(() => {});
    } else {
      await interaction.reply({
        content: 'Something went wrong while processing that action.'
      }).catch(() => {});
    }
  }
});

async function start() {
  const commands = [
    ...personnel.commands,
    ...moderation.commands,
    ...events.commands,
    ...reports.commands,
    ...ranks.commands
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
