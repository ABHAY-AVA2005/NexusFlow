/**
 * NexusFlow Hardware Telemetry Simulator
 * Developed by Abhishek (Dashboard, Simulator & QA Engineer)
 * 
 * Simulates high-frequency industrial IoT sensors with configurable rates,
 * multi-sensor feeds, anomaly injection, and direct HTTP/WebSocket dispatch.
 */

const http = require('http');

function getPositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function getProbability(value, fallback) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : fallback;
}

const INTERVAL_MS = getPositiveInteger(process.env.SIM_INTERVAL_MS || process.argv[2] || '1000', 1000);
const TARGET_URL = process.env.INGEST_URL || 'http://localhost:4000/api/telemetry';
const ANOMALY_CHANCE = getProbability(process.env.ANOMALY_CHANCE || '0.15', 0.15); // 15% anomaly rate

const SENSORS = [
  { id: 'turbine-01', type: 'turbine', location: 'Section A - Power Gen', tempBase: 72, pressBase: 30, vibBase: 2.2 },
  { id: 'boiler-04', type: 'boiler', location: 'Section B - Thermal', tempBase: 80, pressBase: 45, vibBase: 1.8 },
  { id: 'pump-12', type: 'pump', location: 'Section C - Coolant', tempBase: 65, pressBase: 28, vibBase: 3.5 },
  { id: 'conveyor-09', type: 'conveyor', location: 'Section D - Assembly', tempBase: 55, pressBase: 15, vibBase: 4.1 },
];

function randomValue(min, max, decimals = 2) {
  const val = Math.random() * (max - min) + min;
  return Number(val.toFixed(decimals));
}

function generateTelemetry(sensor) {
  const isAnomaly = Math.random() < ANOMALY_CHANCE;

  // Normal vs Anomaly ranges
  const temperature = isAnomaly
    ? randomValue(88, 105) // Critical threshold breached
    : randomValue(sensor.tempBase - 5, sensor.tempBase + 5);

  const pressure = isAnomaly
    ? randomValue(sensor.pressBase + 15, sensor.pressBase + 30)
    : randomValue(sensor.pressBase - 3, sensor.pressBase + 3);

  const vibration = isAnomaly
    ? randomValue(5.5, 9.2) // High mechanical stress
    : randomValue(sensor.vibBase - 0.8, sensor.vibBase + 0.8);

  const rpm = isAnomaly
    ? randomValue(3200, 3800, 0)
    : randomValue(2800, 3050, 0);

  const hasBreachedThreshold = temperature > 88 || vibration > 5.5;

  return {
    timestamp: new Date().toISOString(),
    deviceId: sensor.id,
    deviceType: sensor.type,
    sensorId: sensor.id,
    sensor: sensor.id,
    location: sensor.location,
    temperature,
    pressure,
    vibration,
    rpm,
    anomaly: isAnomaly || hasBreachedThreshold,
    status: isAnomaly || hasBreachedThreshold ? 'CRITICAL' : (temperature > 82 ? 'WARNING' : 'NORMAL'),
  };
}

// Optional HTTP post to Express ingestion API
function postTelemetry(data) {
  let parsed;
  try {
    parsed = new URL(TARGET_URL);
  } catch (err) {
    console.error(`Invalid telemetry URL "${TARGET_URL}": ${err.message}`);
    return;
  }

  if (parsed.protocol !== 'http:') {
    console.error(`Unsupported telemetry URL protocol: ${parsed.protocol}`);
    return;
  }

  const postData = JSON.stringify(data);
  const req = http.request({
    hostname: parsed.hostname,
    port: parsed.port || 80,
    path: `${parsed.pathname}${parsed.search}`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
    },
    timeout: 1000,
  }, (res) => {
    if (res.statusCode < 200 || res.statusCode >= 300) {
      console.error(`Telemetry ingestion failed with HTTP ${res.statusCode}`);
    }
    res.resume();
  });

  req.on('timeout', () => {
    req.destroy(new Error('Telemetry request timed out.'));
  });
  req.on('error', (err) => {
    console.error(`Telemetry request failed: ${err.message}`);
  });

  req.write(postData);
  req.end();
}

function startSimulator() {
  console.log('=====================================================');
  console.log('⚡ NexusFlow Hardware Telemetry Simulator');
  console.log(`📡 Interval: ${INTERVAL_MS}ms | Sensors: ${SENSORS.length}`);
  console.log(`🎯 Target Ingestion Endpoint: ${TARGET_URL}`);
  console.log('=====================================================\n');

  let sensorIndex = 0;
  const timer = setInterval(() => {
    const sensor = SENSORS[sensorIndex % SENSORS.length];
    sensorIndex++;

    const telemetry = generateTelemetry(sensor);
    const logPrefix = telemetry.anomaly ? '⚠️ [ANOMALY]' : '✅ [NORMAL] ';
    
    console.log(
      `${logPrefix} [${telemetry.timestamp}] ${telemetry.sensorId} | Temp: ${telemetry.temperature}°C | Press: ${telemetry.pressure}PSI | Vib: ${telemetry.vibration}mm/s | Status: ${telemetry.status}`
    );

    postTelemetry(telemetry);
  }, INTERVAL_MS);

  const stop = (signal) => {
    clearInterval(timer);
    console.log(`\n🛑 Telemetry Simulator stopped gracefully (${signal}).`);
  };

  process.once('SIGINT', () => stop('SIGINT'));
  process.once('SIGTERM', () => stop('SIGTERM'));

  return timer;
}

if (require.main === module) {
  startSimulator();
}

module.exports = {
  generateTelemetry,
  SENSORS,
  postTelemetry,
  startSimulator,
};
