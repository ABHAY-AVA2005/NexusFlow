/**
 * Health Controller
 *
 * Handles health check requests to verify that the server is operational.
 * Returns uptime, timestamp, environment, and operational status.
 */
const getHealthStatus = (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'NexusFlow backend server is running smoothly',
    service: 'nexusflow-server',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
};

module.exports = {
  getHealthStatus
};
