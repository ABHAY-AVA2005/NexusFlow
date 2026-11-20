const Telemetry = require('../models/telemetry.model');
const { broadcastTelemetry } = require('../ws/telemetryServer');

const toBroadcastPayload = (input, savedRecord) => ({
  ...input,
  sensorId: input.sensorId || input.deviceId || input.metadata?.deviceId,
  timestamp: savedRecord.timestamp,
});

/**
 * Ingest IoT Telemetry Reading
 *
 * @route   POST /api/telemetry
 * @desc    Accept and store device telemetry data in MongoDB Time-Series collection
 * @access  Public
 */
const createTelemetry = async (req, res, next) => {
  try {
    const telemetryData = req.sanitizedTelemetry;

    if (!telemetryData) {
      return res.status(400).json({
        status: 'error',
        message: 'No sanitized telemetry data available to store.'
      });
    }

    const savedRecord = await Telemetry.create(telemetryData);
    broadcastTelemetry(toBroadcastPayload(req.body, savedRecord));

    return res.status(201).json({
      status: 'success',
      message: 'Telemetry reading recorded successfully',
      data: {
        id: savedRecord._id,
        timestamp: savedRecord.timestamp,
        metadata: savedRecord.metadata,
        temperature: savedRecord.temperature,
        pressure: savedRecord.pressure,
        vibration: savedRecord.vibration,
        rpm: savedRecord.rpm,
        anomaly: savedRecord.anomaly,
        status: savedRecord.status
      }
    });
  } catch (error) {
    console.error('Error saving telemetry reading:', error.message);
    if (error.name === 'ValidationError') {
      res.status(400);
    }
    next(error);
  }
};

const createTelemetryBatch = async (req, res, next) => {
  try {
    const records = await Telemetry.insertMany(req.sanitizedTelemetryBatch);
    const telemetry = records.map((record, index) =>
      toBroadcastPayload(req.body.batch[index], record)
    );
    telemetry.forEach(broadcastTelemetry);

    return res.status(201).json({
      status: 'success',
      message: 'Telemetry batch recorded successfully',
      count: records.length,
    });
  } catch (error) {
    console.error('Error saving telemetry batch:', error.message);
    next(error);
  }
};

module.exports = {
  createTelemetry,
  createTelemetryBatch,
};
