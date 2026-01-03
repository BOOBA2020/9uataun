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
  private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'), // Store in .env!
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

// Command definitions
const commands = [
  new SlashCommandBuilder()
    .setName('stats')
    .setDescription('View player stats from Firebase')
    .addStringOption(option =>
      option.setName('username')
        .setDescription('Roblox username')
        .setRequired(true)),
  
  new SlashCommandBuilder()
    .setName('setstats')
    .setDescription('Admin: Set player stats')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
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

// Register commands
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('Registering slash commands...');
    await rest.put(
      Routes.applicationGuildCommands(client.user.id, process.env.GUILD_ID),
      { body: commands }
    );
    console.log('Commands registered!');
  } catch (error) {
    console.error(error);
  }
})();

// Bot events
client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;

  const { commandName, options, member } = interaction;

  // Check if user has admin role
  const hasAdminRole = member.roles.cache.has(process.env.ADMIN_ROLE_ID);

  if (commandName === 'stats') {
    const username = options.getString('username');
    
    // Find UserId from username (you'll need to implement this)
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
    if (!hasAdminRole) {
      await interaction.reply({ content: 'You need admin permissions to use this command.', ephemeral: true });
      return;
    }

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
  // You need to implement this based on how your system stores usernames
  // This is a placeholder - you might need a separate lookup table
  try {
    // If you have a username-to-ID mapping in Firebase
    const snapshot = await db.ref(`/usernames/${username.toLowerCase()}`).once('value');
    return snapshot.val();
  } catch (error) {
    console.error('Username lookup error:', error);
    return null;
  }
}
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Discord Bot is online');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ HTTP server listening on port ${PORT} for Render health checks`);
});
// Login
client.login(process.env.DISCORD_TOKEN);

