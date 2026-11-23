# NexusFlow — Week 1 Backend Development Progress Log

| Metadata | Details |
| :--- | :--- |
| **Project** | NexusFlow — Visual IoT Telemetry & Rule Engine |
| **Author / Role** | Kajal Kumari Singh — Backend & Database Engineer |
| **Branch** | `kajal-backend` |
| **Milestone** | Week 1: Backend Foundation, Time-Series Persistence & Real-Time Ingestion |
| **Date** | November 21, 2026 |
| **Status** | Completed & Verified |

---

## Executive Summary

During Week 1, the backend foundation for NexusFlow was designed, implemented, and fully verified. The core objective was to establish a resilient, high-throughput backend service capable of ingesting IoT sensor telemetry through dual interfaces (synchronous REST and asynchronous WebSockets), validating payloads via a shared domain validator, persisting readings directly into a MongoDB Time-Series collection, and broadcasting live telemetry to connected dashboard clients in real time.

All 10 target backend capabilities have been built and validated with automated integration tests. A comprehensive test suite verifies end-to-end functionality across connection lifecycles, payload rejection, database persistence, and multi-client event broadcasting with **24 passed assertions and 0 failures**.

---

## 1. Verified Completed Implementations

### Task 1: Express.js Backend Initialization
* **Relevant Files**:
  * `server/server.js`
  * `server/package.json`
  * `server/src/config/env.js`
  * `server/src/routes/health.routes.js`
  * `server/src/controllers/health.controller.js`
  * `server/src/middleware/errorHandler.js`
* **Implementation Details**: Initialized an Express 5 application with modular architecture. Configured standard middleware including `cors` (bound to client URL configuration), `express.json()`, and `express.urlencoded()`. Established a centralized configuration loader reading environment variables from `.env`. Added route handlers for root (`GET /`) and operational health checking (`GET /health`), plus 404 and global error-handling middleware. Implemented graceful shutdown hooks intercepting `SIGINT` and `SIGTERM`.
* **Functionality Delivered**: Standardized HTTP server listening on configured port (default `5000`) with structured JSON error handling and uptime diagnostics.
* **Testing Performed**: Automated server startup verification and health route checks.
* **Actual Results**: Server boots cleanly, exposes `GET /health` responding with status `OK`, system uptime, timestamp, and active environment.

### Task 2: MongoDB Connection and Configuration
* **Relevant Files**:
  * `server/src/config/db.js`
  * `server/src/config/env.js`
* **Implementation Details**: Created a dedicated database connection module utilizing Mongoose 9 (`mongoose.connect`). Loaded connection string from `MONGODB_URI` environment variable with fallback to `mongodb://localhost:27017/nexusflow`. Configured connection lifecycle logging (logs successful connection and target database name, or logs critical error and terminates process cleanly on fatal connection failures).
* **Functionality Delivered**: Reliable database connectivity lifecycle integrated into server boot sequence before HTTP listener binding.
* **Testing Performed**: Connection establishment during test suite setup and manual ping script tests.
* **Actual Results**: Successfully connects to MongoDB instance, logging `MongoDB connected successfully` and confirming database binding to `nexusflow`.

### Task 3: MongoDB Time-Series Telemetry Collection
* **Relevant Files**:
  * `server/src/models/telemetry.model.js`
* **Implementation Details**: Created the Mongoose schema `telemetrySchema` mapped directly to MongoDB's native time-series engine. Configured schema options with:
  * `timeseries.timeField`: `'timestamp'`
  * `timeseries.metaField`: `'metadata'`
  * `timeseries.granularity`: `'seconds'`
  * `autoCreate: false` and `autoIndex: false`: Explicitly disabled to preserve pre-existing native collection settings without conflicting Mongoose index generation attempts.
  * `versionKey: false`: Omitted internal `__v` fields.
* **Functionality Delivered**: Strongly typed document modeling for high-velocity IoT telemetry containing `metadata` (`deviceId`, `deviceType`, `location`), numeric measurements (`temperature`, `pressure`, `vibration`), and BSON date timestamps.
* **Testing Performed**: Direct CRUD persistence via Mongoose model against MongoDB 7+/9+ instance in integration tests.
* **Actual Results**: Telemetry readings correctly stored with optimized time-series bucket layout.

### Task 4: REST Telemetry Ingestion API
* **Relevant Files**:
  * `server/src/routes/telemetry.routes.js`
  * `server/src/controllers/telemetry.controller.js`
  * `server/src/middleware/validateTelemetry.js`
* **Implementation Details**: Mounted route `POST /api/telemetry` delegating request processing through validation middleware `validateTelemetry` into `createTelemetry` controller. Sanitized payloads are persisted via `Telemetry.create()` and returned with HTTP `201 Created` status code and formatted record metadata.
* **Functionality Delivered**: Synchronous ingestion endpoint for HTTP-enabled IoT edge gateways and external simulators.
* **Testing Performed**: Handled valid payloads, malformed JSON, and missing fields.
* **Actual Results**: Returns HTTP 201 with created record ID and normalized telemetry on valid data; returns HTTP 400 with structured validation errors on malformed payloads.

### Task 5: Shared Telemetry Validation
* **Relevant Files**:
  * `server/src/validators/telemetryValidator.js`
  * `server/src/middleware/validateTelemetry.js`
* **Implementation Details**: Implemented transport-agnostic pure validator function `validateTelemetryData()`. Supports both flat payloads (`{ deviceId, deviceType, location, temperature, ... }`) and nested payloads (`{ metadata: { deviceId, ... }, ... }`). Validates non-empty string constraints on device identifiers and locations, finite numeric checks on measurements (`temperature`, `pressure`, `vibration`), and validates/normalizes ISO 8601 timestamps (defaulting to `new Date()` if omitted).
* **Functionality Delivered**: Single source of truth for IoT data validation shared identically by Express REST middleware and Socket.IO real-time event handlers.
* **Testing Performed**: Validated invalid payload inputs (missing deviceId, string-coerced NaN values, null inputs) in integration test suite.
* **Actual Results**: Correctly rejects invalid payloads with descriptive error arrays; strips extraneous fields and outputs sanitized data structure.

### Task 6: Socket.IO Real-Time Communication
* **Relevant Files**:
  * `server/src/services/socketManager.js`
  * `server/server.js`
* **Implementation Details**: Initialized Socket.IO server on top of shared Node.js `http.Server` instance. Configured CORS for dashboard client access. Attached connection event listeners handling incoming client connections, disconnections, and inbound `telemetry:send` events with acknowledgement callback support.
* **Functionality Delivered**: Bidirectional, low-latency WebSocket communication layer sharing the same HTTP port as Express.
* **Testing Performed**: Automated connection and disconnection testing using `socket.io-client`.
* **Actual Results**: Sockets successfully connect with unique socket IDs and cleanly handle client-initiated disconnects without resource leaks.

### Task 7: MongoDB Telemetry Persistence (WebSocket Path)
* **Relevant Files**:
  * `server/src/services/socketManager.js`
  * `server/src/models/telemetry.model.js`
* **Implementation Details**: In `socketManager.js`, incoming `telemetry:send` payloads are validated using `validateTelemetryData()`. On validation pass, records are written asynchronously to MongoDB using `Telemetry.create()`. If database persistence fails, an error event is returned to the caller and broadcasting is suppressed to preserve data integrity.
* **Functionality Delivered**: High-throughput persistence of WebSocket-ingested IoT telemetry into MongoDB.
* **Testing Performed**: Emitted valid telemetry over socket client and queried MongoDB directly using Mongoose `Telemetry.findOne()`.
* **Actual Results**: Ingested socket telemetry verified to exist in MongoDB with exact temperature, pressure, vibration, and metadata values.

### Task 8: Multi-Client Telemetry Broadcasting
* **Relevant Files**:
  * `server/src/services/socketManager.js`
* **Implementation Details**: Implemented event emission via `io.emit('telemetry:received', ...)` upon confirmed database persistence. This broadcasts the recorded telemetry reading to all connected dashboard clients and edge consumers simultaneously.
* **Functionality Delivered**: Real-time pub/sub distribution of live telemetry stream across multiple connected user interfaces.
* **Testing Performed**: Automated test connecting three concurrent socket clients; Client 1 emits telemetry while Client 2 and Client 3 listen.
* **Actual Results**: Both Client 2 and Client 3 received the broadcasted telemetry payload with exact device metadata and sensor readings.

### Task 9: Automated Socket.IO Integration Testing
* **Relevant Files**:
  * `server/tests/socket.test.js`
  * `server/package.json`
* **Implementation Details**: Created a standalone end-to-end integration test runner executed via `npm test` (`node tests/socket.test.js`). The suite boots an ephemeral HTTP server on dedicated port `5099`, establishes live MongoDB connection, connects multiple `socket.io-client` instances, and validates 6 test scenarios before purging test records and disconnecting all resources.
* **Functionality Delivered**: Repeatable CI/CD-ready integration test harness for real-time telemetry flows.
* **Testing Performed**: Executed `npm.cmd test`.
* **Actual Results**:
  * **24 / 24 assertions passed**.
  * **0 failures**.
  * Automated teardown verified; MongoDB test documents (`test-sensor-ws-001`, `test-sensor-ws-002`) successfully purged.

### Task 10: Backend Architecture & API Documentation
* **Relevant Files**:
  * `server/README.md`
* **Implementation Details**: Authored a comprehensive 680-line backend documentation guide covering architectural data flow diagrams, directory structures, environment variable configuration, MongoDB time-series creation scripts (`mongosh`), REST API specifications with curl examples, Socket.IO event payload contracts, and integration test instructions.
* **Functionality Delivered**: Complete technical onboarding reference and developer guide for the backend service.
* **Testing Performed**: Markdown rendering and code example verification.
* **Actual Results**: Clear, accessible documentation available to team members in `server/README.md`.

---

## 2. Integration Test Results & Verification

### Test Suite Execution Output
* **Command**: `npm.cmd test`
* **Script**: `node tests/socket.test.js`
* **Status**: PASSED

```text
> nexusflow-backend@1.0.0 test
> node tests/socket.test.js

◇ injected env (4) from .env

--- Setup ---
  MongoDB connected.
[Socket.IO] Server initialized and awaiting connections.
  Test server listening on port 5099

Test 1: Client connection
  ✓ client1 is connected
  ✓ client1 has a socket id

Test 2: Client disconnection
  ✓ tempClient is connected before disconnect
  ✓ tempClient is disconnected after .disconnect()

Test 3: Invalid telemetry message
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

==================================================
 Tests passed: 24
 Tests failed: 0
==================================================
```

### Verification Matrix

| Test Suite | Scope | Assertions | Status |
| :--- | :--- | :---: | :---: |
| **Test 1: Client Connection** | Socket.IO handshake and socket ID allocation | 2 | **PASSED** |
| **Test 2: Client Disconnection** | Orderly disconnection and cleanup | 2 | **PASSED** |
| **Test 3: Invalid Telemetry Rejection** | Schema validation failure, error event & ack error | 4 | **PASSED** |
| **Test 4: Valid Telemetry Ingestion** | Success ack, database ID return & sender broadcast | 5 | **PASSED** |
| **Test 5: Multi-Client Broadcasting** | Cross-client broadcast delivery to distinct sockets | 6 | **PASSED** |
| **Test 6: MongoDB Persistence Verification** | Direct database query verifying field fidelity | 5 | **PASSED** |
| **Database Teardown** | Cleanup of test records from MongoDB | Verified | **PASSED** |
| **Total** | | **24** | **100% Pass** |

---

## 3. Pending Work & Future Milestones

The following items are **not yet implemented** and represent upcoming milestones for Week 2 and beyond:

| Item | Feature Area | Current Status | Description / Blocker |
| :---: | :--- | :---: | :--- |
| **1** | **RxJS Stream Processing** | Not Implemented | Reactive pipeline (`Subject` / operator pipes) for windowed telemetry aggregation. |
| **2** | **Dynamic Rule Registration** | Not Implemented | API or socket interface to load and register custom user-defined rules. |
| **3** | **Graph JSON Compilation Integration** | Not Implemented | Depends on confirmation of visual rule compiler output contract from team lead Abhay. |
| **4** | **Dynamic Rule Execution** | Not Implemented | Real-time evaluation of compiled rules against incoming telemetry events. |
| **5** | **Alert Generation** | Not Implemented | Triggering structured anomaly/alert payloads when rule thresholds are breached. |
| **6** | **Alert Persistence** | Not Implemented | Storing triggered alerts in dedicated MongoDB collection (`alerts`). |
| **7** | **Socket.IO Alert Broadcasting** | Not Implemented | Real-time dispatching of alert events (`telemetry:alert`) to frontend dashboards. |

> [!NOTE]
> An architectural proposal for the RxJS stream processing pipeline and rule compiler interface has been prepared and documented in `server/README.md#15-rxjs-integration-readiness-proposal`. Implementation will proceed once the compiler interface contract is confirmed by Team Lead Abhay.

---

## 4. Source Files Reference

```text
server/
├── server.js                          # Express & Socket.IO server initialization
├── package.json                       # Service dependencies and test scripts
├── src/
│   ├── config/
│   │   ├── env.js                     # Environment variable configuration
│   │   └── db.js                      # MongoDB / Mongoose connection setup
│   ├── controllers/
│   │   ├── health.controller.js       # Health endpoint controller
│   │   └── telemetry.controller.js    # REST telemetry ingestion controller
│   ├── middleware/
│   │   ├── errorHandler.js            # Global error and 404 handler
│   │   └── validateTelemetry.js       # Express telemetry validation middleware
│   ├── models/
│   │   └── telemetry.model.js         # Mongoose schema for MongoDB Time-Series collection
│   ├── routes/
│   │   ├── health.routes.js           # Route definition for /health
│   │   └── telemetry.routes.js        # Route definition for /api/telemetry
│   ├── services/
│   │   └── socketManager.js           # Socket.IO connection handling & real-time telemetry processing
│   └── validators/
│       └── telemetryValidator.js      # Pure validation function for IoT telemetry payloads
└── tests/
    └── socket.test.js                 # Integration test suite (24 assertions)
```

---

## 22 November 2026 — Backend Audit and RxJS Architecture Planning

| Metadata | Details |
| :--- | :--- |
| **Activity** | Backend Infrastructure Audit & RxJS Telemetry Stream Architecture Design |
| **Author / Role** | Kajal Kumari Singh — Backend & Database Engineer |
| **Branch** | `kajal-backend` |
| **Status** | Completed & Verified (Architecture & Audit Only) |

### 1. Completed Activities & Audit Findings

1. **Backend Infrastructure Audit**:
   - Inspected modular Express 5 server architecture (`server/server.js`), centralized configuration (`server/src/config/env.js`), and health diagnostic endpoint (`/health`).
   - Inspected MongoDB connection lifecycle (`server/src/config/db.js`) and native time-series schema configuration (`server/src/models/telemetry.model.js`).
   - Verified that `autoCreate: false` and `autoIndex: false` protect native time-series parameters without Mongoose conflict.

2. **Telemetry Ingestion Review**:
   - Reviewed REST ingestion path (`POST /api/telemetry` via `server/src/controllers/telemetry.controller.js`).
   - Reviewed WebSocket real-time ingestion path (`telemetry:send` via `server/src/services/socketManager.js`).
   - Verified that the shared pure validator `validateTelemetryData` (`server/src/validators/telemetryValidator.js`) serves as the single source of truth across both HTTP and WebSocket transports.

3. **Integration Test Suite Verification**:
   - Launched local MongoDB instance on port 27017 and executed the integration test suite (`node tests/socket.test.js` / `npm.cmd test`).
   - Verified 6 test suites across 24 assertions: **24 passed, 0 failed**.
   - Confirmed:
     - Socket connection and disconnection lifecycles operate cleanly.
     - Invalid telemetry payloads are rejected with descriptive errors (`telemetry:error`).
     - Valid telemetry is acknowledged, persisted to MongoDB, and broadcast (`telemetry:received`).
     - Real-time broadcasts deliver identical payload fidelity across multiple concurrent clients.
     - Database persistence directly verified via Mongoose queries; test documents cleanly purged during teardown.

4. **Graph Schema Draft Inspection**:
   - Inspected `shared/graph-schema.json` and architectural draft `docs/architecture.md` established in project scaffolding.
   - Verified node types (`source`, `math`, `filter`, `action`) and edge routing specifications (`source`, `target`, `id`).

5. **Compiler Implementation Status & Contract Gap**:
   - Confirmed that Abhay's graph compiler implementation has not yet been committed to any repository branch.
   - Identified that the compiled rule format (declarative AST vs. RxJS operator pipe factory vs. bytecode) and rule registration interface remain unconfirmed.

6. **RxJS Telemetry Stream Architecture Design**:
   - Designed a reactive pipeline based on `telemetryInputStream$` (`Subject<Telemetry>`) fed by validated, persisted telemetry from both REST and Socket.IO ingestion.
   - Designed device stream partitioning using `groupBy((t) => t.metadata.deviceId)` to isolate windowed metric computations per physical device.
   - Designed `alertStream$` (`Subject<Alert>`) with throttling/cooldown to prevent alert flooding during prolonged anomaly states.
   - Designed isolated Socket.IO alert broadcasting on dedicated channel `telemetry:alert`, preserving existing `telemetry:received` contracts without frontend regression.

7. **Eight-Stage Implementation Roadmap**:
   - Formulated a staged roadmap specifying files, dependencies, expected behaviors, testing strategies, and integration risks:
     - **Stage 1**: RxJS installation and telemetry stream service (`telemetryStream.service.js`).
     - **Stage 2**: Integration with REST and Socket.IO ingestion paths.
     - **Stage 3**: Dynamic rule registration and persistence (`rule.model.js`, `ruleRegistry.service.js`, `POST /api/rules`).
     - **Stage 4**: Rule execution engine with RxJS dynamic pipelines (`ruleExecutor.service.js`).
     - **Stage 5**: Alert generation service with throttling cooldown (`alertStream.service.js`).
     - **Stage 6**: Alert persistence in MongoDB (`alert.model.js`).
     - **Stage 7**: Real-time Socket.IO alert broadcasting (`telemetry:alert`).
     - **Stage 8**: Automated end-to-end integration and regression testing.

8. **Integration Risks & Questions for Team Lead Abhay**:
   - Compiled output format (AST JSON vs. JS function vs. RxJS pipe).
   - Ingestion/compilation boundary (client-side compilation vs. server-side compiler endpoint).
   - Rule registration transport (REST API vs. Socket.IO events).
   - Node config schemas for `source`, `math`, `filter`, and `action` nodes.
   - Multi-device stream scoping and cross-sensor aggregation requirements.
   - Rule statefulness and persistence in MongoDB across server restarts.
   - Runtime error handling and fault isolation for user-defined rules.

### 2. Pending Work & Next Steps

The following tasks remain pending and will proceed once the compiler contract is confirmed:

- **Obtain Abhay's Graph Compiler Contract**: Resolve the 7 technical integration questions regarding compiler output format and rule registration interface.
- **Implement RxJS Telemetry Stream Ingress**: Install `rxjs` and create `telemetryStream.service.js` (Stage 1).
- **Integrate REST and Socket.IO Ingestion with the Stream**: Hook both ingestion controllers into `telemetryInputStream$` without modifying existing external payload contracts (Stage 2).
- **Implement Dynamic Rules and Alerts**: Implement rule registry, dynamic pipeline execution, alert persistence, and `telemetry:alert` socket broadcasting after compiler interface confirmation (Stages 3–8).

> [!NOTE]
> In strict accordance with the 22 November project guidelines, no application source code was modified, no dependencies were installed, and no mock compiler implementations were created during this audit and design session.

---

## 23 November 2026 — RxJS Stream Architecture Preparation & Conceptual Review

| Metadata | Details |
| :--- | :--- |
| **Activity** | Backend Audit, Test Suite Verification, RxJS Core Learning, and Telemetry Stream Pipeline Design |
| **Author / Role** | Kajal Kumari Singh — Backend & Database Engineer |
| **Branch** | `kajal-backend` |
| **Latest Confirmed Commit** | `fa11f37` (`fa11f37 docs(context): record 22 November backend investigation`) |
| **Implementation Status** | **Architecture Design & Learning Only — RxJS Implementation Not Started / Not Complete** |

### 1. Completed Activities & Technical Verification

1. **Git Repository Status Inspection**:
   - Verified active branch: `kajal-backend`, synchronized with `origin/kajal-backend`.
   - Confirmed working tree is clean with zero uncommitted application code changes.
   - Inspected recent Git commit history (`fa11f37`, `2303718`, `fb7e353`, `b3b53f0`, `568df0d`).

2. **Backend Test Suite Execution & Local MongoDB Verification**:
   - Verified local MongoDB 9.0 instance active and listening on port `27017` (`D:\Program Files\MongoDB\Server\9.0\data`).
   - Executed integration test suite: `npm.cmd test` (`node tests/socket.test.js`).
   - **Result**: All **24 assertions passed across 6 test suites with 0 failures** (connection lifecycle, invalid payload rejection, ack + persistence, multi-client broadcast, and direct MongoDB persistence).

3. **RxJS Core Concepts Learning & Architectural Review**:
   - **Subject**: Understood as a multicast event bus and broadcasting hub possessing both Observer (`.next()`) and Observable (`.subscribe()`) traits, distributing incoming readings simultaneously to multiple downstream rule pipelines.
   - **Observable & `asObservable()`**: Established encapsulation boundaries where the backing Subject remains private, and consumers access a read-only Observable to prevent external code or custom rules from injecting arbitrary data into the stream.
   - **Subscription & Lifecycle Management**: Examined active subscription handles, the necessity of explicit `.unsubscribe()` calls when rules are deleted or updated, and the use of an in-memory `Map<ruleId, Subscription>` registry to prevent memory leaks and zombie rule execution.
   - **Core Reactive Operators**:
     - `filter`: Gating readings based on device criteria or thresholds (e.g. `temperature > 85`).
     - `map`: Transforming telemetry structures or scaling units without mutating raw source records.
     - `tap`: Non-intrusive logging, stream auditing, and diagnostic metrics.
     - `catchError`: Intercepting operator errors and returning `EMPTY` to ensure an isolated rule failure cannot terminate the central telemetry stream.
     - `mergeMap`: Concurrently projecting incoming telemetry into asynchronous sub-tasks (such as external webhook alerts) without blocking the parent stream.
     - `defer`: Creating fresh Observable instances per subscriber for lazy evaluation.

4. **Telemetry Stream Service Design (`server/src/services/telemetryStream.service.js`)**:
   - Formulated module architecture for a dedicated singleton service:
     - Encapsulated private `Subject` instance (`_telemetrySubject$`).
     - `publishTelemetry(record)`: Public ingestion method receiving verified documents and pushing to stream via `.next(record)`.
     - `getTelemetryStream()`: Returns read-only Observable via `_telemetrySubject$.asObservable()`.
     - `getSubscriberCount()` / `getIngestedCount()`: Health diagnostics and memory leak monitoring.
     - `destroyStream()`: Graceful completion hook for server shutdown and integration test cleanup.
   - **Zero Logic Duplication**: Validation remains exclusively in `telemetryValidator.js`, and database persistence remains exclusively in Mongoose `Telemetry.create()`.

5. **Exact Integration Points with Existing Backend**:
   - **REST Controller (`server/src/controllers/telemetry.controller.js`)**:
     - Ingestion point: Immediately following `const savedRecord = await Telemetry.create(telemetryData);` in `createTelemetry`.
     - Guarantees that only valid, persisted records with database IDs enter the stream; validation errors (HTTP 400) and database write failures (catch block) never emit.
   - **Socket.IO Manager (`server/src/services/socketManager.js`)**:
     - Ingestion point: Immediately following `const savedRecord = await Telemetry.create(result.sanitized);` inside the `telemetry:send` handler.
     - Dispatches to `publishTelemetry(savedRecord)` concurrently with existing `io.emit('telemetry:received')`, preserving existing dashboard broadcasts with zero regressions.

6. **Automated Test Matrix Design**:
   - **TC-01 (Single Ingress)**: Verified record published to stream arrives at subscriber with matched fields.
   - **TC-02 (Sequential Streaming)**: 5 distinct records published in sequence arrive in exact FIFO order.
   - **TC-03 (Invalid Payload Rejection)**: Malformed or non-object payloads rejected; zero emissions to stream.
   - **TC-04 (Database Failure Barrier)**: Simulated MongoDB write failures caught; zero emissions to stream.
   - **TC-05 (Concurrent Subscribers)**: Multiple independent rule subscribers receive identical telemetry simultaneously.
   - **TC-06 (Subscriber Error Isolation)**: Broken subscriber throwing an error does not crash peer subscribers or the root stream.
   - **TC-07 (Subscription Teardown)**: Unsubscribed listeners stop receiving events; subscriber count decreases.

7. **Integration Risks & Architectural Divergence**:
   - **Transport Protocol Conflict**: Socket.IO 4 on port 5000 (Kajal) vs. native `ws` on port 8080 (Abhay).
   - **Dependency Mismatch**: Express `5.3.0` vs `4.21.2`, Mongoose `9.12.1` vs `8.7.3`, missing `rxjs` in `kajal-backend`.
   - **Rule Persistence Gap**: Abhay's in-memory `GraphModel` loses rules on restart; requires a persistent MongoDB schema.
   - **Temporal Operator Gap**: Abhay's `nodeOperators.js` lacks time-windowing (`bufferTime`, `windowTime`, moving averages).
   - **Device Partitioning**: Compiler lacks per-device stream scoping (`groupBy(t => t.metadata.deviceId)`).

### 2. Adherence to Project Constraints

- Strictly operated on `kajal-backend` branch with zero branch switching or merging.
- Application source code completely preserved without modifications.
- No new dependencies installed.
- No artificial commits or automated pushes performed.
- Clearly recorded that RxJS implementation is in design/preparation status and not yet implemented in production code.
