# Server

Owned by: Kajal (MongoDB, ingestion, WebSockets, alerting) and Abhay (compiler and runtime engine).

This service exposes the health endpoint and the backend runtime for telemetry ingestion and rule execution.

## Live rule execution

Use `POST /api/graphs/activate` with a graph JSON payload to compile and activate a rule against incoming telemetry. The response includes a `graphId`; use `DELETE /api/graphs/activate/:graphId` to stop it. Activated graphs run in memory and are cleared when the server restarts.

Accepted single and bulk telemetry is broadcast to dashboard clients and evaluated by every active graph. Action nodes that trigger dispatch a configured webhook (when available), the mock-SMS result, and a WebSocket alert.
