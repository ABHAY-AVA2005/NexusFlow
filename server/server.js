/**
 * NexusFlow - Backend Server Entry Point
 *
 * This file initializes the Express application, sets up middleware,
 * mounts API routes, attaches the Socket.IO real-time server,
 * and starts the HTTP server.
 */

const express = require('express');
const cors = require('cors');
const http = require('http');
const config = require('./src/config/env');
const connectDB = require('./src/config/db');
const healthRoutes = require('./src/routes/health.routes');
const telemetryRoutes = require('./src/routes/telemetry.routes');
const ruleRoutes = require('./src/routes/rule.routes');
const { notFoundHandler, errorHandler } = require('./src/middleware/errorHandler');
const { initializeSocket } = require('./src/services/socketManager');

// Initialize Express application
const app = express();

// ==========================================
// Middleware Configuration
// ==========================================

// Enable Cross-Origin Resource Sharing (CORS)
app.use(cors({
  origin: config.clientUrl,
  credentials: true
}));

// Parse incoming JSON payloads
app.use(express.json());

// Parse incoming URL-encoded bodies
app.use(express.urlencoded({ extended: true }));

// ==========================================
// Routes Configuration
// ==========================================

// Root endpoint: friendly welcome message
app.get('/', (req, res) => {
  res.status(200).json({
    project: 'NexusFlow',
    description: 'High-speed IoT Telemetry and Analytics Engine',
    status: 'online',
    healthCheckUrl: '/health'
  });
});

// Health check endpoint (GET /health)
app.use('/health', healthRoutes);

// Telemetry API endpoint (POST /api/telemetry)
app.use('/api/telemetry', telemetryRoutes);

// Visual Rule CRUD and Lifecycle API endpoint (/api/rules)
app.use('/api/rules', ruleRoutes);

// ==========================================
// Error Handling Middleware
// ==========================================

// Catch 404 errors for unrecognized endpoints
app.use(notFoundHandler);

// Centralized error handling
app.use(errorHandler);

// ==========================================
// Start Server
// ==========================================

let server;
let io;
let isShuttingDown = false;

const startServer = async () => {
  try {
    // Connect to MongoDB before starting the HTTP server
    await connectDB();

    // Create an explicit HTTP server so both Express and Socket.IO
    // can share the same port and server instance.
    server = http.createServer(app);

    // Attach Socket.IO to the HTTP server
    io = initializeSocket(server);

    server.listen(config.port, () => {
      console.log('==================================================');
      console.log(` NexusFlow Backend Server Started Successfully`);
      console.log(` Environment:  ${config.nodeEnv}`);
      console.log(` Port:         ${config.port}`);
      console.log(` Health URL:   http://localhost:${config.port}/health`);
      console.log(` Socket.IO:    http://localhost:${config.port}`);
      console.log('==================================================');
    });
  } catch (error) {
    console.error(`Failed to start server: ${error.message}`);
    process.exit(1);
  }
};

startServer();

// ==========================================
// Graceful Shutdown
// ==========================================

/**
 * Performs an orderly shutdown:
 *   1. Prevents duplicate execution via the isShuttingDown flag.
 *   2. Closes all Socket.IO connections first (io.close()).
 *   3. Closes the HTTP server so no new requests are accepted.
 *   4. Exits the process with code 0.
 */
const gracefulShutdown = (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\nGracefully shutting down server (${signal})...`);

  // Step 1: Close Socket.IO connections
  if (io) {
    io.close(() => {
      console.log('Socket.IO server closed.');
    });
  }

  // Step 2: Close the HTTP server
  if (server) {
    server.close(() => {
      console.log('HTTP server closed.');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

module.exports = app;
