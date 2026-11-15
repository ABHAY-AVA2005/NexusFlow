/**
 * NexusFlow - Backend Server Entry Point
 * 
 * This file initializes the Express application, sets up middleware,
 * mounts API routes, and starts the HTTP server.
 */

const express = require('express');
const cors = require('cors');
const config = require('./src/config/env');
const healthRoutes = require('./src/routes/health.routes');
const { notFoundHandler, errorHandler } = require('./src/middleware/errorHandler');

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

const server = app.listen(config.port, () => {
  console.log('==================================================');
  console.log(` NexusFlow Backend Server Started Successfully`);
  console.log(` Environment:  ${config.nodeEnv}`);
  console.log(` Port:         ${config.port}`);
  console.log(` Health URL:   http://localhost:${config.port}/health`);
  console.log('==================================================');
});

// Handle graceful termination
process.on('SIGINT', () => {
  console.log('\nGracefully shutting down server (SIGINT)...');
  server.close(() => {
    console.log('HTTP server closed.');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\nGracefully shutting down server (SIGTERM)...');
  server.close(() => {
    console.log('HTTP server closed.');
    process.exit(0);
  });
});

module.exports = app;
