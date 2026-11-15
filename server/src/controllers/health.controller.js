/**
 * Health Controller
 * 
 * Handles health check requests to verify that the server is operational.
 * Returns uptime, timestamp, environment, and operational status.
 */
const getHealthStatus = (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'NexusFlow backend server is running smoothly',
    timestamp: new Date().toISOString(),
    uptime: `${process.uptime().toFixed(2)} seconds`,
    environment: process.env.NODE_ENV || 'development'
  });
};

module.exports = {
  getHealthStatus
};
