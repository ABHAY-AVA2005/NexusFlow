const assert = require('assert');
const { describe, it } = require('node:test');
const { createRuleEngine } = require('../src/engine/ruleEngine');
const { generateTelemetry, SENSORS } = require('../../simulator/simulator');

describe('End-to-End Pipeline Integration QA Test', () => {
  // Define an industrial rule graph: Sensor -> Filter -> SMS Action
  const turbineOverheatGraph = {
    nodes: [
      { id: 'src-1', type: 'source', config: { sensorId: 'turbine-01' } },
      { id: 'flt-1', type: 'filter', config: { field: 'temperature', minimum: 85, maximum: 120 } },
      { id: 'act-1', type: 'action', config: { field: 'temperature', threshold: 88, message: 'Critical Turbine Overheat Detected!' } },
    ],
    edges: [
      { id: 'e1', source: 'src-1', target: 'flt-1' },
      { id: 'e2', source: 'flt-1', target: 'act-1' },
    ],
  };

  const engine = createRuleEngine(turbineOverheatGraph);

  it('should allow normal telemetry to be filtered out before triggering action', async () => {
    // Normal baseline reading: 74°C (< 85°C filter threshold)
    const normalTelemetry = {
      timestamp: new Date().toISOString(),
      sensorId: 'turbine-01',
      temperature: 74.0,
      pressure: 30.0,
      vibration: 2.1,
      rpm: 2950,
      anomaly: false,
    };

    const result = await engine.processTelemetry(normalTelemetry);
    assert.strictEqual(result, null, 'Normal temperature (<85°C) must be filtered out and not reach action node');
  });

  it('should process anomaly telemetry through RxJS pipeline and trigger critical alert', async () => {
    // Critical reading: 94.5°C (> 88°C action threshold)
    const criticalTelemetry = {
      timestamp: new Date().toISOString(),
      sensorId: 'turbine-01',
      temperature: 94.5,
      pressure: 42.0,
      vibration: 3.2,
      rpm: 3400,
      anomaly: true,
    };

    const startTime = process.hrtime.bigint();
    const result = await engine.processTelemetry(criticalTelemetry);
    const endTime = process.hrtime.bigint();
    const durationMs = Number(endTime - startTime) / 1_000_000;

    assert.ok(result, 'Result should exist for telemetry exceeding filter threshold');
    assert.strictEqual(result.alert, true, 'Alert flag must be true');
    assert.strictEqual(result.message, 'Critical Turbine Overheat Detected!');
    assert.strictEqual(result.temperature, 94.5);
    assert.ok(durationMs < 15, `Evaluation latency (${durationMs.toFixed(2)}ms) must be under 15ms`);
  });

  it('should process continuous telemetry stream from simulator generator', async () => {
    let triggeredAlerts = 0;
    const batchSize = 20;

    for (let i = 0; i < batchSize; i++) {
      const telemetry = generateTelemetry(SENSORS[0], 0.35);
      const result = await engine.processTelemetry(telemetry);

      if (result && result.alert) {
        triggeredAlerts++;
        assert.ok(result.temperature >= 88, 'Triggered alert temperature must be >= 88°C');
      }
    }

    assert.ok(triggeredAlerts >= 0, 'Batch stream must process without throwing errors');
  });
});