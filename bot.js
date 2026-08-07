const mineflayer = require('mineflayer');
const { Movements, pathfinder, goals } = require('mineflayer-pathfinder');
const autoeat = require('mineflayer-auto-eat').loader;
const armorManager = require('mineflayer-armor-manager');
const pvp = require('mineflayer-pvp').plugin;
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const TelegramBotImport = require('node-telegram-bot-api');
const config = require('./settings.json');

// --- Global Variables & State ---
let bot;
let tbot;
let pvpEnabled = true;
let botIntervals = [];
let reconnectTimeout = null;

const BotConstructor = typeof TelegramBotImport === 'function' ? TelegramBotImport : (TelegramBotImport.default || TelegramBotImport);

// --- Utility Functions ---
function clearAllIntervals() {
    botIntervals.forEach(clearInterval);
    botIntervals = [];
}

function addInterval(fn, ms) {
    const id = setInterval(fn, ms);
    botIntervals.push(id);
    return id;
}

// --- Telegram Setup ---
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

app.get('/', (req, res) => {
    res.send(`
        <html>
            <head><title>Minecraft Bot Dashboard</title></head>
            <body style="background:#121212;color:#fff;font-family:sans-serif;text-align:center;padding-top:50px;">
                <h1>Bot is Live!</h1>
                <p>Status: ${bot && bot.entity ? '<span style="color:#4caf50">Online</span>' : '<span style="color:#f44336">Offline</span>'}</p>
                <p>Check your Telegram for full control.</p>
            </body>
        </html>
    `);
});

server.listen(port, () => console.log(`[Web] Dashboard available at port ${port}`));

// --- Combat & Inventory Utils ---
function equipBestWeapon() {
    if (!bot || !bot.inventory) return;
    const weapons = {
        'netherite_sword': 8, 'diamond_sword': 7, 'iron_sword': 6, 'stone_sword': 5, 'golden_sword': 4, 'wooden_sword': 4,
        'netherite_axe': 10, 'diamond_axe': 9, 'iron_axe': 9, 'stone_axe': 9, 'golden_axe': 7, 'wooden_axe': 7
    };
    const best = bot.inventory.items()
        .filter(item => weapons[item.name])
        .sort((a, b) => weapons[b.name] - weapons[a.name])[0];
    
    if (best) bot.equip(best, 'hand').catch(() => {});
}

// --- Core Bot Creation ---
function createBot() {
    if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
    }

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
        clearAllIntervals(); // Clear old intervals to prevent memory leaks

        const mcData = require('minecraft-data')(bot.version);
        const defaultMove = new Movements(bot, mcData);
        bot.pathfinder.setMovements(defaultMove);

        // Auto-Auth
        if (config.utils['auto-auth'] && config.utils['auto-auth'].enabled) {
            const pass = config.utils['auto-auth'].password;
            setTimeout(() => {
                if (bot && bot.entity) {
                    bot.chat(`/register ${pass} ${pass}`);
                    bot.chat(`/login ${pass}`);
                }
            }, 3000);
        }

        // Anti-AFK Logic
        if (config.utils['anti-afk'] && config.utils['anti-afk'].enabled) {
            bot.setControlState('jump', true);
            addInterval(() => {
                if (bot && bot.entity) bot.look(Math.random() * Math.PI * 2, (Math.random() - 0.5) * Math.PI);
            }, 5000);
        }

        // Periodic Checks (Weapon, Armor, Web Update)
        addInterval(() => {
            if (bot && bot.entity) {
                equipBestWeapon();
                io.emit('bot_update', {
                    username: bot.username,
                    health: bot.health,
                    food: bot.food,
                    pos: bot.entity.position
                });
            }
        }, 10000);

        // Auto-Chat Messages
        if (config.utils['chat-messages'] && config.utils['chat-messages'].enabled) {
            const { messages, 'repeat-delay': delay } = config.utils['chat-messages'];
            let msgIdx = 0;
            addInterval(() => {
                if (bot && bot.entity && messages.length > 0) {
                    bot.chat(messages[msgIdx]);
                    msgIdx = (msgIdx + 1) % messages.length;
                }
            }, delay * 1000);
        }
    });

    // --- Events ---
    bot.on('entityHurt', (entity) => {
        if (!pvpEnabled || entity !== bot.entity) return;
        const attacker = bot.nearestEntity(e => (e.type === 'player' || e.type === 'mob') && e.position.distanceTo(bot.entity.position) < 6);
        if (attacker) {
            console.log(`\x1b[31m[Combat] Counter-attacking: ${attacker.username || attacker.name}\x1b[0m`);
            equipBestWeapon();
            bot.pvp.attack(attacker);
            sendTelegram(`⚔️ <b>Combat!</b> Defending against <code>${attacker.username || attacker.name}</code>`);
        }
    });

    bot.on('chat', (username, message) => {
        if (username === bot.username) return;
        if (config.utils['chat-log']) console.log(`[Chat] <${username}> ${message}`);
        if (config.utils.telegram.enabled && config.utils.telegram.logChat) {
            sendTelegram(`💬 <b>${username}</b>: ${message}`);
        }
    });

    bot.on('health', () => {
        if (bot.health < 8) sendTelegram(`⚠️ <b>Emergency!</b> HP is very low: <code>${Math.round(bot.health)}</code>`);
    });

    bot.on('error', (err) => console.log(`\x1b[31m[Error] ${err.message}\x1b[0m`));

    bot.on('kicked', (reason) => {
        const msg = typeof reason === 'string' ? reason : JSON.stringify(reason);
        console.log(`\x1b[31m[Kicked] Reason: ${msg}\x1b[0m`);
        sendTelegram(`⚠️ <b>Kicked!</b> Reason: <code>${msg}</code>`);
    });

    bot.on('end', (reason) => {
        console.log(`\x1b[36m[System] Disconnected (${reason}).\x1b[0m`);
        clearAllIntervals();
        if (bot) bot.removeAllListeners();
        
        if (config.utils['auto-reconnect']) {
            const delay = config.utils['auto-reconnect-delay'] || 5000;
            console.log(`[System] Reconnecting in ${delay/1000}s...`);
            reconnectTimeout = setTimeout(createBot, delay);
        }
    });
}

// --- Telegram Controller ---
if (tbot) {
    const isOwner = (id) => id.toString() === config.utils.telegram.chatId.toString();

    tbot.on('callback_query', (query) => {
        if (!isOwner(query.from.id)) return;
        const data = query.data;

        if (data === 'status') {
            if (!bot || !bot.entity) {
                tbot.sendMessage(query.message.chat.id, "❌ Bot is currently offline.");
            } else {
                const status = `📊 <b>Status</b>\n❤️ HP: ${Math.round(bot.health)}\n🍗 Food: ${Math.round(bot.food)}\n📍 Pos: ${Math.round(bot.entity.position.x)}, ${Math.round(bot.entity.position.y)}, ${Math.round(bot.entity.position.z)}\n⚔️ PvP: ${pvpEnabled ? 'ON' : 'OFF'}`;
                tbot.sendMessage(query.message.chat.id, status, { parse_mode: 'HTML', ...mainKeyboard });
            }
        } else if (data === 'toggle_pvp') {
            pvpEnabled = !pvpEnabled;
            if (!pvpEnabled && bot.pvp) bot.pvp.stop();
            tbot.sendMessage(query.message.chat.id, `⚔️ PvP Mode: <b>${pvpEnabled ? 'ENABLED' : 'DISABLED'}</b>`, { parse_mode: 'HTML', ...mainKeyboard });
        } else if (data === 'help') {
            const help = `🎮 <b>Control Menu</b>\n/status - Check bot\n/chat [msg] - Speak in game\n/reconnect - Force restart bot`;
            tbot.sendMessage(query.message.chat.id, help, { parse_mode: 'HTML', ...mainKeyboard });
        }
        tbot.answerCallbackQuery(query.id);
    });

    tbot.onText(/\/chat (.+)/, (msg, match) => {
        if (!isOwner(msg.chat.id)) return;
        if (bot && bot.entity) {
            bot.chat(match[1]);
            tbot.sendMessage(msg.chat.id, "✅ Sent.");
        }
    });

    tbot.onText(/\/reconnect/, (msg) => {
        if (!isOwner(msg.chat.id)) return;
        tbot.sendMessage(msg.chat.id, "🔄 Restarting bot...");
        if (bot) bot.quit();
    });
}

// --- Start ---
createBot();
