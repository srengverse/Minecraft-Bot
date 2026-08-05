const mineflayer = require('mineflayer');
const Movements = require('mineflayer-pathfinder').Movements;
const pathfinder = require('mineflayer-pathfinder').pathfinder;
const { GoalBlock } = require('mineflayer-pathfinder').goals;
const express = require('express');
const https = require('https');
const config = require('./settings.json');

const app = express();
const port = process.env.PORT || 10000;

app.get('/', (req, res) => {
  res.send('Bot is online and running!');
});

app.listen(port, () => {
  console.log(`[Web] Dashboard available at port ${port}`);
});

let bot;

function sendTelegram(message) {
   if (!config.utils.telegram || !config.utils.telegram.enabled) return;
   
   const { token, chatId } = config.utils.telegram;
   if (!token || !chatId || token.includes('YOUR_')) return;

   const data = JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML'
   });

   const options = {
      hostname: 'api.telegram.org',
      port: 443,
      path: `/bot${token}/sendMessage`,
      method: 'POST',
      headers: {
         'Content-Type': 'application/json',
         'Content-Length': data.length
      }
   };

   const req = https.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => { responseData += chunk; });
      res.on('end', () => {
         if (res.statusCode !== 200) {
            console.log(`\x1b[31m[Telegram] Error Status: ${res.statusCode}\x1b[0m`);
            console.log(`\x1b[31m[Telegram] Response: ${responseData}\x1b[0m`);
         }
      });
   });

   req.on('error', (err) => {
      console.log(`\x1b[31m[Telegram] Request Error: ${err.message}\x1b[0m`);
   });

   req.write(data);
   req.end();
}

function createBot() {
   console.log('[System] Initializing bot...');
   console.log(`[System] Target Server: ${config.server.ip}:${config.server.port} (Version: ${config.server.version})`);

   bot = mineflayer.createBot({
      host: config.server.ip,
      port: config.server.port,
      username: config['bot-account'].username,
      password: config['bot-account'].password || undefined,
      version: config.server.version,
      auth: config['bot-account'].type === 'microsoft' ? 'microsoft' : 'offline',
      checkTimeoutInterval: 60 * 1000
   });

   bot.loadPlugin(pathfinder);

   bot.on('connect', () => {
      console.log('\x1b[36m[System] Socket connected. Logging in...\x1b[0m');
   });

   bot.on('login', () => {
      console.log('\x1b[36m[System] Logged in. Waiting for spawn...\x1b[0m');
      if (config.utils.telegram && config.utils.telegram.enabled && config.utils.telegram.logStatus) {
         sendTelegram(`🤖 <b>${bot.username}</b> has logged in to <code>${config.server.ip}</code>`);
      }
   });

   bot.on('spawn', () => {
      console.log('\x1b[32m[BotLog] Bot spawned in the server!\x1b[0m');
      
      const mcData = require('minecraft-data')(bot.version);
      const defaultMove = new Movements(bot, mcData);
      bot.pathfinder.setMovements(defaultMove);

      if (config.utils['auto-auth'].enabled) {
         const password = config.utils['auto-auth'].password;
         setTimeout(() => {
            if (bot && bot.entity) {
               bot.chat(`/register ${password} ${password}`);
               bot.chat(`/login ${password}`);
            }
         }, 2000);
      }

      if (config.utils['chat-messages'].enabled) {
         const { messages, repeat, 'repeat-delay': delay } = config.utils['chat-messages'];
         let i = 0;
         if (repeat) {
            const msgInterval = setInterval(() => {
               if (bot && bot.entity) {
                  bot.chat(messages[i]);
                  i = (i + 1) % messages.length;
               } else {
                  clearInterval(msgInterval);
               }
            }, delay * 1000);
         }
      }

      if (config.position.enabled) {
         bot.pathfinder.setGoal(new GoalBlock(config.position.x, config.position.y, config.position.z));
      }

      if (config.utils['anti-afk'].enabled) {
         bot.setControlState('jump', true);
         if (config.utils['anti-afk'].sneak) bot.setControlState('sneak', true);
         const lookInterval = setInterval(() => {
            if (bot && bot.entity) {
               bot.look(Math.random() * Math.PI * 2, (Math.random() - 0.5) * Math.PI);
            } else {
               clearInterval(lookInterval);
            }
         }, 5000);
      }
   });

   bot.on('chat', (username, message) => {
      if (username === bot.username) return;
      
      if (config.utils['chat-log']) {
         console.log(`[Chat] <${username}> ${message}`);
      }

      if (config.utils.telegram && config.utils.telegram.enabled && config.utils.telegram.logChat) {
         sendTelegram(`💬 <b>${username}</b>: ${message}`);
      }
   });

   bot.on('kicked', (reason) => {
      const reasonMsg = typeof reason === 'string' ? reason : (reason.text || JSON.stringify(reason));
      console.log(`\x1b[31m[Kicked] Reason: ${reasonMsg}\x1b[0m`);
      if (config.utils.telegram && config.utils.telegram.enabled && config.utils.telegram.logStatus) {
         sendTelegram(`⚠️ <b>${bot.username}</b> was kicked!\nReason: <code>${reasonMsg}</code>`);
      }
   });

   bot.on('error', (err) => {
      console.log(`\x1b[31m[Error] ${err.code || 'UNKNOWN'}: ${err.message}\x1b[0m`);
   });

   bot.on('end', (reason) => {
      console.log(`\x1b[36m[System] Connection ended (${reason}). Reconnecting...\x1b[0m`);
      if (bot) bot.removeAllListeners();
      if (config.utils['auto-reconnect']) {
         setTimeout(createBot, config.utils['auto-reconnect-delay'] || 5000);
      }
   });
}

createBot();
