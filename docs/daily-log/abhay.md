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
