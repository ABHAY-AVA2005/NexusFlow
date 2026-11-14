const config = require('./env');

module.exports = {
  uri: config.mongodbUri,
  options: {
    serverSelectionTimeoutMS: 5000,
  },
};
