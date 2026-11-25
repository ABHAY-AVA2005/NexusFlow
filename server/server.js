/**
 * @module server
 * @description Application entry point that starts the Express server when invoked directly.
 */
const app = require('./src/index');

if (require.main === module) {
  app.startServer().catch((error) => {
    console.error(`Failed to start server: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = app;
