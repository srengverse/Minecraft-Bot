const config = require('./settings.json');
const { setupWeb } = require('./src/web');
const { createBot } = require('./src/bot');

const port = process.env.PORT || 10000;
const io = setupWeb(port);

createBot(config, io);
