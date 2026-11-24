/**
 * NexusFlow Hardware Telemetry Simulator
 * Developed by Abhishek (Dashboard, Simulator & QA Engineer)
 * 
 * Nov 17 Update: Added CLI argument parsing, preset operating profiles,
 * and custom sensor selection flags.
 */

const http = require('http');

// Predefined industrial operating profiles
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

// Parse command-line flags (--interval, --anomaly, --profile, --sensors)
function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    profile: 'normal',
    intervalMs: null,
    anomalyRate: null,
    selectedSensors: null,
    targetUrl: process.env.INGEST_URL || 'http://localhost:5000/api/telemetry',
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
  config.intervalMs = config.intervalMs || activeProfile.intervalMs;
  config.anomalyRate = config.anomalyRate !== null ? config.anomalyRate : activeProfile.anomalyRate;

  return config;
}

const config = parseArgs();

const ALL_SENSORS = [
  { id: 'turbine-01', location: 'Section A - Power Gen', tempBase: 72, pressBase: 30, vibBase: 2.2 },
  { id: 'boiler-04', location: 'Section B - Thermal', tempBase: 80, pressBase: 45, vibBase: 1.8 },
  { id: 'pump-12', location: 'Section C - Coolant', tempBase: 65, pressBase: 28, vibBase: 3.5 },
  { id: 'conveyor-09', location: 'Section D - Assembly', tempBase: 55, pressBase: 15, vibBase: 4.1 },
];

const ACTIVE_SENSORS = config.selectedSensors
  ? ALL_SENSORS.filter((s) => config.selectedSensors.includes(s.id))
  : ALL_SENSORS;

function randomValue(min, max, decimals = 2) {
  const val = Math.random() * (max - min) + min;
  return Number(val.toFixed(decimals));
}

function generateTelemetry(sensor, customAnomalyRate = config.anomalyRate) {
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

  return {
    timestamp: new Date().toISOString(),
    sensorId: sensor.id,
    sensor: sensor.id,
    location: sensor.location,
    temperature,
    pressure,
    vibration,
    rpm,
    anomaly: isAnomaly || temperature > 88 || vibration > 5.5,
    status: isAnomaly ? 'CRITICAL' : temperature > 82 ? 'WARNING' : 'NORMAL',
  };
}

function postTelemetry(data) {
  try {
    const parsed = new URL(config.targetUrl);
    const postData = JSON.stringify(data);

    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || 5000,
        path: parsed.pathname,
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
  console.log(`🎯 Sensors (${ACTIVE_SENSORS.length})    : ${ACTIVE_SENSORS.map((s) => s.id).join(', ')}`);
  console.log('=====================================================\n');

  let sensorIndex = 0;
  const timer = setInterval(() => {
    const sensor = ACTIVE_SENSORS[sensorIndex % ACTIVE_SENSORS.length];
    sensorIndex++;

    const telemetry = generateTelemetry(sensor);
    const logPrefix = telemetry.anomaly ? '⚠️ [ANOMALY]' : '✅ [NORMAL] ';

    console.log(
      `${logPrefix} [${telemetry.timestamp}] ${telemetry.sensorId} | Temp: ${telemetry.temperature}°C | Press: ${telemetry.pressure}PSI | Vib: ${telemetry.vibration}mm/s | Status: ${telemetry.status}`
    );

    postTelemetry(telemetry);
  }, config.intervalMs);

  process.on('SIGINT', () => {
    clearInterval(timer);
    console.log('\n🛑 Telemetry Simulator stopped gracefully.');
    process.exit(0);
  });
}

if (require.main === module) {
  startSimulator();
}

module.exports = {
  generateTelemetry,
  SENSORS: ALL_SENSORS,
  PROFILES,
  parseArgs,
  startSimulator,
};