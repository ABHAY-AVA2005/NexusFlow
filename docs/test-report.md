# NexusFlow QA & Benchmark Report

**Author:** Abhishek (Dashboard, Simulator & QA Engineer)  
**Branch:** `abhishek-audio`  
**Date:** 2026-11-16  

---

## 1. Quality Assurance Test Plan

The QA test suite verifies the end-to-end data pipeline from mock sensor generation through rule execution and live visualization:

1. **Telemetry Generation & Schema Compliance:**
   - Multi-sensor support (`turbine-01`, `boiler-04`, `pump-12`, `conveyor-09`).
   - Valid numeric data ranges for temperature, pressure, vibration, and RPM.
   - Anomaly detection triggers when safety thresholds are breached (`temperature > 88°C`, `vibration > 5.5mm/s`).

2. **Ingestion Audit Benchmark (Mid Review Target: 5,000 writes/sec):**
   - Batched HTTP POST payloads to `/api/telemetry/bulk`.
   - Batch size: 250 records/request at 20 req/s.
   - Measures latency, successful write throughput, and drop rate.

3. **Frontend Dashboard Responsiveness:**
   - Real-time sliding window (latest 25 metrics).
   - Recharts streaming without UI lag or memory leak.
   - WebSocket reconnection and simulated fallback mode.

---

## 2. Test Execution Results

### Unit Tests (`server/test/simulator.test.js`)
```text
▶ Hardware Telemetry Simulator QA Tests
  ✔ should generate telemetry payload with required fields (10.3ms)
  ✔ should flag anomalies when temperature or vibration breach safety thresholds (3.9ms)
  ✔ should cover all registered factory floor sensors (0.6ms)
✔ Hardware Telemetry Simulator QA Tests (18.6ms)
ℹ tests 3 | pass 3 | fail 0
```

---

## 3. Load Testing Specification (`simulator/loadTest.js`)
- **Target Ingestion Rate:** 5,000 writes/sec
- **Batch Size:** 250 items per payload
- **Script Command:** `npm run load-test` (in `simulator/`)
