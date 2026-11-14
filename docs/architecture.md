# NexusFlow Architecture Draft

## Overview

This document captures the shared graph contract used by the frontend canvas and backend compiler. The design is intentionally simple so Tanvi and Abhay can refine it on Day 2.

## Graph JSON draft

```json
{
  "nodes": [
    {
      "id": "source-1",
      "type": "source",
      "config": {
        "name": "Turbine Sensor",
        "stream": "temperature"
      }
    },
    {
      "id": "math-1",
      "type": "math",
      "config": {
        "operation": "moving_average",
        "window": 10
      }
    },
    {
      "id": "action-1",
      "type": "action",
      "config": {
        "name": "SMS Alert",
        "threshold": 85
      }
    }
  ],
  "edges": [
    { "id": "e1", "source": "source-1", "target": "math-1" },
    { "id": "e2", "source": "math-1", "target": "action-1" }
  ]
}
```

## Schema contract

- `nodes`: array of graph nodes
- `edges`: array of graph links
- Each node has:
  - `id`: unique node identifier
  - `type`: node family such as `source`, `math`, `filter`, or `action`
  - `config`: operation-specific configuration
- Each edge has:
  - `source`: node id that emits data
  - `target`: receiving node id
  - optional `id`: edge identifier

## Execution model

- The frontend serializes the visual graph into JSON.
- The backend validates the JSON against the shared schema.
- A topological sort ensures nodes are evaluated in a safe order.
- RxJS operators map each node type to reactive logic.
- Live telemetry is transformed and checked against alert conditions in real time.
