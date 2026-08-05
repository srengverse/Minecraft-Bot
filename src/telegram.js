const https = require('https');

function sendTelegram(config, message) {
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
            }
        });
    });

    req.on('error', (err) => {
        console.log(`\x1b[31m[Telegram] Request Error: ${err.message}\x1b[0m`);
    });

    req.write(data);
    req.end();
}

module.exports = { sendTelegram };
