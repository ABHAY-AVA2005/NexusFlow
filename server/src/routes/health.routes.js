/**
 * @module server/routes/health
 * @description Exposes the small HTTP endpoint used to confirm that the backend process
 * is running. Monitoring tools call this instead of starting an expensive database operation.
 */
const express = require('express');
const router = express.Router();
const { getHealthStatus } = require('../controllers/health.controller');

/**
 * @route   GET /health
 * @desc    Check server operational status
 * @access  Public
 */
router.get('/', getHealthStatus);

module.exports = router;
