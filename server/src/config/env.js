const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const config = {
  port: Number(process.env.PORT || 4000),
  wsPort: Number(process.env.WS_PORT || 8080),
  mongodbUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/nexusflow',
  alertWebhookUrl: process.env.ALERT_WEBHOOK_URL || 'http://localhost:4001/webhook',
  nodeEnv: process.env.NODE_ENV || 'development',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/nexusflow',
};

module.exports = config;
