require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
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

function formatIdNumber(id) {
  return String(id).padStart(4, '0');
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
      return i + 1;
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

function buildVerifyEmbed(discordName, idNumber, robloxUsername, role) {
  return new EmbedBuilder()
    .setColor(0x8B0000)
    .setTitle('EMPIRE DATABASE ENTRY RECORDED')
    .setDescription(
      `Hello **${discordName}**\n\n` +
      `The following information has been successfully logged in the Empire Database.`
    )
    .addFields(
      {
        name: 'ID Number Issued',
        value: `\`${formatIdNumber(idNumber)}\``,
        inline: false
      },
      {
        name: 'Roblox Username Logged',
        value: `\`${robloxUsername}\``,
        inline: false
      },
      {
        name: 'Rank Logged',
        value: `\`${role}\``,
        inline: false
      },
      {
        name: 'Status',
        value: '`Verified`',
        inline: false
      }
    )
    .setFooter({
      text: 'Empire Verification System • Database Entry Confirmed'
    })
    .setTimestamp();
}

function buildUpdateEmbed(discordName, idNumber, robloxUsername, role) {
  return new EmbedBuilder()
    .setColor(0x4B0000)
    .setTitle('EMPIRE DATABASE ENTRY UPDATED')
    .setDescription(
      `Hello **${discordName}**\n\n` +
      `Your personnel record has been successfully updated in the Empire Database.`
    )
    .addFields(
      {
        name: 'ID Number Retained',
        value: `\`${formatIdNumber(idNumber)}\``,
        inline: false
      },
      {
        name: 'Roblox Username Logged',
        value: `\`${robloxUsername}\``,
        inline: false
      },
      {
        name: 'Rank Logged',
        value: `\`${role}\``,
        inline: false
      },
      {
        name: 'Status',
        value: '`Updated`',
        inline: false
      }
    )
    .setFooter({
      text: 'Empire Verification System • Record Successfully Updated'
    })
    .setTimestamp();
}

function buildUpdateButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('open_update_modal')
      .setLabel('Update Record')
      .setStyle(ButtonStyle.Danger)
  );
}

function buildUpdateModal() {
  const modal = new ModalBuilder()
    .setCustomId('update_modal')
    .setTitle('Update Verification Record');

  const robloxInput = new TextInputBuilder()
    .setCustomId('roblox_username')
    .setLabel('Roblox Username')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(32)
    .setPlaceholder('Enter your Roblox username');

  const row = new ActionRowBuilder().addComponents(robloxInput);
  modal.addComponents(row);

  return modal;
}

client.once('ready', async () => {
  await ensureHeader();
  console.log('BOT ONLINE');
});

client.on('interactionCreate', async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      const member = await interaction.guild.members.fetch(interaction.user.id);
      const role = getRank(member);
      const rows = await getAllRows();
      const existingRowNumber = findUserRow(rows, interaction.user.id);

      if (interaction.commandName === 'verify') {
        const robloxUsername = interaction.options.getString('roblox_username');

        if (existingRowNumber) {
          await interaction.reply({
            content: 'You are already verified. Use /update or press the Update Record button on your verification message.'
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

        const embed = buildVerifyEmbed(interaction.user.tag, idNumber, robloxUsername, role);

        await interaction.reply({
          embeds: [embed],
          components: [buildUpdateButton()]
        });
        return;
      }

      if (interaction.commandName === 'update') {
        if (!existingRowNumber) {
          await interaction.reply({
            content: 'You are not verified yet. Use /verify first.'
          });
          return;
        }

        const robloxUsername = interaction.options.getString('roblox_username');
        const existingId = rows[existingRowNumber - 1][0];

        await updateRow(existingRowNumber, [
          existingId,
          interaction.user.tag,
          interaction.user.id,
          role,
          robloxUsername,
          new Date().toISOString()
        ]);

        const embed = buildUpdateEmbed(interaction.user.tag, existingId, robloxUsername, role);

        await interaction.reply({
          embeds: [embed],
          components: [buildUpdateButton()]
        });
        return;
      }
    }

    if (interaction.isButton()) {
      if (interaction.customId === 'open_update_modal') {
        await interaction.showModal(buildUpdateModal());
        return;
      }
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId === 'update_modal') {
        const robloxUsername = interaction.fields.getTextInputValue('roblox_username');
        const member = await interaction.guild.members.fetch(interaction.user.id);
        const role = getRank(member);
        const rows = await getAllRows();
        const existingRowNumber = findUserRow(rows, interaction.user.id);

        if (!existingRowNumber) {
          await interaction.reply({
            content: 'You are not verified yet. Use /verify first.'
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

        const embed = buildUpdateEmbed(interaction.user.tag, existingId, robloxUsername, role);

        await interaction.reply({
          embeds: [embed],
          components: [buildUpdateButton()]
        });
        return;
      }
    }
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
