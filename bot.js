const mineflayer = require('mineflayer');
const express = require('express');
const https = require('https');
const config = require('./settings.json');

// --- Minimal Web Server ---
const app = express();
const port = process.env.PORT || 10000;
app.get('/', (req, res) => res.send('Aternos 24/7 Bot is Running!'));
app.listen(port, () => console.log(`[System] Keep-alive server on port ${port}`));

// --- Minimal Telegram Notification Function ---
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
    });
    req.on('error', (err) => console.log(`[Telegram Error] ${err.message}`));
    req.write(data);
    req.end();
}

let bot;

function createBot() {
    console.log(`[System] Connecting to ${config.server.ip}...`);
    
    bot = mineflayer.createBot({
        host: config.server.ip,
        port: config.server.port,
        username: config['bot-account'].username,
        password: config['bot-account'].password || undefined,
        version: config.server.version,
        auth: config['bot-account'].type === 'microsoft' ? 'microsoft' : 'offline',
        checkTimeoutInterval: 60 * 1000
    });

    bot.on('login', () => {
        console.log('\x1b[36m[System] Logged in.\x1b[0m');
        // Optional: sendTelegram(`✅ <b>${bot.username}</b> is online!`);
    });

    bot.on('spawn', () => {
        console.log('\x1b[32m[BotLog] Bot spawned!\x1b[0m');
        
        if (config.utils['auto-auth'] && config.utils['auto-auth'].enabled) {
            const pass = config.utils['auto-auth'].password;
            setTimeout(() => {
                if (bot && bot.entity) {
                    bot.chat(`/register ${pass} ${pass}`);
                    bot.chat(`/login ${pass}`);
                }
            }, 3000);
        }

        // Anti-AFK
        setInterval(() => {
            if (!bot || !bot.entity) return;
            if (Math.random() > 0.5) bot.setControlState('jump', true);
            else bot.setControlState('jump', false);
            bot.look(Math.random() * Math.PI * 2, (Math.random() - 0.5) * Math.PI);
            bot.swingArm();
        }, 15000);
    });

    bot.on('error', (err) => {
        console.log(`\x1b[31m[Error] ${err.message}\x1b[0m`);
    });

    bot.on('kicked', (reason) => {
        const msg = typeof reason === 'string' ? reason : JSON.stringify(reason);
        console.log(`\x1b[31m[Kicked] Reason: ${msg}\x1b[0m`);
        sendTelegram(`⚠️ <b>Bot Kicked!</b>\nReason: <code>${msg}</code>`);
    });

    bot.on('end', (reason) => {
        console.log(`\x1b[36m[System] Disconnected (${reason}). Reconnecting...\x1b[0m`);
        sendTelegram(`❌ <b>Bot Disconnected!</b>\nReason: <code>${reason}</code>\n<i>Attempting to reconnect...</i>`);
        if (bot) bot.removeAllListeners();
        setTimeout(createBot, 10000);
    });
}

createBot();
