/**
 * @module server/test/liveRuleRegistry
 * @description QA checks for starting, running, and stopping live rules. These tests
 * protect the most important behavior: incoming telemetry must reach active rules only.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const app = require('../src/index');
const { createLiveRuleRegistry } = require('../src/engine/liveRuleRegistry');

const thresholdGraph = {
  id: 'live-temperature-rule',
  nodes: [
    { id: 'source', type: 'source', config: { field: 'temperature' } },
    { id: 'filter', type: 'filter', config: { field: 'temperature', minimum: 80 } },
    { id: 'action', type: 'action', config: { field: 'temperature', threshold: 85 } },
  ],
  edges: [
    { source: 'source', target: 'filter' },
    { source: 'filter', target: 'action' },
  ],
};

test('active rule graphs evaluate incoming telemetry and stop when deactivated', async () => {
  const dispatchedAlerts = [];
  const publishedAlerts = [];
  const registry = createLiveRuleRegistry({
    dispatchAlert: async (alert) => {
      dispatchedAlerts.push(alert);
      return { payload: { type: 'alert', ...alert } };
    },
    publishAlert: (alert) => publishedAlerts.push(alert),
    logger: { error: (message) => assert.fail(message) },
  });

  const { graphId, compiled } = registry.activateRuleGraph(thresholdGraph);
  assert.equal(graphId, thresholdGraph.id);
  assert.equal(compiled.nodeCount, 3);

  registry.processTelemetry({ sensorId: 'turbine-01', temperature: 82 });
  registry.processTelemetry({ sensorId: 'turbine-01', temperature: 90 });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(dispatchedAlerts.length, 1);
  assert.equal(dispatchedAlerts[0].telemetry.temperature, 90);
  assert.equal(publishedAlerts.length, 1);

  assert.equal(registry.deactivateRuleGraph(graphId), true);
  registry.processTelemetry({ sensorId: 'turbine-01', temperature: 95 });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(dispatchedAlerts.length, 1);
  assert.equal(registry.deactivateRuleGraph(graphId), false);
});

test('rejects duplicate active ids and empty graphs', () => {
  const registry = createLiveRuleRegistry();
  registry.activateRuleGraph(thresholdGraph);

  assert.throws(() => registry.activateRuleGraph(thresholdGraph), /already active/);
  assert.throws(() => registry.activateRuleGraph({ nodes: [], edges: [] }), /empty rule graph/);

  registry.deactivateRuleGraph(thresholdGraph.id);
});

test('activates and stops a live graph through the graphs API', async () => {
  const server = app.listen(0);
  try {
    await new Promise((resolve) => server.once('listening', resolve));
    const { port } = server.address();
    const request = (method, path, body) => new Promise((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: { 'Content-Type': 'application/json' },
      }, (res) => {
        let responseBody = '';
        res.on('data', (chunk) => { responseBody += chunk; });
        res.on('end', () => resolve({
          statusCode: res.statusCode,
          body: JSON.parse(responseBody),
        }));
      });

      req.on('error', reject);
      req.end(body === undefined ? undefined : JSON.stringify(body));
    });

    const activation = await request('POST', '/api/graphs/activate', thresholdGraph);
    assert.equal(activation.statusCode, 201);
    assert.equal(activation.body.graphId, thresholdGraph.id);

    const deactivation = await request(
      'DELETE',
      `/api/graphs/activate/${encodeURIComponent(activation.body.graphId)}`
    );
    assert.equal(deactivation.statusCode, 200);
    assert.equal(deactivation.body.graphId, thresholdGraph.id);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
});
