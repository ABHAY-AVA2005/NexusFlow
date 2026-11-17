/**
 * Telemetry Ingestion Validation Middleware
 *
 * Validates required IoT payload fields, enforces numeric integrity,
 * handles optional timestamp parsing / auto-generation, and formats
 * the metadata sub-document for MongoDB Time-Series ingestion.
 */

const isNonEmptyString = (val) => {
  return typeof val === 'string' && val.trim().length > 0;
};

const isValidNumber = (val) => {
  if (
    val === null ||
    val === undefined ||
    typeof val === 'boolean' ||
    val === '' ||
    Array.isArray(val) ||
    typeof val === 'object'
  ) {
    return false;
  }
  const num = Number(val);
  return typeof num === 'number' && !Number.isNaN(num) && Number.isFinite(num);
};

const validateTelemetry = (req, res, next) => {
  const body = req.body;

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({
      status: 'error',
      message: 'Invalid request body. A JSON object is required.'
    });
  }

  const errors = [];

  // Extract metadata fields (support both flat structure and nested metadata)
  const deviceId = body.deviceId !== undefined ? body.deviceId : body.metadata?.deviceId;
  const deviceType = body.deviceType !== undefined ? body.deviceType : body.metadata?.deviceType;
  const location = body.location !== undefined ? body.location : body.metadata?.location;

  // Validate required metadata string fields
  if (!isNonEmptyString(deviceId)) {
    errors.push('deviceId is required and must be a non-empty string.');
  }

  if (!isNonEmptyString(deviceType)) {
    errors.push('deviceType is required and must be a non-empty string.');
  }

  if (!isNonEmptyString(location)) {
    errors.push('location is required and must be a non-empty string.');
  }

  // Validate numeric measurement fields
  if (!isValidNumber(body.temperature)) {
    errors.push('temperature is required and must be a valid finite number.');
  }

  if (!isValidNumber(body.pressure)) {
    errors.push('pressure is required and must be a valid finite number.');
  }

  if (!isValidNumber(body.vibration)) {
    errors.push('vibration is required and must be a valid finite number.');
  }

  // Handle timestamp (optional: parse if provided, or generate current time)
  let timestamp;
  if (body.timestamp !== undefined && body.timestamp !== null && body.timestamp !== '') {
    if (
      typeof body.timestamp === 'boolean' ||
      Array.isArray(body.timestamp) ||
      (typeof body.timestamp === 'object' && !(body.timestamp instanceof Date))
    ) {
      errors.push('timestamp must be a valid ISO 8601 date string or timestamp.');
    } else {
      const parsedDate = new Date(body.timestamp);
      if (Number.isNaN(parsedDate.getTime())) {
        errors.push('timestamp must be a valid ISO 8601 date string or timestamp.');
      } else {
        timestamp = parsedDate;
      }
    }
  } else {
    timestamp = new Date();
  }

  if (errors.length > 0) {
    return res.status(400).json({
      status: 'error',
      message: 'Validation failed for telemetry data.',
      errors
    });
  }

  // Attach sanitized and structured telemetry record to request object
  req.sanitizedTelemetry = {
    timestamp,
    metadata: {
      deviceId: String(deviceId).trim(),
      deviceType: String(deviceType).trim(),
      location: String(location).trim()
    },
    temperature: Number(body.temperature),
    pressure: Number(body.pressure),
    vibration: Number(body.vibration)
  };

  next();
};

module.exports = {
  validateTelemetry
};
