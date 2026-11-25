/**
 * @module server/config/db
 * @description Creates and manages the MongoDB connection used by the backend.
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
