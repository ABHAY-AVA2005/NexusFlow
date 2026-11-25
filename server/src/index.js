/**
 * @module server/src/index
 * @description The backend application setup. This file enables JSON requests, registers
 * API routes, starts the HTTP/WebSocket servers, and closes them cleanly on shutdown.
 */
const express = require('express');
const cors = require('cors');
const graphsRouter = require('./routes/graphs');
const healthRoutes = require('./routes/health.routes');
const telemetryRoutes = require('./routes/telemetry.routes');
const config = require('./config/env');
const { connectDB } = require('./config/db');
const { startTelemetryWebSocketServer } = require('./ws/telemetryServer');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');
const mongoose = require('mongoose');

const app = express();

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use('/api/graphs', graphsRouter);
app.use('/api/telemetry', telemetryRoutes);
app.use('/health', healthRoutes);

app.get('/', (req, res) => {
  res.json({ message: 'NexusFlow server is running.' });
});

app.use(notFoundHandler);
app.use(errorHandler);

async function startServer() {
  const connection = await connectDB();
  console.log(`MongoDB connected: ${connection.connection.name}`);

  const server = app.listen(config.port, () => {
    console.log(`NexusFlow server listening on http://localhost:${config.port}`);
  });

  const webSocketServer = startTelemetryWebSocketServer(config.wsPort);
  console.log(`Telemetry WebSocket listening on ws://localhost:${config.wsPort}`);

  return { server, webSocketServer };
}

if (require.main === module) {
  startServer()
    .then(({ server, webSocketServer }) => {
      const shutdown = () => {
        webSocketServer.close();
        server.close(() => {
          mongoose.connection.close().finally(() => process.exit(0));
        });
      };

      process.once('SIGINT', shutdown);
      process.once('SIGTERM', shutdown);
    })
    .catch((error) => {
      console.error(`Failed to start server: ${error.message}`);
      process.exitCode = 1;
    });
}

module.exports = app;
module.exports.startServer = startServer;
