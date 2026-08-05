const mineflayer = require('mineflayer');
const { Movements, pathfinder, goals } = require('mineflayer-pathfinder');
const autoeat = require('mineflayer-auto-eat').loader;
const armorManager = require('mineflayer-armor-manager');
const express = require('express');
const http = require('http');
const https = require('https');
const { Server } = require('socket.io');
const config = require('./settings.json');

// --- Telegram Logic ---
function sendTelegram(message) {
    if (!config.utils.telegram || !config.utils.telegram.enabled) return;
    const { token, chatId } = config.utils.telegram;
    if (!token || !chatId || token.includes('YOUR_')) return;

    const data = JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' });
    const options = {
        hostname: 'api.telegram.org',
        port: 443,
        path: `/bot${token}/sendMessage`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }
    };

    const req = https.request(options, (res) => {
        res.on('data', () => {});
        res.on('end', () => {
            if (res.statusCode !== 200) console.log(`[Telegram] Error: ${res.statusCode}`);
        });
    });
    req.on('error', (err) => console.log(`[Telegram] Request Error: ${err.message}`));
    req.write(data);
    req.end();
}

// --- Web Server & Socket.io ---
const app = express();
const server = http.createServer(app);
const io = new Server(server);
const port = process.env.PORT || 10000;

app.get('/', (req, res) => {
    res.send(`
        <html>
            <head>
                <title>Minecraft Bot Dashboard</title>
                <style>
                    body { font-family: sans-serif; background: #121212; color: #e0e0e0; padding: 20px; }
                    .card { background: #1e1e1e; padding: 20px; border-radius: 8px; margin-bottom: 20px; border: 1px solid #333; }
                    .status-online { color: #4caf50; }
                    .status-offline { color: #f44336; }
                    h1 { color: #fff; }
                </style>
            </head>
            <body>
                <h1>Minecraft Bot Dashboard</h1>
                <div class="card">
                    <h2>Status: <span id="status" class="status-offline">Offline</span></h2>
                    <p>Username: <span id="username">-</span></p>
                    <p>Health: <span id="health">-</span></p>
                    <p>Hunger: <span id="food">-</span></p>
                    <p>Position: <span id="pos">-</span></p>
                </div>
                <div class="card">
                    <h2>Recent Chat</h2>
                    <div id="chat-log" style="height: 200px; overflow-y: auto; background: #000; padding: 10px; font-family: monospace;"></div>
                </div>
                <script src="/socket.io/socket.io.js"></script>
                <script>
                    const socket = io();
                    socket.on('bot_update', (data) => {
                        document.getElementById('status').innerText = 'Online';
                        document.getElementById('status').className = 'status-online';
                        document.getElementById('username').innerText = data.username;
                        document.getElementById('health').innerText = data.health;
                        document.getElementById('food').innerText = data.food;
                        document.getElementById('pos').innerText = \`X: \${Math.round(data.pos.x)}, Y: \${Math.round(data.pos.y)}, Z: \${Math.round(data.pos.z)}\`;
                    });
                    socket.on('chat', (data) => {
                        const log = document.getElementById('chat-log');
                        const entry = document.createElement('div');
                        entry.innerText = \`[\${new Date().toLocaleTimeString()}] <\${data.username}> \${data.message}\`;
                        log.appendChild(entry);
                        log.scrollTop = log.scrollHeight;
                    });
                </script>
            </body>
        </html>
    `);
});

server.listen(port, () => {
    console.log(`[Web] Dashboard available at port ${port}`);
});

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
            console.log(`\x1b[31m[Warning] Low Health: ${bot.health}\x1b[0m`);
            sendTelegram(`⚠️ <b>${bot.username}</b> has low health: <code>${bot.health}</code>`);
        }
    });

    bot.on('kicked', (reason) => {
        console.log(`\x1b[31m[Kicked] Reason: ${reason}\x1b[0m`);
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

createBot();
