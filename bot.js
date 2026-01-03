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
function formatNumber(num) {
  if (typeof num !== 'number') num = Number(num) || 0;
  return num.toLocaleString('en-US'); // This adds commas
}
// Command definitions - BOTH COMMANDS REQUIRE ADMIN PERMS
const commands = [
  new SlashCommandBuilder()
    .setName('stats')
    .setDescription('View player stats from Firebase (Admin Only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator) // ADMIN ONLY
    .addStringOption(option =>
      option.setName('userid')  // FIXED: lowercase 'userid'
        .setDescription('Roblox User ID (number)')
        .setRequired(true)),
  
  new SlashCommandBuilder()
    .setName('setstats')
    .setDescription('Admin: Set player stats')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator) // ADMIN ONLY
    .addStringOption(option =>
      option.setName('userid')  // FIXED: lowercase 'userid'
        .setDescription('Roblox User ID (number)')
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
      content: 'You need **Administrator** permissions to use this command.', 
      ephemeral: true 
    });
    return;
  }

  if (commandName === 'stats') {
    const userIdInput = options.getString('userid');  // FIXED: lowercase 'userid'
    
    // Validate UserId is a number
    const userId = parseInt(userIdInput);
    if (isNaN(userId)) {
      await interaction.reply({ 
        content: 'Please enter a correct UserId.', 
        ephemeral: true 
      });
      return;
    }

    try {
      // Get username from Firebase if available
      const username = await getUsernameFromUserId(userId);
      const displayName = username || `${userId}`;
      
      const snapshot = await db.ref(`/${userId}`).once('value');
      const data = snapshot.val();
      
      if (!data) {
        await interaction.reply({ 
          content: `No stats found for ${userId}.`, 
          ephemeral: true 
        });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle(`Stats for ${displayName}`)
        .setColor(0x00AE86)
  .addFields(
  { name: '**Robux**', value: `<:smallrobux:1434592131271626772> **${formatNumber(data.robux || 0)}**`, inline: false },
  { name: '**Giftbux**', value: `<:giftbux:1400851141218013311> **${formatNumber(data.giftbux || 0)}**`, inline: true },
  { name: '**Donated**', value: `<:smallrobux:1434592131271626772> **${formatNumber(data.donated || 0)}**`, inline: false },
  { name: '**Raised**', value: `<:smallrobux:1434592131271626772> **${formatNumber(data.raised || 0)}**`, inline: false }
)
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error(error);
      await interaction.reply({ content: 'Error fetching stats.', ephemeral: false });
    }
  }

  if (commandName === 'setstats') {
    const userIdInput = options.getString('userid');  // FIXED: lowercase 'userid'
    const stat = options.getString('stat');
    const value = options.getInteger('value');
    
    // Validate UserId
    const userId = parseInt(userIdInput);
    if (isNaN(userId)) {
      await interaction.reply({ 
        content: 'Please enter a correct User ID.', 
        ephemeral: true 
      });
      return;
    }

    try {
      // Check if user exists first
      const snapshot = await db.ref(`/${userId}`).once('value');
      if (!snapshot.exists()) {
        await interaction.reply({ 
          content: `No player found with ${userId}.`, 
          ephemeral: true 
        });
        return;
      }
      
      await db.ref(`/${userId}/${stat}`).set(value);
      
      // Get username for display
      const username = await getUsernameFromUserId(userId);
      const displayName = username || `User ${userId}`;
      
      const embed = new EmbedBuilder()
        .setTitle('Stats Updated')
        .setColor(0x00FF00)
        .setDescription(`Set **${stat}** to **${value}** for ${displayName}`)
         .addFields(
                { name: '**Robux**', value: `<:smallrobux:1434592131271626772> **${formatNumber(updatedData.robux || 0)}**`, inline: false },
                { name: '**Giftbux**', value: `<:giftbux:1400851141218013311> **${formatNumber(updatedData.giftbux || 0)}**`, inline: true },
                { name: '**Donated**', value: `<:smallrobux:1434592131271626772> **${formatNumber(updatedData.donated || 0)}**`, inline: false },
                { name: '**Raised**', value: `<:smallrobux:1434592131271626772> **${formatNumber(updatedData.raised || 0)}**`, inline: false }
            )
            .addFields(
                { name: '**User ID**', value: `**${userId}**`, inline: true }
            )
            .setTimestamp();


      await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error) {
      console.error(error);
      await interaction.reply({ content: 'Error updating stats.', ephemeral: true });
    }
  }
});

// Helper function to get username from UserId
async function getUsernameFromUserId(userId) {
  try {
    const snapshot = await db.ref(`/${userId}/username`).once('value');
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



