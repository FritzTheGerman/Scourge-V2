require('dotenv').config();

const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');
const { google } = require('googleapis');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

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
  const roles = member.roles.cache
    .filter(role => role.name !== '@everyone')
    .sort((a, b) => b.position - a.position);

  return roles.first()?.name || 'No Rank';
}

async function getAllRows() {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: 'A:F',
  });

  return response.data.values || [];
}

async function ensureHeader() {
  const rows = await getAllRows();

  if (rows.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: 'A1:F1',
      valueInputOption: 'RAW',
      requestBody: {
        values: [[
          'ID Number',
          'Discord Username',
          'Discord ID',
          'Discord Role',
          'Roblox Username',
          'Last Updated'
        ]]
      }
    });
  }
}

function findUserRow(rows, discordId) {
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][2] === discordId) {
      return i + 1; // actual sheet row number
    }
  }
  return null;
}

function getNextId(rows) {
  if (rows.length <= 1) return 1;

  const ids = rows
    .slice(1)
    .map(row => Number(row[0]))
    .filter(id => !Number.isNaN(id));

  if (ids.length === 0) return 1;
  return Math.max(...ids) + 1;
}

async function addRow(data) {
  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: 'A:F',
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [data],
    },
  });
}

async function updateRow(rowNumber, data) {
  await sheets.spreadsheets.values.update({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `A${rowNumber}:F${rowNumber}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [data],
    },
  });
}

client.once('ready', async () => {
  await ensureHeader();
  console.log('BOT ONLINE');
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const member = await interaction.guild.members.fetch(interaction.user.id);
  const role = getRank(member);
  const robloxUsername = interaction.options.getString('roblox_username');
  const rows = await getAllRows();
  const existingRowNumber = findUserRow(rows, interaction.user.id);

  if (interaction.commandName === 'verify') {
    if (existingRowNumber) {
      await interaction.reply({
        content: 'You are already verified. Use /update instead.',
        ephemeral: true
      });
      return;
    }

    const idNumber = getNextId(rows);

    await addRow([
      idNumber,
      interaction.user.tag,
      interaction.user.id,
      role,
      robloxUsername,
      new Date().toISOString()
    ]);

    await interaction.reply({
      content: `Verified and saved. Your ID number is ${idNumber}. Detected role: ${role}`,
      ephemeral: true
    });
  }

  if (interaction.commandName === 'update') {
    if (!existingRowNumber) {
      await interaction.reply({
        content: 'You are not verified yet. Use /verify first.',
        ephemeral: true
      });
      return;
    }

    const existingId = rows[existingRowNumber - 1][0];

    await updateRow(existingRowNumber, [
      existingId,
      interaction.user.tag,
      interaction.user.id,
      role,
      robloxUsername,
      new Date().toISOString()
    ]);

    await interaction.reply({
      content: `Your information was updated. Detected role: ${role}`,
      ephemeral: true
    });
  }
});

async function start() {
  const commands = [
    new SlashCommandBuilder()
      .setName('verify')
      .setDescription('verify yourself for the first time')
      .addStringOption(o =>
        o.setName('roblox_username')
          .setDescription('roblox username')
          .setRequired(true)
      )
      .toJSON(),

    new SlashCommandBuilder()
      .setName('update')
      .setDescription('update your existing spreadsheet entry')
      .addStringOption(o =>
        o.setName('roblox_username')
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
