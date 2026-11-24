/**
 * Telemetry Payload Validator (Pure Function)
 *
 * Transport-agnostic validation for IoT telemetry data.
 * Used by both the Express REST middleware and the Socket.IO event handler
 * to ensure a single source of truth for validation rules.
 *
 * @module validators/telemetryValidator
 */

// ==========================================
// Helper Functions
// ==========================================

/**
 * Checks whether a value is a non-empty string.
 * @param {*} val - The value to check.
 * @returns {boolean}
 */
const isNonEmptyString = (val) => {
  return typeof val === 'string' && val.trim().length > 0;
};

/**
 * Checks whether a value is a valid, finite number.
 * Rejects null, undefined, booleans, empty strings, arrays, and objects.
 * Accepts numeric strings (e.g. "72.5") since Number() coerces them.
 * @param {*} val - The value to check.
 * @returns {boolean}
 */
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

// ==========================================
// Core Validator
// ==========================================

/**
 * Validates and sanitizes a raw telemetry payload.
 *
 * Accepts both flat and nested metadata structures:
 *   Flat:   { deviceId, deviceType, location, temperature, ... }
 *   Nested: { metadata: { deviceId, deviceType, location }, temperature, ... }
 *
 * @param {*} data - The raw payload to validate (expected to be a plain object).
 * @returns {{ valid: boolean, errors: string[], sanitized: object|null }}
 *   - valid:     true if all checks passed.
 *   - errors:    array of human-readable error messages (empty when valid).
 *   - sanitized: the cleaned, schema-ready object (null when invalid).
 */
const validateTelemetryData = (data) => {
  // Guard: must be a non-null, non-array object
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return {
      valid: false,
      errors: ['Invalid payload. A JSON object is required.'],
      sanitized: null
    };
  }

  const errors = [];

  // ------------------------------------------
  // Extract metadata fields (flat or nested)
  // ------------------------------------------
  const deviceId = data.deviceId !== undefined ? data.deviceId : data.metadata?.deviceId;
  const deviceType = data.deviceType !== undefined ? data.deviceType : data.metadata?.deviceType;
  const location = data.location !== undefined ? data.location : data.metadata?.location;

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

  // ------------------------------------------
  // Validate numeric measurement fields
  // ------------------------------------------
  if (!isValidNumber(data.temperature)) {
    errors.push('temperature is required and must be a valid finite number.');
  }

  if (!isValidNumber(data.pressure)) {
    errors.push('pressure is required and must be a valid finite number.');
  }

  if (!isValidNumber(data.vibration)) {
    errors.push('vibration is required and must be a valid finite number.');
  }

  // ------------------------------------------
  // Handle timestamp (optional)
  // ------------------------------------------
  let timestamp;
  if (data.timestamp !== undefined && data.timestamp !== null && data.timestamp !== '') {
    if (
      typeof data.timestamp === 'boolean' ||
      Array.isArray(data.timestamp) ||
      (typeof data.timestamp === 'object' && !(data.timestamp instanceof Date))
    ) {
      errors.push('timestamp must be a valid ISO 8601 date string or timestamp.');
    } else {
      const parsedDate = new Date(data.timestamp);
      if (Number.isNaN(parsedDate.getTime())) {
        errors.push('timestamp must be a valid ISO 8601 date string or timestamp.');
      } else {
        timestamp = parsedDate;
      }
    }
  } else {
    timestamp = new Date();
  }

  // ------------------------------------------
  // Return result
  // ------------------------------------------
  if (errors.length > 0) {
    return { valid: false, errors, sanitized: null };
  }

  return {
    valid: true,
    errors: [],
    sanitized: {
      timestamp,
      metadata: {
        deviceId: String(deviceId).trim(),
        deviceType: String(deviceType).trim(),
        location: String(location).trim()
      },
      temperature: Number(data.temperature),
      pressure: Number(data.pressure),
      vibration: Number(data.vibration)
    }
  };
};

module.exports = { validateTelemetryData };
