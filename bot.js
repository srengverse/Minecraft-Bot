const mineflayer = require('mineflayer');
const { Movements, pathfinder, goals } = require('mineflayer-pathfinder');
const autoeat = require('mineflayer-auto-eat').loader;
const armorManager = require('mineflayer-armor-manager');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const TelegramBot = require('node-telegram-bot-api');
// Use .default if it exists (for some environments)
const BotConstructor = typeof TelegramBot === 'function' ? TelegramBot : (TelegramBot.default || TelegramBot);
const config = require('./settings.json');

// --- Telegram Setup ---
let tbot;
if (config.utils.telegram && config.utils.telegram.enabled && config.utils.telegram.token) {
    try {
        tbot = new BotConstructor(config.utils.telegram.token, { polling: true });
        console.log('\x1b[32m[Telegram] Bot initialized successfully.\x1b[0m');
    } catch (err) {
        console.log(`\x1b[31m[Telegram] Initialization Error: ${err.message}\x1b[0m`);
    }
}

function sendTelegram(message) {
    if (tbot && config.utils.telegram.chatId) {
        tbot.sendMessage(config.utils.telegram.chatId, message, { parse_mode: 'HTML' })
            .catch(err => console.log(`\x1b[31m[Telegram] Send Error: ${err.message}\x1b[0m`));
    }
}

// --- Web Server ---
const app = express();
const server = http.createServer(app);
const io = new Server(server);
const port = process.env.PORT || 10000;

app.get('/', (req, res) => {
    res.send(`<html><body style="background:#121212;color:#fff;font-family:sans-serif;padding:50px;"><h1>Bot is running!</h1><p>Check Telegram or Socket.io for updates.</p></body></html>`);
});

server.listen(port, () => console.log(`[Web] Dashboard available at port ${port}`));

// --- Bot Logic ---
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
        checkTimeoutInterval: 60 * 1000
    });

    bot.loadPlugin(pathfinder);
    bot.loadPlugin(autoeat);
    bot.loadPlugin(armorManager);

    bot.on('login', () => {
        console.log('\x1b[36m[System] Logged in.\x1b[0m');
        sendTelegram(`🤖 <b>${bot.username}</b> has logged in to <code>${config.server.ip}</code>`);
    });

    bot.on('spawn', () => {
        console.log('\x1b[32m[BotLog] Bot spawned!\x1b[0m');
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

        if (config.utils['anti-afk'].enabled) {
            bot.setControlState('jump', true);
            setInterval(() => {
                if (bot && bot.entity) bot.look(Math.random() * Math.PI * 2, (Math.random() - 0.5) * Math.PI);
            }, 5000);
        }

        setInterval(() => {
            if (bot && bot.entity) {
                io.emit('bot_update', {
                    username: bot.username,
                    health: bot.health,
                    food: bot.food,
                    pos: bot.entity.position
                });
            }
        }, 1000);
    });

    bot.on('chat', (username, message) => {
        if (username === bot.username) return;
        if (config.utils['chat-log']) console.log(`[Chat] <${username}> ${message}`);
        io.emit('chat', { username, message });
        if (config.utils.telegram.enabled && config.utils.telegram.logChat) {
            sendTelegram(`💬 <b>${username}</b>: ${message}`);
        }
    });

    bot.on('health', () => {
        if (bot.health < 10) {
            sendTelegram(`⚠️ <b>${bot.username}</b> has low health: <code>${bot.health}</code>`);
        }
    });

    bot.on('kicked', (reason) => {
        sendTelegram(`⚠️ <b>${bot.username}</b> was kicked!\nReason: <code>${reason}</code>`);
    });

    bot.on('error', (err) => console.log(`\x1b[31m[Error] ${err.message}\x1b[0m`));

    bot.on('end', (reason) => {
        console.log(`\x1b[36m[System] Connection ended (${reason}). Reconnecting...\x1b[0m`);
        if (bot) bot.removeAllListeners();
        if (config.utils['auto-reconnect']) {
            setTimeout(createBot, config.utils['auto-reconnect-delay'] || 5000);
        }
    });
}

// --- Telegram Commands ---
if (tbot) {
    tbot.onText(/\/status/, (msg) => {
        if (msg.chat.id.toString() !== config.utils.telegram.chatId.toString()) return;
        if (!bot || !bot.entity) {
            tbot.sendMessage(msg.chat.id, "❌ Bot is currently offline.");
            return;
        }
        const status = `📊 <b>Bot Status</b>\n` +
                       `👤 Username: ${bot.username}\n` +
                       `❤️ Health: ${Math.round(bot.health)}/20\n` +
                       `🍗 Food: ${Math.round(bot.food)}/20\n` +
                       `📍 Pos: ${Math.round(bot.entity.position.x)}, ${Math.round(bot.entity.position.y)}, ${Math.round(bot.entity.position.z)}`;
        tbot.sendMessage(msg.chat.id, status, { parse_mode: 'HTML' });
    });

    tbot.onText(/\/chat (.+)/, (msg, match) => {
        if (msg.chat.id.toString() !== config.utils.telegram.chatId.toString()) return;
        const text = match[1];
        if (bot && bot.entity) {
            bot.chat(text);
            tbot.sendMessage(msg.chat.id, `✅ Sent to Minecraft: <i>${text}</i>`, { parse_mode: 'HTML' });
        } else {
            tbot.sendMessage(msg.chat.id, "❌ Bot is not connected.");
        }
    });

    tbot.onText(/\/help/, (msg) => {
        if (msg.chat.id.toString() !== config.utils.telegram.chatId.toString()) return;
        const help = `🎮 <b>Bot Commands</b>\n` +
                     `/status - Check bot health & position\n` +
                     `/chat [msg] - Send message to Minecraft server\n` +
                     `/help - Show this menu`;
        tbot.sendMessage(msg.chat.id, help, { parse_mode: 'HTML' });
    });
}

createBot();
