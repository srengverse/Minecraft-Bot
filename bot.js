const mineflayer = require('mineflayer');
const Movements = require('mineflayer-pathfinder').Movements;
const pathfinder = require('mineflayer-pathfinder').pathfinder;
const { GoalBlock } = require('mineflayer-pathfinder').goals;
const express = require('express');
const config = require('./settings.json');

// Express server to keep the bot alive on some hosting services
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Bot is online and running!');
});

app.listen(port, () => {
  console.log(`[Web] Dashboard available at port ${port}`);
});

let bot;

function createBot() {
   console.log('[System] Initializing bot...');
   
   bot = mineflayer.createBot({
      host: config.server.ip,
      port: config.server.port,
      username: config['bot-account'].username,
      password: config['bot-account'].password || undefined,
      version: config.server.version,
      auth: config['bot-account'].type === 'microsoft' ? 'microsoft' : 'offline',
      checkTimeoutInterval: 60 * 1000 // Increase timeout to avoid ghost kicks
   });

   bot.loadPlugin(pathfinder);

   console.log(`[System] Attempting to connect to ${config.server.ip}:${config.server.port}...`);

   bot.on('connect', () => {
      console.log('\x1b[36m[System] Connected to server socket. Logging in...\x1b[0m');
   });

   bot.on('login', () => {
      console.log('\x1b[36m[System] Logged in to server. Waiting for spawn...\x1b[0m');
   });

   bot.on('spawn', () => {
      console.log('\x1b[32m[BotLog] Bot spawned in the server\x1b[0m');
      
      const mcData = require('minecraft-data')(bot.version);
      const defaultMove = new Movements(bot, mcData);
      bot.pathfinder.setMovements(defaultMove);

      // Auto Authentication
      if (config.utils['auto-auth'].enabled) {
         const password = config.utils['auto-auth'].password;
         console.log('[Auth] Attempting auto-authentication...');
         setTimeout(() => {
            bot.chat(`/register ${password} ${password}`);
            bot.chat(`/login ${password}`);
         }, 2000);
      }

      // Chat Messages Module
      if (config.utils['chat-messages'].enabled) {
         console.log('[Module] Chat-messages enabled');
         const { messages, repeat, 'repeat-delay': delay } = config.utils['chat-messages'];
         let i = 0;

         if (repeat) {
            const msgInterval = setInterval(() => {
               if (!bot || !bot.entity) return clearInterval(msgInterval);
               bot.chat(messages[i]);
               i = (i + 1) % messages.length;
            }, delay * 1000);
         } else {
            messages.forEach((msg, index) => {
               setTimeout(() => bot.chat(msg), index * 1000);
            });
         }
      }

      // Move to target position
      if (config.position.enabled) {
         const { x, y, z } = config.position;
         console.log(`\x1b[33m[Movement] Moving to (${x}, ${y}, ${z})\x1b[0m`);
         bot.pathfinder.setGoal(new GoalBlock(x, y, z));
      }

      // Anti-AFK Module
      if (config.utils['anti-afk'].enabled) {
         console.log('[Module] Anti-AFK enabled');
         setupAntiAFK();
      }
   });

   function setupAntiAFK() {
      // Basic movement
      bot.setControlState('jump', true);
      if (config.utils['anti-afk'].sneak) {
         bot.setControlState('sneak', true);
      }

      // Random head rotation to look more active
      setInterval(() => {
         if (bot && bot.entity) {
            const yaw = Math.random() * Math.PI * 2;
            const pitch = (Math.random() - 0.5) * Math.PI;
            bot.look(yaw, pitch);
         }
      }, 5000);
   }

   bot.on('chat', (username, message) => {
      if (config.utils['chat-log'] && username !== bot.username) {
         console.log(`[Chat] <${username}> ${message}`);
      }
   });

   bot.on('goal_reached', () => {
      console.log('\x1b[32m[Movement] Target location reached\x1b[0m');
   });

   bot.on('kicked', (reason) => {
      const reasonMsg = typeof reason === 'string' ? reason : (reason.text || JSON.stringify(reason));
      console.log(`\x1b[31m[Kicked] Reason: ${reasonMsg}\x1b[0m`);
      if (reasonMsg.includes('Invalid session') || reasonMsg.includes('Online mode')) {
         console.log('\x1b[33m[Suggestion] Your server might be in Online Mode. Please enable "Cracked" in Aternos settings.\x1b[0m');
      }
   });

   bot.on('error', (err) => {
      console.log(`\x1b[31m[Error] ${err.message}\x1b[0m`);
   });

   bot.on('end', () => {
      console.log('\x1b[36m[System] Connection ended\x1b[0m');
      if (config.utils['auto-reconnect']) {
         const delay = config.utils['auto-reconnect-delay'] || 5000;
         console.log(`[System] Reconnecting in ${delay/1000}s...`);
         setTimeout(createBot, delay);
      }
   });
}

// Start the bot
createBot();
