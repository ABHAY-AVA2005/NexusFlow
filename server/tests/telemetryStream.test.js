/**
 * Central Telemetry Stream Service Unit & Integration Test Suite
 *
 * Verifies the reactive telemetry pipeline:
 * 1. Successful publication of persisted records.
 * 2. Strict FIFO event ordering.
 * 3. Robust rejection of invalid or unpersisted payloads.
 * 4. Multicasting to multiple concurrent subscribers.
 * 5. Read-only Observable encapsulation (tamper resistance).
 * 6. Clean subscription teardown via unsubscribe().
 * 7. Stream resilience against downstream subscriber errors.
 * 8. Mongoose document normalization to plain JavaScript object.
 *
 * Execution:
 *   node tests/telemetryStream.test.js
 */

const { publishTelemetry, getTelemetryStream } = require('../src/services/telemetryStream.service');
const Telemetry = require('../src/models/telemetry.model');

// ==========================================
// Test Runner Harness
// ==========================================

let passedCount = 0;
let failedCount = 0;

const assert = (condition, message) => {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passedCount++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failedCount++;
  }
};

// Helper: Factory for mock persisted MongoDB telemetry records
const createMockRecord = (overrides = {}) => {
  return {
    _id: '65f8a1b2c3d4e5f6a7b8c9d0',
    timestamp: new Date().toISOString(),
    metadata: {
      deviceId: 'sensor-furnace-01',
      deviceType: 'temperature-sensor',
      location: 'Foundry-Floor-A'
    },
    temperature: 85.5,
    pressure: 101.3,
    vibration: 0.045,
    ...overrides
  };
};

// ==========================================
// Test Cases
// ==========================================

const runTests = async () => {
  console.log('\n==================================================');
  console.log(' NexusFlow: Central Telemetry Stream Test Suite');
  console.log('==================================================\n');

  const telemetry$ = getTelemetryStream();

  // ----------------------------------------------------
  // Test 1: Read-Only Observable Encapsulation
  // ----------------------------------------------------
  console.log('Test 1: Read-Only Observable Encapsulation');
  assert(typeof telemetry$.subscribe === 'function', 'Observable exposes subscribe() method');
  assert(typeof telemetry$.pipe === 'function', 'Observable exposes pipe() method');
  assert(telemetry$.next === undefined, 'Observable does NOT expose .next() (read-only)');
  assert(telemetry$.error === undefined, 'Observable does NOT expose .error()');
  assert(telemetry$.complete === undefined, 'Observable does NOT expose .complete()');

  // ----------------------------------------------------
  // Test 2: Successful Telemetry Publication
  // ----------------------------------------------------
  console.log('\nTest 2: Successful Telemetry Publication');
  const receivedTest2 = [];
  const sub2 = telemetry$.subscribe({
    next: (record) => receivedTest2.push(record)
  });

  const validRecord1 = createMockRecord({
    metadata: {
      deviceId: 'sensor-test-01',
      deviceType: 'temp-probe',
      location: 'Lab-1'
    },
    temperature: 42.0,
    pressure: 98.2,
    vibration: 0.01
  });

  publishTelemetry(validRecord1);

  assert(receivedTest2.length === 1, 'Subscriber received exactly 1 telemetry emission');
  assert(receivedTest2[0]._id === validRecord1._id, 'Received record matches saved _id');
  assert(receivedTest2[0].metadata.deviceId === 'sensor-test-01', 'Received record matches deviceId');
  assert(receivedTest2[0].temperature === 42.0, 'Received record matches temperature');
  sub2.unsubscribe();

  // ----------------------------------------------------
  // Test 3: FIFO Ordering
  // ----------------------------------------------------
  console.log('\nTest 3: FIFO Sequential Ordering');
  const receivedFIFO = [];
  const sub3 = telemetry$.subscribe({
    next: (record) => receivedFIFO.push(record.sequence)
  });

  for (let i = 1; i <= 5; i++) {
    const record = createMockRecord({
      _id: `mock-id-seq-${i}`,
      sequence: i
    });
    publishTelemetry(record);
  }

  assert(receivedFIFO.length === 5, 'Received all 5 sequential records');
  assert(
    JSON.stringify(receivedFIFO) === JSON.stringify([1, 2, 3, 4, 5]),
    `Events received in exact FIFO order: [${receivedFIFO.join(', ')}]`
  );
  sub3.unsubscribe();

  // ----------------------------------------------------
  // Test 4: Invalid Payload Rejection (Guards)
  // ----------------------------------------------------
  console.log('\nTest 4: Invalid Payload Rejection');
  const invalidPayloads = [
    { label: 'null payload', data: null },
    { label: 'undefined payload', data: undefined },
    { label: 'empty object', data: {} },
    { label: 'missing _id', data: { timestamp: new Date(), metadata: { deviceId: 'd1', deviceType: 't1', location: 'l1' }, temperature: 1, pressure: 2, vibration: 3 } },
    { label: 'missing timestamp', data: { _id: 'id-1', metadata: { deviceId: 'd1', deviceType: 't1', location: 'l1' }, temperature: 1, pressure: 2, vibration: 3 } },
    { label: 'invalid timestamp string', data: { _id: 'id-1', timestamp: 'not-a-date', metadata: { deviceId: 'd1', deviceType: 't1', location: 'l1' }, temperature: 1, pressure: 2, vibration: 3 } },
    { label: 'missing metadata object', data: { _id: 'id-1', timestamp: new Date(), temperature: 1, pressure: 2, vibration: 3 } },
    { label: 'empty deviceId string', data: { _id: 'id-1', timestamp: new Date(), metadata: { deviceId: '   ', deviceType: 't1', location: 'l1' }, temperature: 1, pressure: 2, vibration: 3 } },
    { label: 'missing deviceType', data: { _id: 'id-1', timestamp: new Date(), metadata: { deviceId: 'd1', location: 'l1' }, temperature: 1, pressure: 2, vibration: 3 } },
    { label: 'missing location', data: { _id: 'id-1', timestamp: new Date(), metadata: { deviceId: 'd1', deviceType: 't1' }, temperature: 1, pressure: 2, vibration: 3 } },
    { label: 'string temperature (non-number)', data: { _id: 'id-1', timestamp: new Date(), metadata: { deviceId: 'd1', deviceType: 't1', location: 'l1' }, temperature: '85', pressure: 2, vibration: 3 } },
    { label: 'NaN pressure', data: { _id: 'id-1', timestamp: new Date(), metadata: { deviceId: 'd1', deviceType: 't1', location: 'l1' }, temperature: 1, pressure: NaN, vibration: 3 } },
    { label: 'infinite vibration', data: { _id: 'id-1', timestamp: new Date(), metadata: { deviceId: 'd1', deviceType: 't1', location: 'l1' }, temperature: 1, pressure: 2, vibration: Infinity } }
  ];

  let rejectedCount = 0;
  for (const item of invalidPayloads) {
    try {
      publishTelemetry(item.data);
    } catch (err) {
      rejectedCount++;
    }
  }

  assert(
    rejectedCount === invalidPayloads.length,
    `All ${invalidPayloads.length} invalid payloads were rejected with errors`
  );

  // ----------------------------------------------------
  // Test 5: Multiple Concurrent Subscribers
  // ----------------------------------------------------
  console.log('\nTest 5: Multiple Concurrent Subscribers');
  const subAEvents = [];
  const subBEvents = [];
  const subCEvents = [];

  const subA = telemetry$.subscribe((rec) => subAEvents.push(rec._id));
  const subB = telemetry$.subscribe((rec) => subBEvents.push(rec._id));
  const subC = telemetry$.subscribe((rec) => subCEvents.push(rec._id));

  const multiRecord = createMockRecord({ _id: 'multi-sub-id-999' });
  publishTelemetry(multiRecord);

  assert(subAEvents.length === 1 && subAEvents[0] === 'multi-sub-id-999', 'Subscriber A received multi-cast record');
  assert(subBEvents.length === 1 && subBEvents[0] === 'multi-sub-id-999', 'Subscriber B received multi-cast record');
  assert(subCEvents.length === 1 && subCEvents[0] === 'multi-sub-id-999', 'Subscriber C received multi-cast record');

  subA.unsubscribe();
  subB.unsubscribe();
  subC.unsubscribe();

  // ----------------------------------------------------
  // Test 6: Subscription Teardown via unsubscribe()
  // ----------------------------------------------------
  console.log('\nTest 6: Subscription Teardown');
  const activeEvents = [];
  const deadEvents = [];

  const listenerActive = telemetry$.subscribe((rec) => activeEvents.push(rec._id));
  const listenerDead = telemetry$.subscribe((rec) => deadEvents.push(rec._id));

  // Unsubscribe listenerDead immediately
  listenerDead.unsubscribe();

  const recordAfterUnsub = createMockRecord({ _id: 'post-unsub-id-100' });
  publishTelemetry(recordAfterUnsub);

  assert(activeEvents.length === 1 && activeEvents[0] === 'post-unsub-id-100', 'Active listener received post-unsub record');
  assert(deadEvents.length === 0, 'Unsubscribed listener received NO records');

  listenerActive.unsubscribe();

  // ----------------------------------------------------
  // Test 7: Stream Resilience against Subscriber Errors
  // ----------------------------------------------------
  console.log('\nTest 7: Stream Resilience');
  const { config } = require('rxjs');
  const originalUnhandledHandler = config.onUnhandledError;
  let interceptedSubscriberError = null;

  // Intercept unhandled subscriber errors during this test
  config.onUnhandledError = (err) => {
    interceptedSubscriberError = err;
  };

  const survivingEvents = [];

  // Register a faulty subscriber that throws synchronously
  const faultySub = telemetry$.subscribe({
    next: () => {
      // Simulate faulty rule throwing an error
      throw new Error('Simulated rogue subscriber error');
    }
  });

  // Register a healthy subscriber
  const healthySub = telemetry$.subscribe({
    next: (rec) => survivingEvents.push(rec._id)
  });

  // Publishing should not kill the stream or crash the healthy listener
  const resilientRecord = createMockRecord({ _id: 'resilient-test-id-777' });
  try {
    publishTelemetry(resilientRecord);
  } catch (err) {
    // Isolated
  }

  assert(
    survivingEvents.includes('resilient-test-id-777'),
    'Healthy subscriber received record despite faulty subscriber in the same stream'
  );

  faultySub.unsubscribe();

  // Verify stream is still fully operational for new emissions
  const finalRecord = createMockRecord({ _id: 'final-operational-id-888' });
  publishTelemetry(finalRecord);

  assert(
    survivingEvents.includes('final-operational-id-888'),
    'Stream remains active and continues emitting subsequent records'
  );

  healthySub.unsubscribe();

  // Wait a tick for reportUnhandledError to dispatch to config.onUnhandledError
  await new Promise((resolve) => setTimeout(resolve, 20));

  // Restore original handler
  config.onUnhandledError = originalUnhandledHandler;
  assert(
    interceptedSubscriberError !== null && interceptedSubscriberError.message === 'Simulated rogue subscriber error',
    'Faulty subscriber error was captured without breaking stream execution'
  );

  // ----------------------------------------------------
  // Test 8: Mongoose Document Normalization to Plain Object
  // ----------------------------------------------------
  console.log('\nTest 8: Mongoose Document Normalization to Plain Object');
  const receivedTest8 = [];
  const sub8 = telemetry$.subscribe((rec) => receivedTest8.push(rec));

  const mongooseDoc = new Telemetry({
    metadata: {
      deviceId: 'sensor-mongoose-01',
      deviceType: 'vibration-probe',
      location: 'Foundry-Floor-B'
    },
    temperature: 72.5,
    pressure: 101.4,
    vibration: 0.035,
    timestamp: new Date()
  });

  publishTelemetry(mongooseDoc);

  assert(receivedTest8.length === 1, 'Subscriber received normalized Mongoose document emission');
  const emitted = receivedTest8[0];
  assert(typeof emitted === 'object' && emitted !== null, 'Emitted item is an object');
  assert(typeof emitted.toObject === 'undefined', 'Emitted item is a plain object without .toObject() method');
  assert(!('$__' in emitted), 'Emitted item does not contain internal Mongoose $__ property');
  assert(!('_doc' in emitted), 'Emitted item does not contain internal Mongoose _doc property');

  const spreadRecord = { ...emitted, temperature: 99 };
  assert(spreadRecord.metadata && spreadRecord.metadata.deviceId === 'sensor-mongoose-01', 'Spreading emitted item preserves metadata');
  assert(spreadRecord.pressure === 101.4, 'Spreading emitted item preserves pressure');
  assert(spreadRecord.vibration === 0.035, 'Spreading emitted item preserves vibration');
  assert(spreadRecord.timestamp !== undefined, 'Spreading emitted item preserves timestamp');
  assert(spreadRecord._id !== undefined && String(spreadRecord._id) === String(mongooseDoc._id), 'Spreading emitted item preserves _id');
  assert(spreadRecord.temperature === 99, 'Spreading emitted item allows overriding temperature field');

  sub8.unsubscribe();

  // ----------------------------------------------------
  // Final Results
  // ----------------------------------------------------
  console.log('\n==================================================');
  console.log(` Tests passed: ${passedCount}`);
  console.log(` Tests failed: ${failedCount}`);
  console.log('==================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
};

runTests().catch((err) => {
  console.error('Unhandled test suite error:', err);
  process.exit(1);
});
