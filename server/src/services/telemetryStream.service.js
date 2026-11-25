/**
 * Central Telemetry Stream Service
 *
 * Provides a centralized, reactive RxJS stream for validated and persisted
 * IoT telemetry data across NexusFlow.
 *
 * Architecture & Encapsulation:
 * - Backed by a module-scoped private RxJS Subject (_telemetrySubject$).
 * - Consumers access the stream exclusively through getTelemetryStream(),
 *   which returns a read-only Observable via asObservable().
 * - External consumers cannot push data, complete, or error the stream directly.
 * - Ingestion is restricted to publishTelemetry(savedRecord), which requires
 *   a MongoDB-persisted record conforming to the Telemetry Mongoose schema.
 *
 * @module services/telemetryStream.service
 */

const { Subject } = require('rxjs');

// ==========================================
// Module-Scoped Private State
// ==========================================

/**
 * Internal multicast event bus for persisted IoT telemetry.
 * Kept private to this module to guarantee single-source-of-truth ingestion.
 * @type {Subject<object>}
 * @private
 */
const _telemetrySubject$ = new Subject();

// ==========================================
// Validation Helper
// ==========================================

/**
 * Validates that a record has been persisted and matches required Telemetry schema fields.
 *
 * @param {*} record - The candidate telemetry record.
 * @throws {Error} If the record fails persistence or schema validation.
 */
const validatePersistedRecord = (record) => {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new Error('Telemetry record must be a valid non-null object.');
  }

  // Must have a MongoDB _id indicating successful database persistence
  if (!record._id) {
    throw new Error('Telemetry record must have a valid MongoDB _id.');
  }

  // Must have a valid timestamp
  if (!record.timestamp) {
    throw new Error('Telemetry record must contain a timestamp.');
  }
  const parsedDate = new Date(record.timestamp);
  if (Number.isNaN(parsedDate.getTime())) {
    throw new Error('Telemetry record timestamp must be a valid date.');
  }

  // Must have metadata object with required string fields
  if (!record.metadata || typeof record.metadata !== 'object' || Array.isArray(record.metadata)) {
    throw new Error('Telemetry record must contain a valid metadata object.');
  }

  const { deviceId, deviceType, location } = record.metadata;
  if (typeof deviceId !== 'string' || !deviceId.trim()) {
    throw new Error('Telemetry metadata.deviceId is required and must be a non-empty string.');
  }
  if (typeof deviceType !== 'string' || !deviceType.trim()) {
    throw new Error('Telemetry metadata.deviceType is required and must be a non-empty string.');
  }
  if (typeof location !== 'string' || !location.trim()) {
    throw new Error('Telemetry metadata.location is required and must be a non-empty string.');
  }

  // Must have valid numeric sensor measurements (matching Mongoose schema)
  const isValidNumber = (val) => typeof val === 'number' && !Number.isNaN(val) && Number.isFinite(val);

  if (!isValidNumber(record.temperature)) {
    throw new Error('Telemetry temperature is required and must be a valid finite number.');
  }
  if (!isValidNumber(record.pressure)) {
    throw new Error('Telemetry pressure is required and must be a valid finite number.');
  }
  if (!isValidNumber(record.vibration)) {
    throw new Error('Telemetry vibration is required and must be a valid finite number.');
  }
};

// ==========================================
// Public Service API
// ==========================================

/**
 * Publishes a verified, MongoDB-persisted telemetry record into the central stream.
 *
 * Guarantees that only valid records with database IDs enter the reactive pipeline.
 * Downstream subscriber errors are isolated to prevent terminating the stream.
 *
 * @param {object} savedRecord - The persisted Mongoose document or document-like object.
 * @throws {Error} If savedRecord fails validation.
 */
const publishTelemetry = (savedRecord) => {
  // Validate schema and persistence contract
  validatePersistedRecord(savedRecord);

  // Safely emit to the private Subject.
  // Note: asObservable() consumers cannot call .error() or .complete() on _telemetrySubject$.
  _telemetrySubject$.next(savedRecord);
};

/**
 * Returns a read-only Observable of the central telemetry stream.
 *
 * Uses asObservable() to strip Subject mutation methods (.next, .error, .complete),
 * protecting the central pipeline against unauthorized emission or accidental termination.
 *
 * @returns {import('rxjs').Observable<object>} Read-only telemetry stream.
 */
const getTelemetryStream = () => {
  return _telemetrySubject$.asObservable();
};

module.exports = {
  publishTelemetry,
  getTelemetryStream
};
