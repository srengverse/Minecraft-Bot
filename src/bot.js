const mineflayer = require('mineflayer');
const { Movements, pathfinder, goals } = require('mineflayer-pathfinder');
const autoeat = require('mineflayer-auto-eat').loader;
const armorManager = require('mineflayer-armor-manager');
const { sendTelegram } = require('./telegram');

let bot;

function createBot(config, io) {
    console.log('[System] Initializing bot...');
    console.log(`[System] Target Server: ${config.server.ip}:${config.server.port}`);

    bot = mineflayer.createBot({
        host: config.server.ip,
        port: config.server.port,
        username: config['bot-account'].username,
        password: config['bot-account'].password || undefined,
        version: config.server.version,
        auth: config['bot-account'].type === 'microsoft' ? 'microsoft' : 'offline',
        checkTimeoutInterval: 60 * 1000
    });

    // Load Plugins
    bot.loadPlugin(pathfinder);
    bot.loadPlugin(autoeat);
    bot.loadPlugin(armorManager);

    bot.on('login', () => {
        console.log('\x1b[36m[System] Logged in.\x1b[0m');
        sendTelegram(config, `🤖 <b>${bot.username}</b> has logged in to <code>${config.server.ip}</code>`);
    });

    bot.on('spawn', () => {
        console.log('\x1b[32m[BotLog] Bot spawned!\x1b[0m');
        
        const mcData = require('minecraft-data')(bot.version);
        const defaultMove = new Movements(bot, mcData);
        bot.pathfinder.setMovements(defaultMove);

        // Auto-Auth
        if (config.utils['auto-auth'].enabled) {
            const password = config.utils['auto-auth'].password;
            setTimeout(() => {
                if (bot && bot.entity) {
                    bot.chat(`/register ${password} ${password}`);
                    bot.chat(`/login ${password}`);
                }
            }, 2000);
        }

        // Anti-AFK
        if (config.utils['anti-afk'].enabled) {
            bot.setControlState('jump', true);
            setInterval(() => {
                if (bot && bot.entity) {
                    bot.look(Math.random() * Math.PI * 2, (Math.random() - 0.5) * Math.PI);
                }
            }, 5000);
        }

        // Periodic Status Updates to Web
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
        
        if (config.utils['chat-log']) {
            console.log(`[Chat] <${username}> ${message}`);
        }

        io.emit('chat', { username, message });

        if (config.utils.telegram.enabled && config.utils.telegram.logChat) {
            sendTelegram(config, `💬 <b>${username}</b>: ${message}`);
        }
    });

    bot.on('health', () => {
        if (bot.health < 10) {
            console.log(`\x1b[31m[Warning] Low Health: ${bot.health}\x1b[0m`);
            sendTelegram(config, `⚠️ <b>${bot.username}</b> has low health: <code>${bot.health}</code>`);
        }
    });

    bot.on('kicked', (reason) => {
        console.log(`\x1b[31m[Kicked] Reason: ${reason}\x1b[0m`);
        sendTelegram(config, `⚠️ <b>${bot.username}</b> was kicked!\nReason: <code>${reason}</code>`);
    });

    bot.on('error', (err) => {
        console.log(`\x1b[31m[Error] ${err.message}\x1b[0m`);
    });

    bot.on('end', (reason) => {
        console.log(`\x1b[36m[System] Connection ended (${reason}). Reconnecting...\x1b[0m`);
        if (bot) bot.removeAllListeners();
        if (config.utils['auto-reconnect']) {
            setTimeout(() => createBot(config, io), config.utils['auto-reconnect-delay'] || 5000);
        }
    });
}

module.exports = { createBot };
