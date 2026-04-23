require('dotenv').config();

const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');
const { google } = require('googleapis');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

const RANK_ROLES = [
  "Cadet",
  "Initiate",
  "Veteran Warrior",
  "Chief Enforcer",
  "Blood Marshal",
  "Elite Conqueror"
];

const sheets = new google.sheets({
  version: 'v4',
  auth: new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  }),
});

function getRank(member) {
  const roles = member.roles.cache.map(r => r.name);
  return RANK_ROLES.find(r => roles.includes(r)) || "No Rank";
}

async function addRow(data) {
  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: 'A:E',
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [data],
    },
  });
}

client.once('ready', () => {
  console.log("BOT ONLINE");
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'verify') {
    const roblox = interaction.options.getString('username');
    const member = await interaction.guild.members.fetch(interaction.user.id);

    const rank = getRank(member);

    await addRow([
      interaction.user.tag,
      interaction.user.id,
      rank,
      roblox,
      new Date().toISOString()
    ]);

    await interaction.reply("Verified and saved.");
  }
});

async function start() {
  const commands = [
    new SlashCommandBuilder()
      .setName('verify')
      .setDescription('verify yourself')
      .addStringOption(o =>
        o.setName('username')
          .setDescription('roblox username')
          .setRequired(true)
      )
      .toJSON()
  ];

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);

  await rest.put(
    Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.DISCORD_GUILD_ID),
    { body: commands }
  );

  client.login(process.env.DISCORD_BOT_TOKEN);
}

start();
