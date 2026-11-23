const Telemetry = require('../models/telemetry.model');
const { broadcastTelemetry } = require('../ws/telemetryServer');
const { processTelemetry: processLiveTelemetry } = require('../engine/liveRuleRegistry');

const toBroadcastPayload = (input, savedRecord) => ({
  ...input,
  sensorId: input.sensorId || input.deviceId || input.metadata?.deviceId,
  timestamp: savedRecord.timestamp,
});

const publishTelemetry = (telemetry) => {
  broadcastTelemetry(telemetry);
  processLiveTelemetry(telemetry);
};

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
    publishTelemetry(toBroadcastPayload(req.body, savedRecord));

    return res.status(201).json({
      status: 'success',
      message: 'Telemetry reading recorded successfully',
      data: {
        id: savedRecord._id,
        timestamp: savedRecord.timestamp,
        metadata: savedRecord.metadata,
        temperature: savedRecord.temperature,
        pressure: savedRecord.pressure,
        vibration: savedRecord.vibration
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
    telemetry.forEach(publishTelemetry);

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
