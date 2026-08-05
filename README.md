# Minecraft AFK Bot

A functional Minecraft AFK bot designed to keep servers (like Aternos) online 24/7. It includes features like Anti-AFK, Auto-Authentication, and custom chat messages.

## Features

- **Anti-AFK**: Keeps the bot active by jumping, sneaking, and random head movements to avoid detection.
- **Auto-Auth**: Automatically registers or logs in on servers that require authentication.
- **Pathfinder**: Can move to a specific coordinate upon spawning.
- **Custom Chat Messages**: Periodically sends messages to the chat.
- **Auto-Reconnect**: Automatically reconnects if the connection is lost.
- **Web Dashboard**: Simple Express server to keep the bot alive on platforms like Replit or Heroku.

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/srengverse/Minecraft-Bot.git
   cd Minecraft-Bot
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure the bot:
   Edit `settings.json` with your server details and bot account information.

4. Run the bot:
   ```bash
   node bot.js
   ```

## Configuration (`settings.json`)

| Section | Description |
|---------|-------------|
| `bot-account` | Username, password, and account type (`offline` or `microsoft`). |
| `server` | Server IP, port, and Minecraft version. |
| `position` | Target coordinates for the bot to move to after spawning. |
| `utils` | Toggle modules like `anti-afk`, `auto-auth`, `chat-messages`, etc. |

## Requirements

- Node.js v14 or higher
- `mineflayer`
- `mineflayer-pathfinder`
- `minecraft-data`
- `express`

## License

This project is licensed under the MIT License.

## 🚀 Upgraded Features (by Manus AI)

I have upgraded this bot with the following features:

- **Modular Architecture**: Code is now split into `src/` for better maintainability.
- **Enhanced Web Dashboard**: Real-time status updates (Health, Hunger, Position, Chat) using Socket.io.
- **Auto-Eat**: Automatically eats food when hungry.
- **Auto-Armor**: Automatically equips the best armor from inventory.
- **Health Monitoring**: Sends alerts to Telegram when health is low.
- **Better Logging**: Improved console logs with colors.
- **Socket.io Integration**: Real-time communication between the bot and the web dashboard.

### How to start
```bash
npm install
npm start
```
