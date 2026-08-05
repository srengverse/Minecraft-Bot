const mineflayer = require('mineflayer');
const { Movements, pathfinder, goals } = require('mineflayer-pathfinder');
const autoeat = require('mineflayer-auto-eat').loader;
const armorManager = require('mineflayer-armor-manager');
const pvp = require('mineflayer-pvp').plugin;
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const TelegramBot = require('node-telegram-bot-api');
const config = require('./settings.json');

// --- Telegram Setup ---
const TelegramBotImport = require('node-telegram-bot-api');
const BotConstructor = typeof TelegramBotImport === 'function' ? TelegramBotImport : (TelegramBotImport.default || TelegramBotImport);

let tbot;
if (config.utils.telegram && config.utils.telegram.enabled && config.utils.telegram.token) {
    try {
        tbot = new BotConstructor(config.utils.telegram.token, { polling: true });
        console.log('\x1b[32m[Telegram] Bot initialized successfully.\x1b[0m');
    } catch (err) {
        console.log(`\x1b[31m[Telegram] Initialization Error: ${err.message}\x1b[0m`);
    }
}

const mainKeyboard = {
    reply_markup: {
        inline_keyboard: [
            [{ text: '📊 Status', callback_data: 'status' }, { text: '⚔️ Attack Mode', callback_data: 'toggle_pvp' }],
            [{ text: '💬 Recent Chat', callback_data: 'chat_log' }, { text: '🆘 Help', callback_data: 'help' }]
        ]
    }
};

function sendTelegram(message, keyboard = null) {
    if (tbot && config.utils.telegram.chatId) {
        tbot.sendMessage(config.utils.telegram.chatId, message, { 
            parse_mode: 'HTML',
            ...(keyboard || {})
        }).catch(err => console.log(`\x1b[31m[Telegram] Send Error: ${err.message}\x1b[0m`));
    }
}

// --- Web Server ---
const app = express();
const server = http.createServer(app);
const io = new Server(server);
const port = process.env.PORT || 10000;
app.get('/', (req, res) => res.send('Bot is running!'));
server.listen(port, () => console.log(`[Web] Dashboard available at port ${port}`));

// --- Bot Logic ---
let bot;
let pvpEnabled = true;

function equipBestWeapon() {
    if (!bot || !bot.inventory) return;
    const items = bot.inventory.items();
    let bestWeapon = null;
    let maxDamage = 0;

    const weapons = {
        'netherite_sword': 8, 'diamond_sword': 7, 'iron_sword': 6, 'stone_sword': 5, 'golden_sword': 4, 'wooden_sword': 4,
        'netherite_axe': 10, 'diamond_axe': 9, 'iron_axe': 9, 'stone_axe': 9, 'golden_axe': 7, 'wooden_axe': 7
    };

    for (const item of items) {
        if (weapons[item.name]) {
            if (weapons[item.name] > maxDamage) {
                maxDamage = weapons[item.name];
                bestWeapon = item;
            }
        }
    }

    if (bestWeapon) {
        bot.equip(bestWeapon, 'hand').catch(() => {});
    }
}

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
    bot.loadPlugin(pvp);

    bot.on('login', () => {
        console.log('\x1b[36m[System] Logged in.\x1b[0m');
        sendTelegram(`🤖 <b>${bot.username}</b> has logged in!`, mainKeyboard);
    });

    bot.on('spawn', () => {
        console.log('\x1b[32m[BotLog] Bot spawned!\x1b[0m');
        const mcData = require('minecraft-data')(bot.version);
        const defaultMove = new Movements(bot, mcData);
        bot.pathfinder.setMovements(defaultMove);

        // Anti-AFK
        if (config.utils['anti-afk'].enabled) {
            bot.setControlState('jump', true);
            setInterval(() => {
                if (bot && bot.entity) bot.look(Math.random() * Math.PI * 2, (Math.random() - 0.5) * Math.PI);
            }, 5000);
        }

        // Auto-Weapon & Armor Check
        setInterval(() => {
            if (bot && bot.entity) equipBestWeapon();
        }, 10000);
    });

    // --- Combat Logic (Auto-Attack) ---
    bot.on('entityHurt', (entity) => {
        if (!pvpEnabled) return;
        if (entity !== bot.entity) return;

        // Find who attacked me
        const attacker = bot.nearestEntity(e => (e.type === 'player' || e.type === 'mob') && e.position.distanceTo(bot.entity.position) < 5);
        if (attacker) {
            console.log(`\x1b[31m[Combat] Attacking back: ${attacker.username || attacker.name}\x1b[0m`);
            equipBestWeapon();
            bot.pvp.attack(attacker);
            sendTelegram(`⚔️ <b>Defense Active!</b> Attacking back: <code>${attacker.username || attacker.name}</code>`);
        }
    });

    bot.on('chat', (username, message) => {
        if (username === bot.username) return;
        io.emit('chat', { username, message });
        if (config.utils.telegram.enabled && config.utils.telegram.logChat) {
            sendTelegram(`💬 <b>${username}</b>: ${message}`);
        }
    });

    bot.on('health', () => {
        if (bot.health < 10) {
            sendTelegram(`⚠️ <b>Low Health!</b> HP: <code>${Math.round(bot.health)}</code>`);
        }
    });

    bot.on('end', (reason) => {
        console.log(`\x1b[36m[System] Connection ended (${reason}). Reconnecting...\x1b[0m`);
        if (bot) bot.removeAllListeners();
        if (config.utils['auto-reconnect']) setTimeout(createBot, 5000);
    });
}

// --- Telegram Commands & Callbacks ---
if (tbot) {
    tbot.on('callback_query', (query) => {
        const chatId = query.message.chat.id;
        if (chatId.toString() !== config.utils.telegram.chatId.toString()) return;

        if (query.data === 'status') {
            if (!bot || !bot.entity) {
                tbot.sendMessage(chatId, "❌ Bot is offline.");
            } else {
                const status = `📊 <b>Status</b>\n❤️ HP: ${Math.round(bot.health)}\n🍗 Food: ${Math.round(bot.food)}\n📍 Pos: ${Math.round(bot.entity.position.x)}, ${Math.round(bot.entity.position.y)}, ${Math.round(bot.entity.position.z)}\n⚔️ PvP: ${pvpEnabled ? 'ON' : 'OFF'}`;
                tbot.sendMessage(chatId, status, { parse_mode: 'HTML', ...mainKeyboard });
            }
        } else if (query.data === 'toggle_pvp') {
            pvpEnabled = !pvpEnabled;
            if (!pvpEnabled && bot.pvp) bot.pvp.stop();
            tbot.sendMessage(chatId, `⚔️ PvP Mode is now: <b>${pvpEnabled ? 'ENABLED' : 'DISABLED'}</b>`, { parse_mode: 'HTML', ...mainKeyboard });
        } else if (query.data === 'help') {
            const help = `🎮 <b>Menu</b>\n/status - Status\n/chat [msg] - Send message\n/pvp [on/off] - Toggle Combat`;
            tbot.sendMessage(chatId, help, { parse_mode: 'HTML', ...mainKeyboard });
        }
        tbot.answerCallbackQuery(query.id);
    });

    tbot.onText(/\/status/, (msg) => {
        if (msg.chat.id.toString() !== config.utils.telegram.chatId.toString()) return;
        sendTelegram('📊 Checking status...', mainKeyboard);
    });

    tbot.onText(/\/chat (.+)/, (msg, match) => {
        if (msg.chat.id.toString() !== config.utils.telegram.chatId.toString()) return;
        if (bot && bot.entity) {
            bot.chat(match[1]);
            tbot.sendMessage(msg.chat.id, "✅ Message sent!");
        }
    });

    tbot.onText(/\/pvp (on|off)/, (msg, match) => {
        if (msg.chat.id.toString() !== config.utils.telegram.chatId.toString()) return;
        pvpEnabled = match[1] === 'on';
        tbot.sendMessage(msg.chat.id, `⚔️ PvP Mode: ${pvpEnabled ? 'ON' : 'OFF'}`);
    });
}

createBot();
