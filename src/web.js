const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

function setupWeb(port) {
    const app = express();
    const server = http.createServer(app);
    const io = new Server(server);

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

    return io;
}

module.exports = { setupWeb };
