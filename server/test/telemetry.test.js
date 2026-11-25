/**
 * @module server/test/telemetry
 * @description QA coverage for telemetry validation, persistence, and WebSocket broadcasting.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const WebSocket = require('ws');
const app = require('../src/index');
const { sanitizeTelemetry } = require('../src/middleware/validateTelemetry');
const {
  broadcastTelemetry,
  startTelemetryWebSocketServer,
} = require('../src/ws/telemetryServer');
const { generateTelemetry, SENSORS } = require('../../simulator/simulator');

test('accepts simulator payloads in the telemetry storage schema', () => {
  const generated = generateTelemetry(SENSORS[0]);
  const result = sanitizeTelemetry(generated);

  assert.deepEqual(result.errors, []);
  assert.equal(result.telemetry.metadata.deviceId, generated.sensorId);
  assert.equal(result.telemetry.metadata.deviceType, 'turbine');
  assert.ok(result.telemetry.timestamp instanceof Date);
});

test('rejects invalid measurements and missing device metadata', () => {
  const result = sanitizeTelemetry({
    deviceId: 'sensor-1',
    location: 'Section A',
    temperature: 'not-a-number',
    pressure: 30,
    vibration: 2,
  });

  assert.equal(result.telemetry, undefined);
  assert.equal(result.errors.length, 2);
});

test('rejects invalid bulk telemetry before accessing the database', async () => {
  const server = app.listen(0);
  try {
    await new Promise((resolve) => server.once('listening', resolve));
    const { port } = server.address();
    const response = await new Promise((resolve, reject) => {
      const request = http.request({
        hostname: '127.0.0.1',
        port,
        path: '/api/telemetry/bulk',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => resolve({ statusCode: res.statusCode, body }));
      });

      request.on('error', reject);
      request.end(JSON.stringify({ batch: [{ temperature: 10 }] }));
    });

    assert.equal(response.statusCode, 400);
    assert.match(response.body, /Validation failed for telemetry batch/);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
});

test('broadcasts telemetry to connected WebSocket clients', async () => {
  const server = startTelemetryWebSocketServer(0);
  await new Promise((resolve) => server.once('listening', resolve));

  const client = new WebSocket(`ws://127.0.0.1:${server.address().port}`);
  await new Promise((resolve, reject) => {
    client.once('open', resolve);
    client.once('error', reject);
  });

  const received = new Promise((resolve, reject) => {
    client.once('message', (message) => resolve(JSON.parse(message.toString())));
    client.once('error', reject);
  });
  broadcastTelemetry({ sensorId: 'turbine-01', temperature: 92 });
  assert.deepEqual(await received, { sensorId: 'turbine-01', temperature: 92 });

  const clientClosed = new Promise((resolve) => client.once('close', resolve));
  client.close();
  await clientClosed;
  await new Promise((resolve) => server.close(resolve));
});
