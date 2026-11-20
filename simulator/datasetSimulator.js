const fs = require('fs');
const http = require('http');
const path = require('path');

const DATASET_PATH = process.env.DATASET_CSV ||
  path.join(__dirname, 'data', 'Industrial_IoT_Predictive_Maintenance_250k.csv');
const INTERVAL_MS = parseInt(process.env.SIM_INTERVAL_MS || process.argv[2] || '1000', 10);
const TARGET_URL = process.env.INGEST_URL || 'http://localhost:4000/api/telemetry';

function parseCsvLine(line) {
  const values = [];
  let value = '';
  let quoted = false;

  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index++;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      values.push(value);
      value = '';
    } else {
      value += char;
    }
  }
  values.push(value);
  return values;
}

function loadDataset(datasetPath = DATASET_PATH) {
  const content = fs.readFileSync(datasetPath, 'utf8');
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) {
    throw new Error(`Dataset is empty or missing records: ${datasetPath}`);
  }

  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return headers.reduce((record, header, index) => {
      record[header] = values[index] || '';
      return record;
    }, {});
  });
}

function mapDatasetRow(row) {
  const failureFlag = Number(row.Failure_Flag) === 1;
  const timestamp = row.Timestamp ? new Date(row.Timestamp).toISOString() : new Date().toISOString();

  return {
    timestamp,
    deviceId: row.Machine_ID,
    deviceType: row.Machine_Type,
    sensorId: row.Machine_ID,
    sensor: row.Machine_ID,
    location: `Factory ${row.Factory_ID}`,
    temperature: Number(row.Temperature_C),
    pressure: Number(row.Pressure_bar),
    vibration: Number(row.Vibration_mm_s),
    rpm: Number(row.RPM),
    anomaly: failureFlag,
    status: failureFlag ? 'CRITICAL' : 'NORMAL',
    failureType: row.Failure_Type,
    predictiveRiskScore: Number(row.Predictive_Risk_Score),
  };
}

function postTelemetry(data) {
  const parsed = new URL(TARGET_URL);
  const body = JSON.stringify(data);
  const request = http.request({
    hostname: parsed.hostname,
    port: parsed.port || 80,
    path: `${parsed.pathname}${parsed.search}`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    },
    timeout: 1000,
  }, (response) => {
    if (response.statusCode < 200 || response.statusCode >= 300) {
      console.error(`Telemetry ingestion failed with HTTP ${response.statusCode}`);
    }
    response.resume();
  });

  request.on('timeout', () => request.destroy(new Error('Telemetry request timed out')));
  request.on('error', (error) => console.error(`Telemetry request failed: ${error.message}`));
  request.write(body);
  request.end();
}

function startDatasetSimulator() {
  const rows = loadDataset();
  let index = 0;

  console.log('=====================================================');
  console.log('NexusFlow Kaggle Dataset Telemetry Simulator');
  console.log(`Interval: ${INTERVAL_MS}ms | Records: ${rows.length}`);
  console.log(`Target Ingestion Endpoint: ${TARGET_URL}`);
  console.log('=====================================================\n');

  const timer = setInterval(() => {
    const telemetry = mapDatasetRow(rows[index % rows.length]);
    index++;
    console.log(
      `${telemetry.anomaly ? '[FAILURE]' : '[NORMAL ]'} ${telemetry.timestamp} | ${telemetry.sensorId} | ` +
      `Temp: ${telemetry.temperature}C | Pressure: ${telemetry.pressure}bar | ` +
      `Vibration: ${telemetry.vibration}mm/s | RPM: ${telemetry.rpm}`
    );
    postTelemetry(telemetry);
  }, INTERVAL_MS);

  process.on('SIGINT', () => {
    clearInterval(timer);
    console.log('\nDataset telemetry simulator stopped gracefully.');
    process.exit(0);
  });
}

if (require.main === module) {
  startDatasetSimulator();
}

module.exports = { loadDataset, mapDatasetRow, parseCsvLine, startDatasetSimulator };
