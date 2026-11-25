/**
 * REST Telemetry Ingestion & RxJS Stream Integration Test Suite
 *
 * Verifies end-to-end HTTP telemetry ingestion:
 *   1. Valid telemetry payload returns HTTP 201 with existing response contract.
 *   2. Successful persistence publishes exactly once into the RxJS central stream.
 *   3. Invalid telemetry payload returns HTTP 400 and is NOT published to the stream.
 *   4. Database write failure returns HTTP 500 and does NOT publish to the stream.
 *   5. MongoDB persistence verification and clean teardown.
 *
 * Execution:
 *   node tests/telemetry.test.js
 */

const http = require('http');
const express = require('express');
const mongoose = require('mongoose');
const config = require('../src/config/env');
const telemetryRoutes = require('../src/routes/telemetry.routes');
const { errorHandler } = require('../src/middleware/errorHandler');
const Telemetry = require('../src/models/telemetry.model');
const { getTelemetryStream } = require('../src/services/telemetryStream.service');

// Use a dedicated port to prevent collision with other servers
const TEST_PORT = 5098;
const SERVER_URL = `http://localhost:${TEST_PORT}`;

let httpServer;
let passed = 0;
let failed = 0;

// ── Helpers ──────────────────────────────────────────────────

function assert(condition, label) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${label}`);
    failed++;
  }
}

// ── Test Runner ──────────────────────────────────────────────

async function runTests() {
  console.log('\n==================================================');
  console.log(' NexusFlow: REST Telemetry & RxJS Integration Tests');
  console.log('==================================================\n');

  // ── Setup: connect to MongoDB and start test server ─────────
  console.log('--- Setup ---');
  await mongoose.connect(config.mongoUri);
  console.log('  MongoDB connected.');

  const app = express();
  app.use(express.json());
  app.use('/api/telemetry', telemetryRoutes);
  app.use(errorHandler);

  httpServer = http.createServer(app);
  await new Promise((resolve) => httpServer.listen(TEST_PORT, resolve));
  console.log(`  Test HTTP server listening on port ${TEST_PORT}\n`);

  // Subscribe to central telemetry stream to monitor reactive publications
  const stream$ = getTelemetryStream();
  const streamEmissions = [];
  const streamSubscription = stream$.subscribe({
    next: (record) => streamEmissions.push(record)
  });

  try {
    // ════════════════════════════════════════════════════════════
    // Test 1: Valid Telemetry Ingestion (HTTP 201 + Stream Publish)
    // ════════════════════════════════════════════════════════════
    console.log('Test 1: Valid telemetry payload ingestion');

    const validPayload = {
      metadata: {
        deviceId: 'test-rest-sensor-001',
        deviceType: 'temperature-sensor',
        location: 'Warehouse-Zone-A'
      },
      temperature: 78.4,
      pressure: 101.325,
      vibration: 0.015
    };

    const res1 = await fetch(`${SERVER_URL}/api/telemetry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validPayload)
    });

    const body1 = await res1.json();

    assert(res1.status === 201, 'Valid telemetry returns HTTP 201 Created');
    assert(body1.status === 'success', 'Response status field is "success"');
    assert(body1.message === 'Telemetry reading recorded successfully', 'Response message matches contract');
    assert(body1.data && typeof body1.data.id === 'string', 'Response data contains persisted MongoDB id');
    assert(body1.data.metadata.deviceId === 'test-rest-sensor-001', 'Response data echoes correct deviceId');
    assert(body1.data.temperature === 78.4, 'Response data echoes correct temperature');
    assert(body1.data.pressure === 101.325, 'Response data echoes correct pressure');
    assert(body1.data.vibration === 0.015, 'Response data echoes correct vibration');
    assert(body1.data.timestamp !== undefined, 'Response data includes timestamp');

    // Verify exactly once publication into central RxJS stream
    assert(streamEmissions.length === 1, 'Successful persistence publishes exactly once into RxJS stream');
    assert(String(streamEmissions[0]._id) === String(body1.data.id), 'Stream emission contains matching MongoDB _id');
    assert(streamEmissions[0].metadata.deviceId === 'test-rest-sensor-001', 'Stream emission contains matching deviceId');
    assert(streamEmissions[0].temperature === 78.4, 'Stream emission contains matching temperature');

    // ════════════════════════════════════════════════════════════
    // Test 2: Invalid Telemetry Rejection (HTTP 400 + No Stream)
    // ════════════════════════════════════════════════════════════
    console.log('\nTest 2: Invalid telemetry payload rejection');

    const invalidPayload = {
      metadata: {
        deviceId: '   ', // invalid empty string
        deviceType: 'sensor',
        location: 'Lab'
      },
      temperature: 'not-a-number', // invalid numeric field
      pressure: 100,
      vibration: 0
    };

    const emissionCountBefore = streamEmissions.length;

    const res2 = await fetch(`${SERVER_URL}/api/telemetry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(invalidPayload)
    });

    const body2 = await res2.json();

    assert(res2.status === 400, 'Invalid telemetry returns HTTP 400 Bad Request');
    assert(body2.status === 'error', 'Response status field is "error"');
    assert(Array.isArray(body2.errors) && body2.errors.length > 0, 'Response includes array of validation errors');
    assert(
      streamEmissions.length === emissionCountBefore,
      'Invalid telemetry does NOT publish to the RxJS stream'
    );

    // ════════════════════════════════════════════════════════════
    // Test 3: Database Failure Isolation (HTTP 500 + No Stream)
    // ════════════════════════════════════════════════════════════
    console.log('\nTest 3: Database failure isolation');

    const emissionCountBeforeDbFail = streamEmissions.length;

    // Temporarily simulate a MongoDB failure during Telemetry.create
    const originalCreate = Telemetry.create;
    Telemetry.create = async () => {
      throw new Error('Simulated MongoDB connection drop');
    };

    const res3 = await fetch(`${SERVER_URL}/api/telemetry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validPayload)
    });

    const body3 = await res3.json();

    // Restore original Telemetry.create immediately
    Telemetry.create = originalCreate;

    assert(res3.status === 500, 'Database failure returns HTTP 500 Internal Server Error');
    assert(body3.status === 'error', 'Response status field is "error"');
    assert(
      streamEmissions.length === emissionCountBeforeDbFail,
      'Database failure does NOT publish to the RxJS stream'
    );

    // ════════════════════════════════════════════════════════════
    // Test 4: Direct MongoDB Persistence Verification
    // ════════════════════════════════════════════════════════════
    console.log('\nTest 4: MongoDB persistence verification');

    const docInDb = await Telemetry.findById(body1.data.id);
    assert(docInDb !== null, 'Saved telemetry document exists in MongoDB');
    assert(docInDb.metadata.deviceId === 'test-rest-sensor-001', 'Stored deviceId matches payload');
    assert(docInDb.temperature === 78.4, 'Stored temperature matches payload');
    assert(docInDb.pressure === 101.325, 'Stored pressure matches payload');
    assert(docInDb.vibration === 0.015, 'Stored vibration matches payload');

  } finally {
    // ── Cleanup ────────────────────────────────────────────────
    console.log('\n--- Cleanup ---');
    streamSubscription.unsubscribe();

    // Clean up test documents
    const deleteResult = await Telemetry.deleteMany({
      'metadata.deviceId': 'test-rest-sensor-001'
    });
    console.log(`  Test documents removed from MongoDB: ${deleteResult.deletedCount}`);

    // Close HTTP server and MongoDB connection
    await new Promise((resolve) => httpServer.close(resolve));
    console.log('  Test HTTP server closed.');

    await mongoose.disconnect();
    console.log('  MongoDB disconnected.');
  }

  // ── Results Summary ────────────────────────────────────────
  console.log('\n==================================================');
  console.log(` Tests passed: ${passed}`);
  console.log(` Tests failed: ${failed}`);
  console.log('==================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Unhandled test suite error:', err);
  process.exit(1);
});
