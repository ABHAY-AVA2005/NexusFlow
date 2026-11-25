/**
 * @module server/test/simulator
 * @description Verifies that fake sensor readings contain the expected fields and remain
 * within realistic ranges, while also confirming that abnormal readings trigger alerts.
 */
const assert = require('assert');
const { describe, it } = require('node:test');
const { generateTelemetry, SENSORS, PROFILES } = require('../../simulator/simulator');

describe('Hardware Telemetry Simulator QA Test Suite', () => {
  it('should generate telemetry payload with required fields and valid ISO timestamp', () => {
    const s = SENSORS[0];
    const item = generateTelemetry(s);

    assert.ok(item.timestamp, 'Timestamp must be present');
    assert.ok(!isNaN(Date.parse(item.timestamp)), 'Timestamp must be a valid ISO 8601 string');
    assert.strictEqual(item.sensorId, s.id, 'Sensor ID must match configuration');
    assert.ok(typeof item.temperature === 'number', 'Temperature must be numeric');
    assert.ok(typeof item.pressure === 'number', 'Pressure must be numeric');
    assert.ok(typeof item.vibration === 'number', 'Vibration must be numeric');
    assert.ok(typeof item.rpm === 'number', 'RPM must be numeric');
    assert.ok(typeof item.anomaly === 'boolean', 'Anomaly flag must be boolean');
    assert.ok(['NORMAL', 'WARNING', 'CRITICAL'].includes(item.status), 'Status must be a recognized tier');
  });

  it('should flag anomalies when temperature or vibration breach safety thresholds', () => {
    for (let i = 0; i < 30; i++) {
      const item = generateTelemetry(SENSORS[0], 0.5); // Force 50% anomaly chance
      if (item.temperature > 88 || item.vibration > 5.5) {
        assert.strictEqual(item.anomaly, true, 'Telemetry exceeding threshold must set anomaly to true');
        assert.strictEqual(item.status, 'CRITICAL', 'Status must be CRITICAL during anomaly');
      }
    }
  });

  it('should cover all registered factory floor sensors', () => {
    assert.strictEqual(SENSORS.length, 4, 'Must simulate 4 industrial machines');
    const ids = SENSORS.map((s) => s.id);
    assert.ok(ids.includes('turbine-01'), 'Must include turbine-01');
    assert.ok(ids.includes('boiler-04'), 'Must include boiler-04');
    assert.ok(ids.includes('pump-12'), 'Must include pump-12');
    assert.ok(ids.includes('conveyor-09'), 'Must include conveyor-09');
  });

  it('should validate operating profile parameters (normal, stress, boiler_focus)', () => {
    assert.ok(PROFILES.normal, 'Must define normal profile');
    assert.ok(PROFILES.stress, 'Must define stress profile');
    assert.ok(PROFILES.boiler_focus, 'Must define boiler_focus profile');

    assert.ok(PROFILES.stress.anomalyRate > PROFILES.normal.anomalyRate, 'Stress profile must have higher anomaly rate');
    assert.ok(PROFILES.stress.intervalMs <= PROFILES.normal.intervalMs, 'Stress profile must emit at higher or equal frequency');
  });

  it('should ensure metrics remain within realistic industrial boundaries', () => {
    SENSORS.forEach((sensor) => {
      for (let i = 0; i < 20; i++) {
        const item = generateTelemetry(sensor);
        assert.ok(item.temperature >= 40 && item.temperature <= 120, 'Temperature must be between 40°C and 120°C');
        assert.ok(item.pressure >= 5 && item.pressure <= 90, 'Pressure must remain in positive range (5-90 PSI)');
        assert.ok(item.vibration >= 0.5 && item.vibration <= 12.0, 'Vibration must be >= 0.5 mm/s');
        assert.ok(item.rpm >= 0, 'RPM cannot be negative');
      }
    });
  });

  it('should verify statistical anomaly generation under zero vs high anomaly rates', () => {
    // 0% anomaly rate test
    for (let i = 0; i < 25; i++) {
      const item = generateTelemetry(SENSORS[0], 0.0);
      assert.strictEqual(item.anomaly, false, 'Anomaly must never trigger when anomaly rate is 0');
    }

    // 100% anomaly rate test
    for (let i = 0; i < 25; i++) {
      const item = generateTelemetry(SENSORS[0], 1.0);
      assert.strictEqual(item.anomaly, true, 'Anomaly must always trigger when anomaly rate is 1.0');
      assert.strictEqual(item.status, 'CRITICAL', 'Status must always be CRITICAL when anomaly rate is 1.0');
    }
  });

  it('should assign correct location metadata to each telemetry record', () => {
    SENSORS.forEach((sensor) => {
      const item = generateTelemetry(sensor);
      assert.strictEqual(item.location, sensor.location, 'Location metadata must match sensor registry');
    });
  });
});