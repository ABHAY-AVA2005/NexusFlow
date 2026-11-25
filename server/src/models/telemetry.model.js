/**
 * @module server/models/telemetry
 * @description Describes exactly how a sensor reading is stored in MongoDB. Field types,
 * required values, and defaults here prevent inconsistent records from entering the database.
 */
const mongoose = require('mongoose');

/**
 * Mongoose Schema for the pre-existing MongoDB Time-Series collection 'telemetry'.
 *
 * Configured with autoCreate: false and autoIndex: false to ensure Mongoose
 * does not attempt to recreate, overwrite, or alter the existing Time-Series collection.
 */
const telemetrySchema = new mongoose.Schema(
  {
    timestamp: {
      type: Date,
      default: Date.now,
      required: [true, 'Timestamp is required']
    },
    metadata: {
      deviceId: {
        type: String,
        required: [true, 'deviceId is required'],
        trim: true
      },
      deviceType: {
        type: String,
        required: [true, 'deviceType is required'],
        trim: true
      },
      location: {
        type: String,
        required: [true, 'location is required'],
        trim: true
      }
    },
    temperature: {
      type: Number,
      required: [true, 'temperature reading is required']
    },
    pressure: {
      type: Number,
      required: [true, 'pressure reading is required']
    },
    vibration: {
      type: Number,
      required: [true, 'vibration reading is required']
    }
  },
  {
    collection: 'telemetry',
    timeseries: {
      timeField: 'timestamp',
      metaField: 'metadata',
      granularity: 'seconds'
    },
    autoCreate: false,
    autoIndex: false,
    versionKey: false
  }
);

const Telemetry = mongoose.models.Telemetry || mongoose.model('Telemetry', telemetrySchema);

module.exports = Telemetry;
