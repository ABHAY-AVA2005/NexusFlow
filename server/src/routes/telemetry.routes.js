const express = require('express');
const router = express.Router();
const {
  createTelemetry,
  createTelemetryBatch,
} = require('../controllers/telemetry.controller');
const {
  sanitizeTelemetry,
  validateTelemetry,
} = require('../middleware/validateTelemetry');

const validateTelemetryBatch = (req, res, next) => {
  const batch = req.body && req.body.batch;
  if (!Array.isArray(batch) || batch.length === 0) {
    return res.status(400).json({
      status: 'error',
      message: 'A non-empty batch array is required.',
    });
  }

  const errors = [];
  const telemetry = batch.map((item, index) => {
    const result = sanitizeTelemetry(item);
    if (result.errors.length > 0) {
      errors.push(...result.errors.map((error) => `batch[${index}]: ${error}`));
    }
    return result.telemetry;
  });

  if (errors.length > 0) {
    return res.status(400).json({
      status: 'error',
      message: 'Validation failed for telemetry batch.',
      errors,
    });
  }

  req.sanitizedTelemetryBatch = telemetry;
  next();
};

/**
 * @route   POST /api/telemetry
 * @desc    Ingest IoT device telemetry data into Time-Series collection
 * @access  Public
 */
router.post('/', validateTelemetry, createTelemetry);
router.post('/bulk', validateTelemetryBatch, createTelemetryBatch);

module.exports = router;
