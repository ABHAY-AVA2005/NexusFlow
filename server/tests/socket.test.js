/**
 * Socket.IO Integration Test Script
 *
 * Tests:
 *   1. Client connection
 *   2. Client disconnection
 *   3. Valid telemetry message  → ack + broadcast + DB persistence
 *   4. Invalid telemetry message → error event + ack error
 *   5. Broadcasting to multiple connected clients
 *   6. MongoDB persistence verification
 *
 * Runs against a live HTTP + Socket.IO server with a real MongoDB connection.
 */

const http = require('http');
const express = require('express');
const mongoose = require('mongoose');
const { io: ioClient } = require('socket.io-client');
const { initializeSocket } = require('../src/services/socketManager');
const { getTelemetryStream } = require('../src/services/telemetryStream.service');
const config = require('../src/config/env');

// Use a different port to avoid clashing with a running dev server.
const TEST_PORT = 5099;
const SERVER_URL = `http://localhost:${TEST_PORT}`;

let httpServer;
let io;
let passed = 0;
let failed = 0;

// ── Helpers ──────────────────────────────────────────────────

function assert(condition, label) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.log(`  ✗ ${label}`);
    failed++;
  }
}

function createClient() {
  return ioClient(SERVER_URL, {
    transports: ['websocket'],
    forceNew: true,
    autoConnect: false
  });
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Test runner ──────────────────────────────────────────────

async function runTests() {
  // ── Setup: connect to MongoDB and start server ───────────
  console.log('\n--- Setup ---');
  await mongoose.connect(config.mongoUri);
  console.log('  MongoDB connected.');

  const app = express();
  httpServer = http.createServer(app);
  io = initializeSocket(httpServer);

  await new Promise((resolve) => httpServer.listen(TEST_PORT, resolve));
  console.log(`  Test server listening on port ${TEST_PORT}\n`);

  // Subscribe to central RxJS telemetry stream
  const streamEmissions = [];
  const streamSub = getTelemetryStream().subscribe({
    next: (record) => streamEmissions.push(record)
  });

  // ════════════════════════════════════════════════════════════
  // TEST 1: Client connection
  // ════════════════════════════════════════════════════════════
  console.log('Test 1: Client connection');
  const client1 = createClient();

  await new Promise((resolve) => {
    client1.on('connect', () => {
      assert(client1.connected === true, 'client1 is connected');
      assert(typeof client1.id === 'string' && client1.id.length > 0, 'client1 has a socket id');
      resolve();
    });
    client1.connect();
  });

  // ════════════════════════════════════════════════════════════
  // TEST 2: Client disconnection
  // ════════════════════════════════════════════════════════════
  console.log('\nTest 2: Client disconnection');
  const tempClient = createClient();

  await new Promise((resolve) => {
    tempClient.on('connect', resolve);
    tempClient.connect();
  });

  assert(tempClient.connected === true, 'tempClient is connected before disconnect');

  await new Promise((resolve) => {
    tempClient.on('disconnect', () => {
      assert(tempClient.connected === false, 'tempClient is disconnected after .disconnect()');
      resolve();
    });
    tempClient.disconnect();
  });

  // ════════════════════════════════════════════════════════════
  // TEST 3: Invalid telemetry message
  // ════════════════════════════════════════════════════════════
  console.log('\nTest 3: Invalid telemetry message');

  const errorPromise = new Promise((resolve) => {
    client1.once('telemetry:error', (data) => {
      assert(data.status === 'error', 'telemetry:error event emitted with status "error"');
      assert(Array.isArray(data.errors) && data.errors.length > 0, 'telemetry:error contains errors array');
      resolve();
    });
  });

  const invalidPayload = { deviceId: '', temperature: 'not-a-number' };

  const ackResult = await new Promise((resolve) => {
    client1.emit('telemetry:send', invalidPayload, (ack) => {
      resolve(ack);
    });
  });

  assert(ackResult.status === 'error', 'acknowledgement callback returns error for invalid data');
  assert(Array.isArray(ackResult.errors), 'acknowledgement callback includes errors array');

  // Wait for the telemetry:error event listener to fire too.
  await errorPromise;

  // ════════════════════════════════════════════════════════════
  // TEST 4: Valid telemetry message (ack + persistence)
  // ════════════════════════════════════════════════════════════
  console.log('\nTest 4: Valid telemetry message (acknowledgement + persistence)');

  const validPayload = {
    deviceId: 'test-sensor-ws-001',
    deviceType: 'temperature-sensor',
    location: 'test-lab-socket',
    temperature: 42.7,
    pressure: 1012.3,
    vibration: 0.05,
    timestamp: '2026-11-17T08:00:00.000Z'
  };

  // Listen for broadcast on client1 itself (io.emit sends to all)
  const broadcastOnSender = new Promise((resolve) => {
    client1.once('telemetry:received', (data) => {
      resolve(data);
    });
  });

  const validAck = await new Promise((resolve) => {
    client1.emit('telemetry:send', validPayload, (ack) => {
      resolve(ack);
    });
  });

  assert(validAck.status === 'success', 'acknowledgement returns success');
  assert(validAck.data && validAck.data.id, 'acknowledgement contains saved document id');
  assert(validAck.data.temperature === 42.7, 'acknowledgement echoes correct temperature');
  assert(validAck.data.metadata.deviceId === 'test-sensor-ws-001', 'acknowledgement echoes correct deviceId');

  const senderBroadcast = await broadcastOnSender;
  assert(senderBroadcast.status === 'success', 'sender receives telemetry:received broadcast');

  // Verify emission in central RxJS stream
  const wsStreamRecord = streamEmissions.find((rec) => rec.metadata && rec.metadata.deviceId === 'test-sensor-ws-001');
  assert(wsStreamRecord !== undefined, 'getTelemetryStream() receives valid socket telemetry emission');
  assert(typeof wsStreamRecord.toObject === 'undefined', 'Socket stream emission is a plain object without .toObject()');
  assert(!('$__' in wsStreamRecord), 'Socket stream emission does not contain Mongoose $__ property');
  assert(!('_doc' in wsStreamRecord), 'Socket stream emission does not contain Mongoose _doc property');
  assert(wsStreamRecord.temperature === 42.7, 'Socket stream emission matches payload temperature');

  // ════════════════════════════════════════════════════════════
  // TEST 5: Broadcasting to multiple connected clients
  // ════════════════════════════════════════════════════════════
  console.log('\nTest 5: Broadcasting to multiple connected clients');

  const client2 = createClient();
  const client3 = createClient();

  await new Promise((resolve) => { client2.on('connect', resolve); client2.connect(); });
  await new Promise((resolve) => { client3.on('connect', resolve); client3.connect(); });

  assert(client2.connected, 'client2 is connected');
  assert(client3.connected, 'client3 is connected');

  // Both client2 and client3 listen for broadcast
  const bc2 = new Promise((resolve) => { client2.once('telemetry:received', resolve); });
  const bc3 = new Promise((resolve) => { client3.once('telemetry:received', resolve); });

  const broadcastPayload = {
    deviceId: 'test-sensor-ws-002',
    deviceType: 'pressure-sensor',
    location: 'test-lab-broadcast',
    temperature: 55.0,
    pressure: 1020.0,
    vibration: 0.10
  };

  // client1 sends, client2 and client3 should receive
  await new Promise((resolve) => {
    client1.emit('telemetry:send', broadcastPayload, resolve);
  });

  const [data2, data3] = await Promise.all([bc2, bc3]);

  assert(data2.status === 'success', 'client2 received broadcast');
  assert(data2.data.metadata.deviceId === 'test-sensor-ws-002', 'client2 broadcast has correct deviceId');
  assert(data3.status === 'success', 'client3 received broadcast');
  assert(data3.data.temperature === 55.0, 'client3 broadcast has correct temperature');

  // ════════════════════════════════════════════════════════════
  // TEST 6: MongoDB persistence verification
  // ════════════════════════════════════════════════════════════
  console.log('\nTest 6: MongoDB persistence verification');

  const Telemetry = require('../src/models/telemetry.model');

  const doc1 = await Telemetry.findOne({ 'metadata.deviceId': 'test-sensor-ws-001' });
  assert(doc1 !== null, 'test-sensor-ws-001 found in MongoDB');
  assert(doc1.temperature === 42.7, 'stored temperature matches sent value');
  assert(doc1.metadata.location === 'test-lab-socket', 'stored location matches sent value');

  const doc2 = await Telemetry.findOne({ 'metadata.deviceId': 'test-sensor-ws-002' });
  assert(doc2 !== null, 'test-sensor-ws-002 found in MongoDB');
  assert(doc2.pressure === 1020.0, 'stored pressure matches sent value');

  // ── Cleanup: remove test documents ──────────────────────
  console.log('\n--- Cleanup ---');
  await Telemetry.deleteMany({ 'metadata.deviceId': { $in: ['test-sensor-ws-001', 'test-sensor-ws-002'] } });
  console.log('  Test documents removed from MongoDB.');

  // ── Disconnect clients and shut down ────────────────────
  client1.disconnect();
  client2.disconnect();
  client3.disconnect();

  await wait(200);

  streamSub.unsubscribe();
  io.close();
  await new Promise((resolve) => httpServer.close(resolve));
  await mongoose.disconnect();

  // ── Results ─────────────────────────────────────────────
  console.log('\n==================================================');
  console.log(` Tests passed: ${passed}`);
  console.log(` Tests failed: ${failed}`);
  console.log('==================================================\n');

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error('Test suite crashed:', err);
  process.exit(1);
});
