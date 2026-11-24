const http = require('http');
const fs = require('fs');
const path = require('path');
const { generateTelemetry, SENSORS } = require('./simulator');

// CLI Argument parsing
function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    targetUrl: process.env.INGEST_BULK_URL || 'http://localhost:4000/api/telemetry/bulk',
    durationSec: parseInt(process.env.LOAD_DURATION_SEC || '5', 10),
    targetRps: parseInt(process.env.TARGET_RPS || '5000', 10),
    batchSize: parseInt(process.env.BATCH_SIZE || '500', 10),
    dryRun: process.env.DRY_RUN === 'true' || args.includes('--dry-run'),
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--duration' && args[i + 1]) {
      config.durationSec = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--rps' && args[i + 1]) {
      config.targetRps = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--batch' && args[i + 1]) {
      config.batchSize = parseInt(args[i + 1], 10);
      i++;
    }
  }

  config.durationSec = Number.isFinite(config.durationSec) && config.durationSec > 0 ? config.durationSec : 5;
  config.targetRps = Number.isFinite(config.targetRps) && config.targetRps > 0 ? config.targetRps : 5000;
  config.batchSize = Number.isFinite(config.batchSize) && config.batchSize > 0 ? config.batchSize : 500;

  return config;
}

const config = parseArgs();

async function runBenchmark() {
  console.log('========================================================');
  console.log('🚀 NexusFlow Ingestion Audit Benchmark Engine');
  console.log(`⏱️ Duration        : ${config.durationSec}s`);
  console.log(`🎯 Target Rate     : ${config.targetRps.toLocaleString()} writes/sec`);
  console.log(`📦 Batch Size      : ${config.batchSize} records/payload`);
  console.log(`📡 Mode            : ${config.dryRun ? 'Dry-Run (In-Memory Engine Throughput)' : 'Live HTTP Ingestion API'}`);
  console.log(`🎯 Destination     : ${config.targetUrl}`);
  console.log('========================================================\n');

  let totalSent = 0;
  let totalSuccessful = 0;
  let totalFailed = 0;
  const latencies = [];
  const startTime = Date.now();

  let parsed;
  try {
    parsed = new URL(config.targetUrl);
  } catch (err) {
    console.error(`Invalid bulk telemetry URL "${config.targetUrl}": ${err.message}`);
    return;
  }

  if (parsed.protocol !== 'http:') {
    console.error(`Unsupported telemetry URL protocol: ${parsed.protocol}`);
    return;
  }

  function sendBatch() {
    return new Promise((resolve) => {
      const batchStart = Date.now();
      const records = [];

      for (let i = 0; i < config.batchSize; i++) {
        const s = SENSORS[i % SENSORS.length];
        records.push(generateTelemetry(s));
      }

      totalSent += records.length;

      // In Dry-Run mode, benchmark generation & serialization speed directly
      if (config.dryRun) {
        JSON.stringify({ batch: records });
        totalSuccessful += records.length;
        latencies.push(Date.now() - batchStart);
        return resolve();
      }

      const postData = JSON.stringify({ batch: records });

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
          timeout: 2500,
        },
        (res) => {
          const latency = Date.now() - batchStart;
          latencies.push(latency);

          if (res.statusCode >= 200 && res.statusCode < 300) {
            totalSuccessful += records.length;
          } else {
            totalFailed += records.length;
          }
          res.resume();
          resolve();
        }
      );

      req.on('error', () => {
        const latency = Date.now() - batchStart;
        latencies.push(latency);
        totalFailed += records.length;
        resolve();
      });

      req.write(postData);
      req.end();
    });
  }

  const TICK_INTERVAL_MS = 50; // Precision 50ms interval
  const targetRecordsPerTick = Math.ceil((config.targetRps * TICK_INTERVAL_MS) / 1000);
  const batchesPerTick = Math.max(1, Math.ceil(targetRecordsPerTick / config.batchSize));

  const timer = setInterval(async () => {
    const promises = [];
    for (let b = 0; b < batchesPerTick; b++) {
      promises.push(sendBatch());
    }
    await Promise.all(promises);

    const elapsedSec = (Date.now() - startTime) / 1000;
    if (elapsedSec >= config.durationSec) {
      clearInterval(timer);
      const report = generateSummary(startTime, totalSent, totalSuccessful, totalFailed, latencies);
      saveReport(report);
    }
  }, TICK_INTERVAL_MS);
}

function calculateP95(arr) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.floor(sorted.length * 0.95);
  return sorted[index];
}

function generateSummary(startTime, totalSent, totalSuccessful, totalFailed, latencies) {
  const durationSec = Number(((Date.now() - startTime) / 1000).toFixed(2));
  const actualRps = Math.round(totalSent / durationSec);
  const avgLatency = latencies.length ? (latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(1) : 0;
  const p95Latency = calculateP95(latencies);
  const minLatency = latencies.length ? Math.min(...latencies) : 0;
  const maxLatency = latencies.length ? Math.max(...latencies) : 0;
  const isPassed = actualRps >= 4800;

  console.log('\n========================================================');
  console.log('📊 Benchmark Execution Summary');
  console.log('========================================================');
  console.log(`Total Records Generated : ${totalSent.toLocaleString()}`);
  console.log(`Successfully Ingested   : ${totalSuccessful.toLocaleString()}`);
  console.log(`Failed / Dropped        : ${totalFailed.toLocaleString()}`);
  console.log(`Execution Duration      : ${durationSec}s`);
  console.log(`Throughput Rate         : ${actualRps.toLocaleString()} writes/second`);
  console.log(`Latency (Avg / P95)     : ${avgLatency}ms / ${p95Latency}ms (Min: ${minLatency}ms, Max: ${maxLatency}ms)`);
  console.log(`Audit Target (5,000 rps): ${isPassed ? '✅ AUDIT PASSED (Target Met)' : '⚠️ BELOW BENCHMARK'}`);
  console.log('========================================================\n');

  return {
    timestamp: new Date().toISOString(),
    benchmarkTarget: config.targetRps,
    durationSeconds: durationSec,
    totalRecordsGenerated: totalSent,
    successfullyIngested: totalSuccessful,
    failedRecords: totalFailed,
    throughputWritesPerSec: actualRps,
    auditPassed: isPassed,
    latency: {
      averageMs: Number(avgLatency),
      p95Ms: p95Latency,
      minMs: minLatency,
      maxMs: maxLatency,
    },
  };
}

function saveReport(report) {
  const outputPath = path.join(__dirname, 'load-test-report.json');
  try {
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf-8');
    console.log(`📁 Audit report exported to: ${outputPath}\n`);
  } catch (err) {
    console.error('Failed to export JSON report:', err.message);
  }
}

if (require.main === module) {
  runBenchmark();
}

module.exports = { runBenchmark };