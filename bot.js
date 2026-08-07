const mineflayer = require('mineflayer');
const express = require('express');
const config = require('./settings.json');

// --- Minimal Web Server to keep Render alive ---
const app = express();
const port = process.env.PORT || 10000;
app.get('/', (req, res) => res.send('Aternos 24/7 Bot is Running!'));
app.listen(port, () => console.log(`[System] Keep-alive server on port ${port}`));

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

    // --- Core Logic for 24/7 Uptime ---
    bot.on('spawn', () => {
        console.log('\x1b[32m[BotLog] Bot spawned! Keeping server alive...\x1b[0m');
        
        // Auto-Auth if enabled
        if (config.utils['auto-auth'] && config.utils['auto-auth'].enabled) {
            const pass = config.utils['auto-auth'].password;
            setTimeout(() => {
                if (bot && bot.entity) {
                    bot.chat(`/register ${pass} ${pass}`);
                    bot.chat(`/login ${pass}`);
                }
            }, 3000);
        }

        // Robust Anti-AFK (Random actions to avoid detection)
        setInterval(() => {
            if (!bot || !bot.entity) return;
            
            // Randomly jump
            if (Math.random() > 0.5) bot.setControlState('jump', true);
            else bot.setControlState('jump', false);

            // Randomly look around
            bot.look(Math.random() * Math.PI * 2, (Math.random() - 0.5) * Math.PI);

            // Randomly swing arm
            bot.swingArm();

            // Random small movement
            const actions = ['forward', 'back', 'left', 'right'];
            const randomAction = actions[Math.floor(Math.random() * actions.length)];
            bot.setControlState(randomAction, true);
            setTimeout(() => {
                if (bot && bot.entity) bot.setControlState(randomAction, false);
            }, 500);

        }, 10000); // Perform random action every 10 seconds
    });

    bot.on('error', (err) => console.log(`\x1b[31m[Error] ${err.message}\x1b[0m`));

    bot.on('kicked', (reason) => {
        console.log(`\x1b[31m[Kicked] Reason: ${reason}\x1b[0m`);
    });

    bot.on('end', () => {
        console.log('\x1b[36m[System] Disconnected. Reconnecting in 10s...\x1b[0m');
        if (bot) bot.removeAllListeners();
        setTimeout(createBot, 10000);
    });
}

createBot();
