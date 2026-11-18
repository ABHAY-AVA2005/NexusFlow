/**
 * Telemetry Ingestion Validation Middleware (Express)
 *
 * Thin Express wrapper around the shared telemetryValidator.
 * Reads req.body, delegates validation to the pure function,
 * and either attaches req.sanitizedTelemetry or returns 400.
 *
 * The REST API behaviour is identical to the original implementation.
 */

const { validateTelemetryData } = require('../validators/telemetryValidator');

const validateTelemetry = (req, res, next) => {
  const result = validateTelemetryData(req.body);

  if (!result.valid) {
    return res.status(400).json({
      status: 'error',
      message: 'Validation failed for telemetry data.',
      errors: result.errors
    });
  }

  // Attach sanitized and structured telemetry record to request object
  req.sanitizedTelemetry = result.sanitized;

  next();
};

module.exports = {
  validateTelemetry
};
