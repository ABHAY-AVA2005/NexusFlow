/**
 * @module simulator/simulator
 * @description Creates realistic factory sensor readings and sends each reading to the
 * backend telemetry API. This is a mock source used while the real industrial hardware
 * is not connected.
 */

const http = require('http');

// A profile is a preset collection of settings. "Stress" sends more anomalies, while
// "normal" sends mostly healthy readings. Choosing a profile avoids long CLI commands.
const PROFILES = {
  normal: {
    anomalyRate: 0.05,
    intervalMs: 1200,
    description: 'Standard baseline operations with low anomaly occurrence',
  },
  stress: {
    anomalyRate: 0.40,
    intervalMs: 600,
    description: 'High-stress stress test with frequent thermal & vibration spikes',
  },
  boiler_focus: {
    anomalyRate: 0.20,
    intervalMs: 800,
    description: 'Thermal inspection focused on boiler heating anomalies',
  },
};

// Command-line settings override environment values and profile defaults. For example,
// --interval 500 sends a reading every 500 milliseconds.
function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    profile: 'normal',
    intervalMs: null,
    anomalyRate: null,
    selectedSensors: null,
    targetUrl: process.env.INGEST_URL || 'http://localhost:4000/api/telemetry',
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--profile' && args[i + 1]) {
      config.profile = args[i + 1].toLowerCase();
      i++;
    } else if (args[i] === '--interval' && args[i + 1]) {
      config.intervalMs = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--anomaly' && args[i + 1]) {
      config.anomalyRate = parseFloat(args[i + 1]);
      i++;
    } else if (args[i] === '--sensors' && args[i + 1]) {
      config.selectedSensors = args[i + 1].split(',').map((s) => s.trim());
      i++;
    }
  }

  const activeProfile = PROFILES[config.profile] || PROFILES.normal;
  config.intervalMs = Number.isFinite(config.intervalMs) && config.intervalMs > 0
    ? config.intervalMs
    : activeProfile.intervalMs;
  config.anomalyRate = config.anomalyRate !== null
    ? Math.min(1, Math.max(0, config.anomalyRate))
    : activeProfile.anomalyRate;

  return config;
}

const config = parseArgs();

const ALL_SENSORS = [
  { id: 'turbine-01', type: 'turbine', location: 'Section A - Power Gen', tempBase: 72, pressBase: 30, vibBase: 2.2 },
  { id: 'boiler-04', type: 'boiler', location: 'Section B - Thermal', tempBase: 80, pressBase: 45, vibBase: 1.8 },
  { id: 'pump-12', type: 'pump', location: 'Section C - Coolant', tempBase: 65, pressBase: 28, vibBase: 3.5 },
  { id: 'conveyor-09', type: 'conveyor', location: 'Section D - Assembly', tempBase: 55, pressBase: 15, vibBase: 4.1 },
];

const ACTIVE_SENSORS = config.selectedSensors
  ? ALL_SENSORS.filter((s) => config.selectedSensors.includes(s.id))
  : ALL_SENSORS;
const EFFECTIVE_SENSORS = ACTIVE_SENSORS.length > 0 ? ACTIVE_SENSORS : ALL_SENSORS;

function randomValue(min, max, decimals = 2) {
  // Math.random() starts in the range 0 to 1. Re-scaling it keeps generated values
  // within the sensor's realistic operating range.
  const val = Math.random() * (max - min) + min;
  return Number(val.toFixed(decimals));
}

function generateTelemetry(sensor, customAnomalyRate = config.anomalyRate) {
  // Decide once whether this reading is normal or abnormal. All abnormal measurements
  // are generated around unsafe ranges so the dashboard and alert rules can be tested.
  const isAnomaly = Math.random() < customAnomalyRate;

  const temperature = isAnomaly
    ? randomValue(88, 105)
    : randomValue(sensor.tempBase - 5, sensor.tempBase + 5);

  const pressure = isAnomaly
    ? randomValue(sensor.pressBase + 15, sensor.pressBase + 30)
    : randomValue(sensor.pressBase - 3, sensor.pressBase + 3);

  const vibration = isAnomaly
    ? randomValue(5.5, 9.2)
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
    status: isAnomaly || hasBreachedThreshold ? 'CRITICAL' : temperature > 82 ? 'WARNING' : 'NORMAL',
  };
}

function postTelemetry(data) {
  try {
    // URL parsing separates the host, port, and API path from the configured endpoint.
    const parsed = new URL(config.targetUrl);
    if (parsed.protocol !== 'http:') {
      console.error(`Unsupported telemetry URL protocol: ${parsed.protocol}`);
      return;
    }
    const postData = JSON.stringify(data);

    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || 80,
        path: `${parsed.pathname}${parsed.search}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        },
        timeout: 1000,
      },
      () => {}
    );

    req.on('error', () => {});
    req.write(postData);
    req.end();
  } catch {}
}

function startSimulator() {
  console.log('=====================================================');
  console.log('⚡ NexusFlow Hardware Telemetry Simulator');
  console.log(`📋 Active Profile : ${config.profile.toUpperCase()}`);
  console.log(`📡 Interval       : ${config.intervalMs}ms`);
  console.log(`⚠️ Anomaly Rate   : ${(config.anomalyRate * 100).toFixed(0)}%`);
  console.log(`🎯 Sensors (${EFFECTIVE_SENSORS.length})    : ${EFFECTIVE_SENSORS.map((s) => s.id).join(', ')}`);
  console.log('=====================================================\n');

  let sensorIndex = 0;
  const timer = setInterval(() => {
    const sensor = EFFECTIVE_SENSORS[sensorIndex % EFFECTIVE_SENSORS.length];
    sensorIndex++;

    const telemetry = generateTelemetry(sensor);
    const logPrefix = telemetry.anomaly ? '⚠️ [ANOMALY]' : '✅ [NORMAL] ';

    console.log(
      `${logPrefix} [${telemetry.timestamp}] ${telemetry.sensorId} | Temp: ${telemetry.temperature}°C | Press: ${telemetry.pressure}PSI | Vib: ${telemetry.vibration}mm/s | Status: ${telemetry.status}`
    );

    postTelemetry(telemetry);
  }, config.intervalMs);

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
  SENSORS: ALL_SENSORS,
  PROFILES,
  parseArgs,
  postTelemetry,
  startSimulator,
};