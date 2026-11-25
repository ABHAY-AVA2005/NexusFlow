/**
 * @module server
 * @description Small executable entry point for starting the backend. When imported by
 * tests, it exports the app without opening a network port; when run directly, it starts
 * MongoDB-backed Express and WebSocket services.
 */
const app = require('./src/index');

if (require.main === module) {
  app.startServer().catch((error) => {
    console.error(`Failed to start server: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = app;
