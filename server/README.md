# NexusFlow — Backend Server

High-speed IoT Telemetry and Analytics Engine.

The NexusFlow backend is a **Node.js** service built with **Express 5**, **Socket.IO 4**, and **Mongoose 9** on top of a **MongoDB 7+ time-series** collection. It provides both a REST API for telemetry ingestion and a WebSocket layer for real-time telemetry broadcasting to connected dashboard clients.

---

## Table of Contents

1. [Backend Overview & Architecture](#1-backend-overview--architecture)
2. [Backend Folder Structure](#2-backend-folder-structure)
3. [Technology Stack](#3-technology-stack)
4. [Installation Instructions](#4-installation-instructions)
5. [Environment Variable Configuration](#5-environment-variable-configuration)
6. [MongoDB Setup](#6-mongodb-setup)
7. [How to Start the Server](#7-how-to-start-the-server)
8. [REST API Documentation](#8-rest-api-documentation)
9. [Example Telemetry JSON Payload](#9-example-telemetry-json-payload)
10. [Socket.IO Connection Instructions](#10-socketio-connection-instructions)
11. [Socket.IO Event Names & Payload Formats](#11-socketio-event-names--payload-formats)
12. [Integration Testing Instructions](#12-integration-testing-instructions)
13. [Expected Test Output](#13-expected-test-output)
14. [Error Handling](#14-error-handling)
15. [RxJS Integration Readiness Proposal](#15-rxjs-integration-readiness-proposal)

---

## 1. Backend Overview & Architecture

NexusFlow backend is designed with a layered architecture enforcing clean separation of concerns, transport-agnostic validation, and data integrity across both synchronous REST and asynchronous WebSocket interfaces.

```
                        ┌──────────────────────────────────────────────────┐
                        │              NexusFlow Backend                   │
                        │                                                  │
  IoT Devices /         │   ┌──────────────┐    ┌────────────────────┐     │
  Simulators ──REST──▶  │   │ Express App  │    │  Socket.IO Server  │     │
                        │   │              │    │                    │     │
  Dashboard   ──WS───▶  │   │  Routes      │    │  Event Handlers    │     │
  Clients               │   │    ↓         │    │    ↓               │     │
                        │   │  Middleware  │    │  Shared Validator  │     │
                        │   │  (validate)  │    │  (same function)   │     │
                        │   │    ↓         │    │    ↓               │     │
                        │   │  Controller  │    │  Persist to Mongo  │     │
                        │   │    ↓         │    │    ↓               │     │
                        │   │  Mongoose    │◀──▶│  Broadcast to all  │     │
                        │   │  (persist)   │    │  connected clients │     │
                        │   └──────────────┘    └────────────────────┘     │
                        │            ↓                    ↓                │
                        │   ┌──────────────────────────────────────────┐   │
                        │   │  MongoDB Time-Series Collection          │   │
                        │   │  (telemetry)                             │   │
                        │   └──────────────────────────────────────────┘   │
                        └──────────────────────────────────────────────────┘
```

### Data Flow — REST Path
1. Client sends `POST /api/telemetry` with a JSON body.
2. `validateTelemetry` middleware invokes the pure validator `validateTelemetryData()`.
3. If validation fails: returns HTTP `400 Bad Request` with structured error array.
4. If valid: attaches sanitized object to `req.sanitizedTelemetry`.
5. `telemetry.controller.js` creates and saves the record in MongoDB via `Telemetry.create()`.
6. Returns HTTP `201 Created` with the saved document representation.

### Data Flow — WebSocket Path
1. Client emits `telemetry:send` event with telemetry JSON.
2. `socketManager.js` invokes the shared `validateTelemetryData()`.
3. If validation fails: emits `telemetry:error` back to sender and acknowledges callback with error status.
4. If valid: persists reading to MongoDB via `Telemetry.create()`.
5. On successful persistence: broadcasts `telemetry:received` to **all** connected clients via `io.emit()`.
6. Sender acknowledgment callback resolves with success status and saved document.
7. If persistence fails: emits `telemetry:error` back to sender; broadcast is aborted to protect data integrity.

### Key Architectural Decisions
- **Single Source of Validation Truth**: Pure validator function (`src/validators/telemetryValidator.js`) is reused across HTTP middleware and WebSocket listeners.
- **Unified HTTP & WebSocket Server**: Express and Socket.IO attach to a single `http.Server` instance, sharing the network port and lifecycle.
- **MongoDB Native Time-Series**: Leverages MongoDB 7+ time-series engine with `autoCreate: false` and `autoIndex: false` in Mongoose schema to preserve native collection parameters.
- **Graceful Shutdown**: Intercepts `SIGINT` and `SIGTERM` signals to cleanly drain Socket.IO connections before shutting down the HTTP listener.

---

## 2. Backend Folder Structure

```
server/
├── server.js                          # Application entry point: Express setup, HTTP server & Socket.IO initialization
├── package.json                       # Project metadata, dependencies, scripts
├── package-lock.json                  # Locked dependency graph
├── .env                               # Local environment variables (git-ignored)
├── .env.example                       # Environment variable template
├── .gitignore                         # Git exclusion rules
│
├── src/
│   ├── config/
│   │   ├── env.js                     # Loads environment variables into a centralized config object
│   │   └── db.js                      # Mongoose database connection management
│   │
│   ├── routes/
│   │   ├── health.routes.js           # Express router for GET /health
│   │   └── telemetry.routes.js        # Express router for POST /api/telemetry
│   │
│   ├── controllers/
│   │   ├── health.controller.js       # Health check controller logic
│   │   └── telemetry.controller.js    # Telemetry ingestion controller logic
│   │
│   ├── middleware/
│   │   ├── errorHandler.js            # 404 resource handler & centralized error handler
│   │   └── validateTelemetry.js       # Express middleware wrapping the shared validator
│   │
│   ├── models/
│   │   └── telemetry.model.js         # Mongoose schema for MongoDB Time-Series collection
│   │
│   ├── services/
│   └── socketManager.js               # Socket.IO connection handling & real-time telemetry processing
│   │
│   └── validators/
│       └── telemetryValidator.js      # Pure function validator for telemetry payloads
│
└── tests/
    ├── .gitkeep                       # Keeps tests folder tracked
    └── socket.test.js                 # Integration test suite for Socket.IO, multi-client broadcast & MongoDB persistence
```

---

## 3. Technology Stack

| Component | Technology | Version | Description |
|-----------|------------|---------|-------------|
| **Runtime** | Node.js | `>= 18.0.0` | Server JavaScript execution environment |
| **Framework** | Express.js | `^5.3.0` | Fast, minimalist web framework for REST API |
| **Real-Time Engine** | Socket.IO | `^4.8.4` | Bidirectional, event-based communication |
| **Database** | MongoDB | `>= 7.0` | Document database with native Time-Series support |
| **ODM** | Mongoose | `^9.12.1` | Object data modeling for MongoDB |
| **CORS Middleware** | cors | `^2.8.6` | Cross-Origin Resource Sharing control |
| **Configuration** | dotenv | `^18.0.10` | Loads environment variables from `.env` |
| **Testing** | socket.io-client | `^4.8.4` | WebSocket client for integration testing |
| **Development** | nodemon | `^3.1.14` | File watcher for automated server restart |

---

## 4. Installation Instructions

### Prerequisites
- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher
- **MongoDB**: v7.0 or higher running locally or accessible via URI

### Setup Steps
```bash
# 1. Navigate to the server directory
cd D:\NexusFlow\server

# 2. Install all dependencies
npm install

# 3. Create your local environment configuration
cp .env.example .env
```

---

## 5. Environment Variable Configuration

All environment variables are loaded in `src/config/env.js`.

| Variable | Type | Default Value | Description |
|----------|------|---------------|-------------|
| `PORT` | Number | `5000` | Port on which the HTTP and Socket.IO server listens |
| `NODE_ENV` | String | `development` | Runtime environment (`development`, `production`, `test`) |
| `CLIENT_URL` | String | `http://localhost:3000` | Allowed client origin for CORS headers |
| `MONGODB_URI` | String | `mongodb://localhost:27017/nexusflow` | Connection string for MongoDB database |

> **Security Note**: Never commit `.env` containing sensitive credentials to Git. `.env` is listed in `.gitignore`.

---

## 6. MongoDB Setup

NexusFlow utilizes MongoDB's native **Time-Series collection** feature for efficient telemetry ingestion, storage, and aggregation.

### 1. Start MongoDB Service
```bash
# Via mongod service directly
mongod --dbpath /data/db

# Or using Docker
docker run -d --name nexusflow-mongo -p 27017:27017 mongo:7
```

### 2. Initialize the Time-Series Collection
Before running the backend, create the `telemetry` time-series collection using `mongosh`:

```javascript
// Connect to MongoDB shell
mongosh

// Switch to nexusflow database
use nexusflow

// Create time-series collection
db.createCollection("telemetry", {
  timeseries: {
    timeField: "timestamp",
    metaField: "metadata",
    granularity: "seconds"
  }
})
```

### 3. Verify Collection Creation
```javascript
db.getCollectionInfos({ name: "telemetry" })
```
The output should contain `"type": "timeseries"`.

> **Note**: In `src/models/telemetry.model.js`, `autoCreate: false` and `autoIndex: false` are configured so Mongoose will not attempt to overwrite or conflict with this native collection.

---

## 7. How to Start the Server

```bash
# Development mode (with live reload via nodemon)
npm run dev

# Production mode
npm start
```

### Successful Startup Banner
```
◇ injected env (4) from .env
MongoDB connected successfully
Database Name: nexusflow
[Socket.IO] Server initialized and awaiting connections.
==================================================
 NexusFlow Backend Server Started Successfully
 Environment:  development
 Port:         5000
 Health URL:   http://localhost:5000/health
 Socket.IO:    http://localhost:5000
==================================================
```

---

## 8. REST API Documentation

### Root Endpoint
- **URL**: `/`
- **Method**: `GET`
- **Description**: Returns basic project information.
- **Success Response (200 OK)**:
```json
{
  "project": "NexusFlow",
  "description": "High-speed IoT Telemetry and Analytics Engine",
  "status": "online",
  "healthCheckUrl": "/health"
}
```

---

### Health Check Endpoint
- **URL**: `/health`
- **Method**: `GET`
- **Description**: Verifies that the Express application is running and reports uptime.
- **Request Example**:
```bash
curl http://localhost:5000/health
```
- **Success Response (200 OK)**:
```json
{
  "status": "OK",
  "message": "NexusFlow backend server is running smoothly",
  "timestamp": "2026-11-20T12:00:00.000Z",
  "uptime": "45.12 seconds",
  "environment": "development"
}
```

---

### Ingest Telemetry Endpoint
- **URL**: `/api/telemetry`
- **Method**: `POST`
- **Headers**: `Content-Type: application/json`
- **Description**: Validates and stores IoT telemetry data into MongoDB.
- **Request Example (Flat Structure)**:
```bash
curl -X POST http://localhost:5000/api/telemetry \
  -H "Content-Type: application/json" \
  -d '{
    "deviceId": "sensor-001",
    "deviceType": "pressure-sensor",
    "location": "plant-floor-beta",
    "temperature": 24.8,
    "pressure": 1014.2,
    "vibration": 0.015
  }'
```
- **Success Response (201 Created)**:
```json
{
  "status": "success",
  "message": "Telemetry reading recorded successfully",
  "data": {
    "id": "673f8a12bcde456789012345",
    "timestamp": "2026-11-20T12:00:58.422Z",
    "metadata": {
      "deviceId": "sensor-001",
      "deviceType": "pressure-sensor",
      "location": "plant-floor-beta"
    },
    "temperature": 24.8,
    "pressure": 1014.2,
    "vibration": 0.015
  }
}
```

- **Error Response (400 Bad Request)**:
```json
{
  "status": "error",
  "message": "Validation failed for telemetry data.",
  "errors": [
    "deviceId is required and must be a non-empty string.",
    "temperature is required and must be a valid finite number."
  ]
}
```

---

## 9. Example Telemetry JSON Payload

NexusFlow supports both **flat** and **nested metadata** formats:

### Flat Metadata Format
```json
{
  "deviceId": "temp-sensor-01",
  "deviceType": "temperature-sensor",
  "location": "cleanroom-alpha",
  "temperature": 22.4,
  "pressure": 1013.25,
  "vibration": 0.008,
  "timestamp": "2026-11-20T12:00:00.000Z"
}
```

### Nested Metadata Format
```json
{
  "metadata": {
    "deviceId": "temp-sensor-01",
    "deviceType": "temperature-sensor",
    "location": "cleanroom-alpha"
  },
  "temperature": 22.4,
  "pressure": 1013.25,
  "vibration": 0.008,
  "timestamp": "2026-11-20T12:00:00.000Z"
}
```

### Telemetry Field Specification

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `deviceId` | String | Yes | Unique identifier of the originating device (non-empty) |
| `deviceType` | String | Yes | Classification of the device (non-empty) |
| `location` | String | Yes | Physical or logical deployment location (non-empty) |
| `temperature` | Number | Yes | Temperature measurement (finite number) |
| `pressure` | Number | Yes | Atmospheric / gauge pressure reading (finite number) |
| `vibration` | Number | Yes | Vibration amplitude measurement (finite number) |
| `timestamp` | Date / String | No | ISO 8601 timestamp (defaults to current time if omitted) |

---

## 10. Socket.IO Connection Instructions

Clients can connect to the Socket.IO server using `socket.io-client`:

```javascript
const { io } = require('socket.io-client');

const socket = io('http://localhost:5000', {
  transports: ['websocket'], // Direct WebSocket transport recommended
  autoConnect: true,
  withCredentials: true
});

socket.on('connect', () => {
  console.log(`Connected with socket ID: ${socket.id}`);
});

socket.on('connect_error', (error) => {
  console.error('Connection error:', error.message);
});
```

---

## 11. Socket.IO Event Names & Payload Formats

### 1. `telemetry:send` (Client ➔ Server)
Emitted by IoT devices, edge gateways, or simulated clients to ingest telemetry.

```javascript
const payload = {
  deviceId: 'sensor-001',
  deviceType: 'temperature-sensor',
  location: 'warehouse-zone-3',
  temperature: 28.3,
  pressure: 1012.8,
  vibration: 0.02
};

// With acknowledgement callback
socket.emit('telemetry:send', payload, (response) => {
  if (response.status === 'success') {
    console.log('Saved document ID:', response.data.id);
  } else {
    console.error('Submission failed:', response.errors);
  }
});
```

---

### 2. `telemetry:received` (Server ➔ All Connected Clients)
Broadcasted to **all** connected clients when a telemetry payload is validated and successfully persisted to MongoDB.

```javascript
socket.on('telemetry:received', (event) => {
  console.log('Real-time telemetry broadcast:', event.data);
});
```

**Payload Schema**:
```json
{
  "status": "success",
  "message": "Telemetry reading recorded and broadcast.",
  "data": {
    "id": "673f8a12bcde456789012345",
    "timestamp": "2026-11-20T12:00:58.422Z",
    "metadata": {
      "deviceId": "sensor-001",
      "deviceType": "temperature-sensor",
      "location": "warehouse-zone-3"
    },
    "temperature": 28.3,
    "pressure": 1012.8,
    "vibration": 0.02
  }
}
```

---

### 3. `telemetry:error` (Server ➔ Emitting Client Only)
Emitted exclusively back to the client that sent an invalid payload or triggered a persistence error.

```javascript
socket.on('telemetry:error', (error) => {
  console.error('Telemetry error:', error.message, error.errors);
});
```

**Payload Schema (Validation Failure)**:
```json
{
  "status": "error",
  "message": "Validation failed for telemetry data.",
  "errors": [
    "deviceId is required and must be a non-empty string.",
    "temperature is required and must be a valid finite number."
  ]
}
```

**Payload Schema (Database Write Failure)**:
```json
{
  "status": "error",
  "message": "Failed to persist telemetry data.",
  "detail": "MongoDB connection lost"
}
```

---

## 12. Integration Testing Instructions

The test suite runs an end-to-end integration test against a live HTTP + Socket.IO server and a real MongoDB instance.

### Run Command
```bash
# From server/ directory
npm test
# Equivalent to:
node tests/socket.test.js
```

### What the Suite Tests
1. **Test 1 — Client connection**: Confirms client connects and receives a valid socket ID.
2. **Test 2 — Client disconnection**: Confirms orderly socket disconnection and resource release.
3. **Test 3 — Invalid telemetry rejection**: Confirms `telemetry:error` event emission and negative acknowledgement callback with error details.
4. **Test 4 — Valid telemetry ingestion**: Confirms persistence acknowledgement and local broadcast on `telemetry:received`.
5. **Test 5 — Multi-client broadcast**: Confirms that when Client 1 emits, Client 2 and Client 3 both receive the broadcast with accurate data.
6. **Test 6 — MongoDB persistence**: Directly queries MongoDB to verify that records created via Socket.IO are stored with accurate metadata, time, and numeric fields.
7. **Cleanup**: Automatically purges test documents from MongoDB and shuts down all test sockets and server listeners cleanly.

---

## 13. Expected Test Output

```
◇ injected env (4) from .env

--- Setup ---
  MongoDB connected.
[Socket.IO] Server initialized and awaiting connections.
  Test server listening on port 5099

Test 1: Client connection
[Socket.IO] Client connected: IFxnrEeePHup9oSMAAAA
  ✓ client1 is connected
  ✓ client1 has a socket id

Test 2: Client disconnection
[Socket.IO] Client connected: bm-CH_iKM_PvwYhgAAAB
  ✓ tempClient is connected before disconnect
  ✓ tempClient is disconnected after .disconnect()

Test 3: Invalid telemetry message
[Socket.IO] Client disconnected: bm-CH_iKM_PvwYhgAAAB (reason: client namespace disconnect)
  ✓ telemetry:error event emitted with status "error"
  ✓ telemetry:error contains errors array
  ✓ acknowledgement callback returns error for invalid data
  ✓ acknowledgement callback includes errors array

Test 4: Valid telemetry message (acknowledgement + persistence)
  ✓ acknowledgement returns success
  ✓ acknowledgement contains saved document id
  ✓ acknowledgement echoes correct temperature
  ✓ acknowledgement echoes correct deviceId
  ✓ sender receives telemetry:received broadcast

Test 5: Broadcasting to multiple connected clients
[Socket.IO] Client connected: k1_8jQnCAVsm31ReAAAC
[Socket.IO] Client connected: P4ZXBHb1WFrPbY--AAAD
  ✓ client2 is connected
  ✓ client3 is connected
  ✓ client2 received broadcast
  ✓ client2 broadcast has correct deviceId
  ✓ client3 received broadcast
  ✓ client3 broadcast has correct temperature

Test 6: MongoDB persistence verification
  ✓ test-sensor-ws-001 found in MongoDB
  ✓ stored temperature matches sent value
  ✓ stored location matches sent value
  ✓ test-sensor-ws-002 found in MongoDB
  ✓ stored pressure matches sent value

--- Cleanup ---
  Test documents removed from MongoDB.
[Socket.IO] Client disconnected: IFxnrEeePHup9oSMAAAA (reason: client namespace disconnect)
[Socket.IO] Client disconnected: k1_8jQnCAVsm31ReAAAC (reason: client namespace disconnect)
[Socket.IO] Client disconnected: P4ZXBHb1WFrPbY--AAAD (reason: client namespace disconnect)

==================================================
 Tests passed: 24
 Tests failed: 0
==================================================
```

---

## 14. Error Handling

### HTTP Error Architecture
- **400 Bad Request**: Raised when request body fails validation in `validateTelemetry` middleware. Returns JSON listing specific validation error strings.
- **404 Not Found**: Catches requests targeting unmapped routes in `src/middleware/errorHandler.js` (`notFoundHandler`).
- **500 Internal Server Error**: Unhandled exceptions caught by centralized `errorHandler`. In development mode, includes the error stack trace; in production, returns sanitized error messages.

### WebSocket Error Architecture
- Transport and validation errors are isolated from the server process; an invalid message never crashes the Socket.IO listener.
- Database write failures emit `telemetry:error` exclusively to the emitting client.
- Erroneous or rejected telemetry is never broadcast to downstream dashboard clients.

---

## 15. RxJS Integration Readiness Proposal

### Context & Scope
NexusFlow includes a visual rule engine workflow. Team lead Abhay owns the graph compiler that translates visual node-link rule graphs into executable rule representations. This proposal outlines how RxJS can integrate with the backend telemetry ingestion pipeline **without** modifying existing Socket.IO event names, without inventing the graph JSON contract, and without preemptively implementing the compiler.

### 1. Telemetry Input
- **Ingestion Points**:
  - REST: `POST /api/telemetry` processed by `telemetry.controller.js`.
  - WebSocket: `telemetry:send` processed by `socketManager.js`.
- **Stream Entry**: Both pathways run raw payloads through `validateTelemetryData()`. The sanitized telemetry object (`req.sanitizedTelemetry` or `result.sanitized`) represents the validated event input.
- **RxJS Subject**: A centralized `Subject<TelemetryData>` (e.g. `telemetryInputStream$`) in a dedicated `ruleEngine.service.js` will receive each validated telemetry event via `.next(sanitizedData)`.

### 2. Compiled Rule Input & Expected Interface
The graph compiler translates the frontend visual graph into a backend-executable rule bundle. The expected interface contract between the compiler and the backend is:

```typescript
// Conceptual Interface Contract (for coordination with Team Lead Abhay)
interface RuleGraphCompiler {
  /**
   * Compiles the graph definition into an RxJS operator pipe or rule function
   */
  compile(graphJSON: unknown): (source$: Observable<TelemetryData>) => Observable<RuleEngineOutput>;
}
```

- The compiler must provide:
  1. A deterministic validation/compilation function.
  2. A specification for rule lifecycle management (loading, updating, unloading graphs).
  3. A clear definition of rule outputs (pass-through telemetry vs generated alerts).

### 3. RxJS Processing Pipeline
- Validated telemetry events flow through the compiled operator pipeline:
```
telemetryInputStream$
   ├──► [MongoDB Ingestion Tap] ──► (Time-Series Persistence)
   ├──► [Socket.IO Broadcast Tap] ──► io.emit('telemetry:received')
   └──► [Compiled Rule Pipeline] ──► (Filter / Window / Threshold Evaluation)
             └──► [Alert Stream] ──► (Alert Persistence & Notification)
```
- Reactive capabilities enabled:
  - **Temporal Windows**: `bufferTime(5000)`, `windowTime(10000)` for rolling aggregates.
  - **Threshold Gating**: `filter(t => t.temperature > threshold)`.
  - **Rate Limiting / Debouncing**: `throttleTime()`, `debounceTime()` to avoid alert floods.
  - **Fault Isolation**: Pipeline uses `catchError` to ensure an error in one rule never blocks the telemetry persistence stream.

### 4. MongoDB Persistence
- **Raw Telemetry**: Ingestion to MongoDB time-series collection `telemetry` should remain direct or near-immediate, preserving raw historical data independently of rule outcomes.
- **Processed / Alert Persistence**: If rules generate anomalies or alerts, these should be recorded in an `alerts` collection with reference to the triggering telemetry `id` and `timestamp`.

### 5. Alert Generation
- When a rule condition evaluates to true, an alert object is emitted into an `alertStream$`.
- Alert schema:
  - `alertId`: Unique identifier
  - `ruleId`: ID of the visual rule node
  - `deviceId`: Originating device
  - `severity`: `'info' | 'warning' | 'critical'`
  - `triggerValue`: Value that breached threshold
  - `timestamp`: Time of event

### 6. Socket.IO Broadcasting
- **Preserved Existing Contracts**:
  - `telemetry:received` remains unchanged and continues broadcasting telemetry data to existing dashboards.
  - `telemetry:send` and `telemetry:error` retain their existing schemas.
- **New Real-Time Channel**:
  - A separate, dedicated event (e.g. `telemetry:alert` or `alert:new`) can be added for rule alerts so that frontend alert toasts or notifications do not conflict with telemetry graphs.

### 7. Unresolved Questions for Team Lead Abhay
1. **Compilation Format**: Will the compiler produce executable JavaScript functions, an RxJS pipe operator, or a declarative AST that the backend evaluates using a fixed library of operators?
2. **Runtime Hot-Reload**: How will graph modifications in the UI be pushed to the backend? (e.g., via an admin REST endpoint `POST /api/rules/compile` or a WebSocket event?)
3. **Statefulness across Server Restarts**: Where are compiled rules persisted? (e.g., MongoDB `rules` collection?)
4. **Execution Failure Mode**: If a custom rule throws a runtime error, should execution fail silently, log a warning, or notify the dashboard user?
5. **Multi-Device Windows**: Will rules require cross-device correlation (e.g. aggregate average across all sensors in `'factory-floor-A'`), or are all rules scoped per `deviceId`?

---

## License

ISC © NexusFlow Team
