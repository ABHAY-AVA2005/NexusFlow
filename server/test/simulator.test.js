const assert = require('assert');
const { describe, it } = require('node:test');
const { generateTelemetry, SENSORS } = require('../../simulator/simulator');

describe('Hardware Telemetry Simulator QA Tests', () => {
  it('should generate telemetry payload with required fields', () => {
    const s = SENSORS[0];
    const item = generateTelemetry(s);

    assert.ok(item.timestamp, 'Timestamp must be present');
    assert.strictEqual(item.sensorId, s.id, 'Sensor ID must match configuration');
    assert.ok(typeof item.temperature === 'number', 'Temperature must be a number');
    assert.ok(typeof item.pressure === 'number', 'Pressure must be a number');
    assert.ok(typeof item.vibration === 'number', 'Vibration must be a number');
    assert.ok(typeof item.rpm === 'number', 'RPM must be a number');
    assert.ok(typeof item.anomaly === 'boolean', 'Anomaly flag must be boolean');
  });

  it('should flag anomalies when temperature or vibration breach safety thresholds', () => {
    for (let i = 0; i < 20; i++) {
      const item = generateTelemetry(SENSORS[0]);
      if (item.temperature > 88 || item.vibration > 5.5) {
        assert.strictEqual(item.anomaly, true, 'Telemetry exceeding threshold must set anomaly to true');
        assert.strictEqual(item.status, 'CRITICAL', 'Status must be CRITICAL during anomaly');
      }
    }
  });

  it('should cover all registered factory floor sensors', () => {
    assert.strictEqual(SENSORS.length, 4, 'Must simulate at least 4 industrial sensors');
    const ids = SENSORS.map(s => s.id);
    assert.ok(ids.includes('turbine-01'), 'Must include turbine-01');
    assert.ok(ids.includes('boiler-04'), 'Must include boiler-04');
    assert.ok(ids.includes('pump-12'), 'Must include pump-12');
    assert.ok(ids.includes('conveyor-09'), 'Must include conveyor-09');
  });
});
