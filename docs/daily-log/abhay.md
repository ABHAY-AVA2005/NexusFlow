# Abhay Daily Log

## 2026-11-14

- **Implemented:** Bootstrapped the repo, documented team workflow, and added the shared graph schema and architecture draft.
  **Reason/tools:** Git, Markdown, and JSON provide a clear team structure and frontend-backend contract.
- **Implemented:** Added graph validation, topological ordering, cycle detection, and basic source/filter/math/action execution using Node.js and Express.
  **Reason/tools:** These establish the backend foundation for compiling and testing visual rules before live telemetry integration.
- **Verified:** Sample graph compilation and execution, plus the Express compile endpoint.

## 2026-11-15

- **Implemented:** Compiled graph edges into RxJS pipelines with source, math, filter, and action operators; added stream and single-record execution.
  **Reason/tools:** RxJS and topological ordering make the backend follow the visual graph for live telemetry.
- **Verified:** Added Node tests for execution, branching, ordering, invalid edges, and cycles.

## 2026-11-16

- **Verified:** Ran the server test suite; all 5 tests passed.
  **Reason/tools:** Confirmed the graph compiler and RxJS execution changes are passing before sharing them on `abhay-team-lead`.
- **Published:** Pushed the graph compiler and rule engine commits to the `abhay-team-lead` GitHub branch.

## 2026-11-17

- **Implemented:** Hardened the compiler and rule engine for iterable telemetry payloads and testable app startup.
  **Reason/tools:** Node.js and RxJS now accept arrays of telemetry records and the Express app can be imported without auto-starting a listener, which makes integration and validation safer.
- **Verified:** Ran the server suite to confirm the updated graph engine still passes all checks.

## 2026-11-20

- **Integrated:** Finalized and validated the `abhay-team-lead` integration work, including the visual rule builder, live telemetry socket, graph alert dispatch, telemetry ingestion, simulator, and dashboard components.
- **Verified:** Ran all 13 server Node tests successfully and built the Vite client production bundle successfully.
- **Published:** Prepared the branch's completed daily-log and team integration updates for the next review and merge.
- **Dataset integration:** Downloaded and added the 250,000-row Kaggle industrial IoT dataset; added continuous CSV replay, RPM/failure metadata support, and removed the dashboard's random WebSocket fallback.
