# NexusFlow Telemetry Simulator & Load Testing Suite

Maintained by **Abhishek** (Dashboard, Simulator & QA Engineer).

## Overview
This module simulates high-frequency industrial IoT sensors on the factory floor (turbines, boilers, coolant pumps, conveyors) and streams mock telemetry with configurable anomaly conditions to the Express ingestion endpoints.

## Features
- **Multi-Sensor Simulation:** Emits telemetry for multiple named machines with unique baselines.
- **Dynamic Anomaly Injection:** Configurable percentage chance to spike metrics (temp > 88°C, vibration > 5.5mm/s).
- **Ingestion Audit Load Tester:** Generates up to 5,000 writes/second in batched HTTP payloads to validate the MongoDB Time-Series ingestion performance for the Mid-Project Review.

## Usage

### Kaggle dataset replay (continuous)
```bash
npm run dataset

# Replay faster
SIM_INTERVAL_MS=500 npm run dataset

# Replay the existing random generator
npm start
```

### 1. Run Telemetry Generator (Normal Mode)
```bash
# Default (1000ms interval, 4 sensors)
npm start

# Run with custom interval (e.g. 500ms)
node simulator.js 500

# Custom configuration via environment variables
SIM_INTERVAL_MS=300 ANOMALY_CHANCE=0.25 npm start
```

### 2. Run High-Throughput Load Test (5,000 writes/sec Audit)
```bash
npm run load-test

# Custom load test duration and RPS
TARGET_RPS=5000 LOAD_DURATION_SEC=15 npm run load-test
```
