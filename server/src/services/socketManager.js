/**
 * Socket.IO Server Manager
 *
 * Initializes the Socket.IO server on top of the existing HTTP server,
 * handles real-time client connections, and processes incoming IoT
 * telemetry events.
 *
 * Data flow per message:
 *   1. Client emits 'telemetry:send' with a JSON payload.
 *   2. Payload is validated via the shared telemetryValidator.
 *   3. If invalid  → 'telemetry:error' is emitted back to the sender.
 *   4. If valid    → persisted to MongoDB via the existing Telemetry model,
 *                    then broadcast to ALL clients via 'telemetry:received'.
 *   5. If DB fails → 'telemetry:error' is emitted back to the sender;
 *                    the reading is NOT broadcast (data integrity first).
 *
 * @module services/socketManager
 */

const { Server } = require('socket.io');
const { validateTelemetryData } = require('../validators/telemetryValidator');
const Telemetry = require('../models/telemetry.model');
const { publishTelemetry } = require('./telemetryStream.service');

// ==========================================
// Initialization
// ==========================================

/**
 * Creates and configures a Socket.IO server attached to the given HTTP server.
 *
 * Why we receive the httpServer as a parameter instead of creating our own:
 *   - Keeps server.js as the single owner of the listen lifecycle.
 *   - Lets both Express (REST) and Socket.IO (WS) share the same port.
 *   - Makes it easy to swap or mock the server in tests.
 *
 * @param {import('http').Server} httpServer - The Node.js HTTP server instance.
 * @returns {import('socket.io').Server} The configured Socket.IO server.
 */
const initializeSocket = (httpServer) => {
  // Create the Socket.IO server.
  // cors: allows the same origin as Express so dashboard clients can connect.
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:3000',
      methods: ['GET', 'POST'],
      credentials: true
    }
  });

  // Register connection-level event handlers.
  io.on('connection', (socket) => {
    console.log(`[Socket.IO] Client connected: ${socket.id}`);

    // ----- telemetry:send -----
    // The main inbound event from IoT devices / simulators.
    socket.on('telemetry:send', async (data, callback) => {
      // Ensure the optional acknowledgement callback is usable.
      // If the client did not pass a callback we create a no-op
      // so downstream code can call it unconditionally.
      const ack = typeof callback === 'function' ? callback : () => {};

      // --- Step 1: Validate ---
      const result = validateTelemetryData(data);

      if (!result.valid) {
        // Tell the sender what was wrong.
        socket.emit('telemetry:error', {
          status: 'error',
          message: 'Validation failed for telemetry data.',
          errors: result.errors
        });

        // Also acknowledge with the error so the client's callback resolves.
        ack({
          status: 'error',
          message: 'Validation failed for telemetry data.',
          errors: result.errors
        });
        return;
      }

      // --- Step 2: Persist ---
      try {
        const savedRecord = await Telemetry.create(result.sanitized);

        // Normalize to plain JavaScript object before publishing into central reactive stream
        const plainRecord = typeof savedRecord.toObject === 'function'
          ? savedRecord.toObject()
          : savedRecord;

        // Publish to central reactive stream only after successful persistence
        try {
          publishTelemetry(plainRecord);
        } catch (streamError) {
          console.error(`[Socket.IO] Failed to publish telemetry to stream for socket ${socket.id}:`, streamError.message);
        }

        // Build a clean response payload (matches the REST controller shape).
        const responseData = {
          id: savedRecord._id,
          timestamp: savedRecord.timestamp,
          metadata: savedRecord.metadata,
          temperature: savedRecord.temperature,
          pressure: savedRecord.pressure,
          vibration: savedRecord.vibration
        };

        // --- Step 3: Broadcast ---
        // io.emit sends to ALL connected clients (including the sender).
        // This is intentional: the sender receives confirmation that its
        // reading was persisted, and dashboard clients receive the update.
        io.emit('telemetry:received', {
          status: 'success',
          message: 'Telemetry reading recorded and broadcast.',
          data: responseData
        });

        // Acknowledge the sender's callback with the saved data.
        ack({
          status: 'success',
          message: 'Telemetry reading recorded successfully.',
          data: responseData
        });
      } catch (error) {
        // Database write failed — do NOT broadcast partial data.
        console.error(`[Socket.IO] Database error for socket ${socket.id}:`, error.message);

        socket.emit('telemetry:error', {
          status: 'error',
          message: 'Failed to persist telemetry data.',
          detail: error.message
        });

        ack({
          status: 'error',
          message: 'Failed to persist telemetry data.',
          detail: error.message
        });
      }
    });

    // ----- disconnect -----
    // Socket.IO automatically removes the socket from all rooms and from
    // the io.sockets pool, so no manual cleanup is needed.
    socket.on('disconnect', (reason) => {
      console.log(`[Socket.IO] Client disconnected: ${socket.id} (reason: ${reason})`);
    });
  });

  console.log('[Socket.IO] Server initialized and awaiting connections.');
  return io;
};

module.exports = { initializeSocket };
