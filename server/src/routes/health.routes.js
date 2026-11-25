/**
 * @module server/routes/health
 * @description Defines health-check HTTP routes.
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
