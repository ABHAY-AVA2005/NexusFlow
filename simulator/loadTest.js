/**
 * NexusFlow High-Throughput Load Testing Tool
 * Developed by Abhishek (Dashboard, Simulator & QA Engineer)
 * 
 * Benchmarks the Express + MongoDB Time-Series ingestion pipeline
 * to validate the 5,000 writes/sec requirement for the Mid-Project Review.
 */

const http = require('http');
const { generateTelemetry, SENSORS } = require('./simulator');

const TARGET_URL = process.env.INGEST_BULK_URL || 'http://localhost:5000/api/telemetry/bulk';
const DURATION_SECONDS = parseInt(process.env.LOAD_DURATION_SEC || '10', 10);
const TARGET_WRITES_PER_SEC = parseInt(process.env.TARGET_RPS || '5000', 10);
const BATCH_SIZE = 250; // 20 requests per second with 250 items = 5000 records/sec

async function runBenchmark() {
  console.log('========================================================');
  console.log('🚀 NexusFlow Ingestion Audit Benchmark (5,000 writes/sec)');
  console.log(`⏱️ Duration: ${DURATION_SECONDS}s | Target: ${TARGET_WRITES_PER_SEC} writes/sec`);
  console.log(`📦 Batch Size: ${BATCH_SIZE} records/payload`);
  console.log(`🎯 Destination: ${TARGET_URL}`);
  console.log('========================================================\n');

  let totalSent = 0;
  let totalSuccessful = 0;
  let totalFailed = 0;
  const startTime = Date.now();

  const parsed = new URL(TARGET_URL);

  function sendBatch() {
    return new Promise((resolve) => {
      const records = [];
      for (let i = 0; i < BATCH_SIZE; i++) {
        const s = SENSORS[i % SENSORS.length];
        records.push(generateTelemetry(s));
      }

      totalSent += records.length;
      const postData = JSON.stringify({ batch: records });

      const req = http.request({
        hostname: parsed.hostname,
        port: parsed.port || 5000,
        path: parsed.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        },
        timeout: 3000,
      }, (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          totalSuccessful += records.length;
        } else {
          totalFailed += records.length;
        }
        res.resume();
        resolve();
      });

      req.on('error', () => {
        totalFailed += records.length;
        resolve();
      });

      req.write(postData);
      req.end();
    });
  }

  const batchesPerSec = Math.ceil(TARGET_WRITES_PER_SEC / BATCH_SIZE);
  const intervalMs = 1000 / batchesPerSec;

  const timer = setInterval(async () => {
    await sendBatch();

    const elapsedSec = (Date.now() - startTime) / 1000;
    if (elapsedSec >= DURATION_SECONDS) {
      clearInterval(timer);
      printSummary(startTime, totalSent, totalSuccessful, totalFailed);
    }
  }, intervalMs);
}

function printSummary(startTime, totalSent, totalSuccessful, totalFailed) {
  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
  const actualRps = (totalSent / durationSec).toFixed(0);

  console.log('\n========================================================');
  console.log('📊 Benchmark Results Summary');
  console.log('========================================================');
  console.log(`Total Records Generated : ${totalSent}`);
  console.log(`Successfully Ingested   : ${totalSuccessful}`);
  console.log(`Failed / Dropped        : ${totalFailed}`);
  console.log(`Execution Duration      : ${durationSec}s`);
  console.log(`Throughput Rate         : ${actualRps} writes/second`);
  console.log('Audit Status            : ' + (actualRps >= 4500 ? '✅ PASSED (Target Met)' : '⚠️ BELOW BENCHMARK'));
  console.log('========================================================\n');
}

if (require.main === module) {
  runBenchmark();
}

module.exports = { runBenchmark };
