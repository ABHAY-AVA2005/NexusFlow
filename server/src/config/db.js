const mongoose = require('mongoose');
const config = require('./env');

/**
 * Establishes connection to MongoDB using Mongoose.
 *
 * Logs connection status and database name on success,
 * or logs error and terminates process on failure.
 */
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(config.mongoUri);
    console.log('MongoDB connected successfully');
    console.log(`Database Name: ${conn.connection.name}`);
  } catch (error) {
    console.error(`MongoDB connection error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
