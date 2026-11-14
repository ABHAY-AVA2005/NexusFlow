require('dotenv').config();

const config = {
  port: Number(process.env.PORT || 4000),
  wsPort: Number(process.env.WS_PORT || 8080),
  mongodbUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/nexusflow',
  alertWebhookUrl: process.env.ALERT_WEBHOOK_URL || 'http://localhost:4001/webhook',
};

module.exports = config;
