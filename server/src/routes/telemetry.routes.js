const express = require('express');
const router = express.Router();
const { createTelemetry } = require('../controllers/telemetry.controller');
const { validateTelemetry } = require('../middleware/validateTelemetry');

/**
 * @route   POST /api/telemetry
 * @desc    Ingest IoT device telemetry data into Time-Series collection
 * @access  Public
 */
router.post('/', validateTelemetry, createTelemetry);

module.exports = router;
