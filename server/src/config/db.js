/**
 * @module server/config/db
 * @description Opens the MongoDB connection and provides the reusable database settings
 * needed by the rest of the server. The server waits for this connection before starting.
 */
const mongoose = require('mongoose');
const config = require('./env');
const options = { serverSelectionTimeoutMS: 5000 };

const connectDB = async () => {
  return mongoose.connect(config.mongodbUri, options);
};

module.exports = {
  uri: config.mongodbUri,
  options,
  connectDB,
};
