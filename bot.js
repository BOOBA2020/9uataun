const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, Routes } = require('discord.js');
const { REST } = require('@discordjs/rest');
const admin = require('firebase-admin');
const http = require('http');
require('dotenv').config();

// Initialize Firebase Admin SDK
const serviceAccount = {
  type: "service_account",
  project_id: "pd99newbro",
  private_key_id: "c7807a4082d0c7714d0ee1bed4c4ed0bdb770b55",
  private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  client_email: "firebase-adminsdk-fbsvc@pd99newbro.iam.gserviceaccount.com",
  client_id: "111359717278596276727",
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url: "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-fbsvc%40pd99newbro.iam.gserviceaccount.com"
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://pd99newbro-default-rtdb.europe-west1.firebasedatabase.app"
});

const db = admin.database();
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Command definitions - BOTH COMMANDS REQUIRE ADMIN PERMS
const commands = [
  new SlashCommandBuilder()
    .setName('stats')
    .setDescription('View player stats from Firebase (Admin Only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator) // ADMIN ONLY
    .addStringOption(option =>
      option.setName('username')
        .setDescription('Roblox username')
        .setRequired(true)),
  
  new SlashCommandBuilder()
    .setName('setstats')
    .setDescription('Admin: Set player stats')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator) // ADMIN ONLY
    .addStringOption(option =>
      option.setName('username')
        .setDescription('Roblox username')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('stat')
        .setDescription('Stat to modify')
        .setRequired(true)
        .addChoices(
          { name: 'Robux', value: 'robux' },
          { name: 'Giftbux', value: 'giftbux' },
          { name: 'Donated', value: 'donated' },
          { name: 'Raised', value: 'raised' }
        ))
    .addIntegerOption(option =>
      option.setName('value')
        .setDescription('New value')
        .setRequired(true))
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

// Register commands AFTER bot is ready
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}!`);
  
  try {
    console.log('🔄 Registering slash commands...');
    
    if (process.env.GUILD_ID) {
      // Guild-specific commands
      await rest.put(
        Routes.applicationGuildCommands(client.user.id, process.env.GUILD_ID),
        { body: commands }
      );
      console.log(`✅ Commands registered for guild: ${process.env.GUILD_ID}`);
    } else {
      // Global commands
      await rest.put(
        Routes.applicationCommands(client.user.id),
        { body: commands }
      );
      console.log('✅ Commands registered globally');
    }
  } catch (error) {
    console.error('❌ Error registering commands:', error);
  }
});

// Bot events
client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;

  const { commandName, options, member } = interaction;

  // Check if user has Administrator permission for BOTH commands
  if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ 
      content: '❌ You need **Administrator** permissions to use this command.', 
      ephemeral: true 
    });
    return;
  }

  if (commandName === 'stats') {
    const username = options.getString('username');
    
    const userId = await getUserIdFromUsername(username);
    
    if (!userId) {
      await interaction.reply({ content: `Player "${username}" not found.`, ephemeral: true });
      return;
    }

    try {
      const snapshot = await db.ref(`/${userId}`).once('value');
      const data = snapshot.val();
      
      if (!data) {
        await interaction.reply({ content: `No stats found for ${username}.`, ephemeral: true });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle(`📊 Stats for ${username}`)
        .setColor(0x00AE86)
        .addFields(
          { name: '🪙 Robux', value: `${data.robux || 0}`, inline: true },
          { name: '🎁 Giftbux', value: `${data.giftbux || 0}`, inline: true },
          { name: '📤 Donated', value: `${data.donated || 0}`, inline: true },
          { name: '📥 Raised', value: `${data.raised || 0}`, inline: true }
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error(error);
      await interaction.reply({ content: 'Error fetching stats.', ephemeral: true });
    }
  }

  if (commandName === 'setstats') {
    const username = options.getString('username');
    const stat = options.getString('stat');
    const value = options.getInteger('value');
    
    const userId = await getUserIdFromUsername(username);
    
    if (!userId) {
      await interaction.reply({ content: `Player "${username}" not found.`, ephemeral: true });
      return;
    }

    try {
      await db.ref(`/${userId}/${stat}`).set(value);
      
      const embed = new EmbedBuilder()
        .setTitle('✅ Stats Updated')
        .setColor(0x00FF00)
        .setDescription(`Set **${stat}** to **${value}** for ${username}`)
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error) {
      console.error(error);
      await interaction.reply({ content: 'Error updating stats.', ephemeral: true });
    }
  }
});

// Helper function to get UserId from username
async function getUserIdFromUsername(username) {
  try {
    const snapshot = await db.ref(`/usernames/${username.toLowerCase()}`).once('value');
    return snapshot.val();
  } catch (error) {
    console.error('Username lookup error:', error);
    return null;
  }
}

// HTTP server for Render
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Discord Bot is online');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🌐 HTTP server listening on port ${PORT} for Render health checks`);
});

// Login
client.login(process.env.DISCORD_TOKEN).catch(error => {
  console.error('❌ Failed to login:', error);
});


