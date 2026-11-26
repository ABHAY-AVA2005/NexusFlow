/**
 * NexusFlow - Graph Compiler & Node Operators Test Suite
 *
 * Verifies the pure computational compiler subsystem:
 * 1. Structural graph validation (node types, unique IDs, edge integrity).
 * 2. Kahn's algorithm topological sorting & cycle detection.
 * 3. Static metadata compilation.
 * 4. Reactive stream pipeline execution (source, math, filter, action).
 * 5. Branching topologies (fan-in merge, fan-out branching, multi-sink aggregation).
 * 6. Error handling (orphaned nodes, source incoming edges, non-finite values).
 *
 * Execution:
 *   node tests/graphCompiler.test.js
 */

const { of, lastValueFrom, toArray } = require('rxjs');
const {
  validateGraph,
  topologicalSort,
  compileGraph,
  compileGraphToStream,
} = require('../src/compiler/graphCompiler');

// ==========================================
// Test Runner Harness
// ==========================================

let passedCount = 0;
let failedCount = 0;

const assert = (condition, message) => {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passedCount++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failedCount++;
  }
};

const assertThrows = (fn, expectedPattern, message) => {
  try {
    fn();
    console.error(`  ✗ FAIL (Expected throw, but succeeded): ${message}`);
    failedCount++;
  } catch (error) {
    if (expectedPattern && !expectedPattern.test(error.message)) {
      console.error(`  ✗ FAIL: ${message} (Expected message matching ${expectedPattern}, got "${error.message}")`);
      failedCount++;
    } else {
      console.log(`  ✓ ${message}`);
      passedCount++;
    }
  }
};

// ==========================================
// Test Fixtures
// ==========================================

const simplePipelineGraph = {
  id: 'temp-alert-pipeline',
  nodes: [
    { id: 'sensor-source', type: 'source', config: { field: 'temperature' } },
    { id: 'range-filter', type: 'filter', config: { field: 'temperature', minimum: 60, maximum: 120 } },
    { id: 'scale-math', type: 'math', config: { field: 'temperature', factor: 1.05 } },
    { id: 'alert-action', type: 'action', config: { field: 'temperature', threshold: 90, message: 'High temperature alert' } },
  ],
  edges: [
    { source: 'sensor-source', target: 'range-filter' },
    { source: 'range-filter', target: 'scale-math' },
    { source: 'scale-math', target: 'alert-action' },
  ],
};

// ==========================================
// Test Suite Execution
// ==========================================

const runTests = async () => {
  console.log('\n==================================================');
  console.log(' NexusFlow: Graph Compiler & Node Operators Tests');
  console.log('==================================================\n');

  // ----------------------------------------------------
  // Test 1: Structural Validation (validateGraph)
  // ----------------------------------------------------
  console.log('--- Test Group 1: Structural Validation ---');

  assert(validateGraph(simplePipelineGraph) === true, 'Valid graph passes structural validation');

  assertThrows(
    () => validateGraph(null),
    /Graph payload must be an object/,
    'Rejects null graph payload'
  );

  assertThrows(
    () => validateGraph({ nodes: 'invalid', edges: [] }),
    /Graph nodes must be an array/,
    'Rejects non-array nodes'
  );

  assertThrows(
    () => validateGraph({ nodes: [], edges: 'invalid' }),
    /Graph edges must be an array/,
    'Rejects non-array edges'
  );

  assertThrows(
    () => validateGraph({
      nodes: [
        { id: 'n1', type: 'source', config: {} },
        { id: 'n1', type: 'filter', config: {} },
      ],
      edges: [],
    }),
    /Duplicate node id detected: n1/,
    'Rejects duplicate node IDs'
  );

  assertThrows(
    () => validateGraph({
      nodes: [{ id: 'n1', type: 'unsupported-type', config: {} }],
      edges: [],
    }),
    /unsupported type/,
    'Rejects unknown node types'
  );

  assertThrows(
    () => validateGraph({
      nodes: [{ id: 'n1', type: 'source' }],
      edges: [],
    }),
    /requires a config object/,
    'Rejects nodes without config object'
  );

  assertThrows(
    () => validateGraph({
      nodes: [{ id: 'n1', type: 'source', config: {} }],
      edges: [{ source: 'n1', target: 'missing-node' }],
    }),
    /Edge target not found: missing-node/,
    'Rejects edges referencing non-existent targets'
  );

  // Schema & Enum Verification
  const schema = require('../../shared/graph-schema.json');
  assert(
    Array.isArray(schema.properties.nodes.items.properties.type.enum),
    'Schema defines an enum array for node types'
  );
  assert(
    JSON.stringify(schema.properties.nodes.items.properties.type.enum) === JSON.stringify(['source', 'math', 'filter', 'action']),
    'Schema restricts node types to exact enum: source, math, filter, action'
  );

  assert(
    validateGraph({
      nodes: [
        { id: 's', type: 'source', config: {} },
        { id: 'm', type: 'math', config: {} },
        { id: 'f', type: 'filter', config: {} },
        { id: 'a', type: 'action', config: {} },
      ],
      edges: [
        { source: 's', target: 'm' },
        { source: 'm', target: 'f' },
        { source: 'f', target: 'a' },
      ],
    }) === true,
    'Validates all 4 allowed node types: source, math, filter, action'
  );

  // ----------------------------------------------------
  // Test 2: Topological Sorting & Cycle Detection
  // ----------------------------------------------------
  console.log('\n--- Test Group 2: Topological Sorting & Cycles ---');

  const reversedOrderGraph = {
    nodes: [...simplePipelineGraph.nodes].reverse(),
    edges: simplePipelineGraph.edges,
  };

  const sortedOrder = topologicalSort(reversedOrderGraph);
  assert(
    JSON.stringify(sortedOrder) === JSON.stringify(['sensor-source', 'range-filter', 'scale-math', 'alert-action']),
    'Sorts nodes into correct dependency order regardless of input array ordering'
  );

  assertThrows(
    () => topologicalSort({
      nodes: [
        { id: 'node-A', type: 'source', config: {} },
        { id: 'node-B', type: 'math', config: { factor: 2 } },
        { id: 'node-C', type: 'action', config: { threshold: 100 } },
      ],
      edges: [
        { source: 'node-A', target: 'node-B' },
        { source: 'node-B', target: 'node-C' },
        { source: 'node-C', target: 'node-A' }, // Cyclic edge
      ],
    }),
    /Graph contains a cycle/,
    'Detects circular dependencies and throws compilation error'
  );

  // ----------------------------------------------------
  // Test 3: Static Graph Compilation (compileGraph)
  // ----------------------------------------------------
  console.log('\n--- Test Group 3: Static Compilation Metadata ---');

  const compiled = compileGraph(simplePipelineGraph);
  assert(compiled.id === 'temp-alert-pipeline', 'Retains graph id in compilation output');
  assert(compiled.nodeCount === 4, 'Reports correct node count (4)');
  assert(compiled.edgeCount === 3, 'Reports correct edge count (3)');
  assert(compiled.nodes.length === 4, 'Orders node descriptors array by dependency');
  assert(compiled.nodes[0].id === 'sensor-source', 'First compiled node is dependency source');
  assert(compiled.nodes[3].id === 'alert-action', 'Last compiled node is terminal action');

  // ----------------------------------------------------
  // Test 4: Reactive Stream Pipeline Execution
  // ----------------------------------------------------
  console.log('\n--- Test Group 4: Stream Execution & Operators ---');

  // Stream with 3 inputs:
  // 1. temperature = 50: filtered out (< 60)
  // 2. temperature = 80: passes filter, scaled (80 * 1.05 = 84), alert = false (84 < 90)
  // 3. temperature = 90: passes filter, scaled (90 * 1.05 = 94.5), alert = true (94.5 >= 90)
  const inputTelemetry$ = of(
    { deviceId: 'turbine-1', temperature: 50 },
    { deviceId: 'turbine-1', temperature: 80 },
    { deviceId: 'turbine-1', temperature: 90 }
  );

  const pipelineResults = await lastValueFrom(
    compileGraphToStream(simplePipelineGraph, inputTelemetry$).pipe(toArray())
  );

  assert(pipelineResults.length === 2, 'Filter correctly dropped out-of-range record (< 60)');
  assert(pipelineResults[0].temperature === 84, 'Math node scaled temperature correctly (80 * 1.05 = 84)');
  assert(pipelineResults[0].alert === false, 'Action node evaluated alert=false when below threshold');
  assert(pipelineResults[1].temperature === 94.5, 'Math node scaled temperature correctly (90 * 1.05 = 94.5)');
  assert(pipelineResults[1].alert === true, 'Action node evaluated alert=true when at or above threshold');
  assert(pipelineResults[1].threshold === 90, 'Action node attached threshold value to alert');
  assert(pipelineResults[1].message === 'High temperature alert', 'Action node attached custom alert message');

  // ----------------------------------------------------
  // Test 5: Complex Topologies (Fan-Out & Fan-In)
  // ----------------------------------------------------
  console.log('\n--- Test Group 5: Complex Topologies ---');

  // Fan-Out Graph: One source feeds two parallel branches
  const fanOutGraph = {
    nodes: [
      { id: 'source-node', type: 'source', config: { field: 'vibration' } },
      { id: 'double-math', type: 'math', config: { field: 'vibration', factor: 2 } },
      { id: 'half-math', type: 'math', config: { field: 'vibration', factor: 0.5 } },
    ],
    edges: [
      { source: 'source-node', target: 'double-math' },
      { source: 'source-node', target: 'half-math' },
    ],
  };

  const fanOutResults = await lastValueFrom(
    compileGraphToStream(fanOutGraph, of({ vibration: 10 })).pipe(toArray())
  );

  assert(fanOutResults.length === 2, 'Fan-out splits single stream into two parallel branch outputs');
  const values = fanOutResults.map((r) => r.vibration).sort((a, b) => a - b);
  assert(values[0] === 5 && values[1] === 20, 'Both branches executed mathematical operations accurately (5 and 20)');

  // Fan-In Graph: Two intermediate branches merge into a single action sink
  const fanInGraph = {
    nodes: [
      { id: 'source-main', type: 'source', config: { field: 'pressure' } },
      { id: 'branch-low', type: 'math', config: { field: 'pressure', factor: 1.1 } },
      { id: 'branch-high', type: 'math', config: { field: 'pressure', factor: 1.5 } },
      { id: 'action-sink', type: 'action', config: { field: 'pressure', threshold: 140 } },
    ],
    edges: [
      { source: 'source-main', target: 'branch-low' },
      { source: 'source-main', target: 'branch-high' },
      { source: 'branch-low', target: 'action-sink' },
      { source: 'branch-high', target: 'action-sink' },
    ],
  };

  const fanInResults = await lastValueFrom(
    compileGraphToStream(fanInGraph, of({ pressure: 100 })).pipe(toArray())
  );

  assert(fanInResults.length === 2, 'Fan-in merges parallel branches through the action node');
  assert(fanInResults.some((r) => r.pressure === 110 && r.alert === false), 'Merged branch 1 (110) alert=false');
  assert(fanInResults.some((r) => r.pressure === 150 && r.alert === true), 'Merged branch 2 (150) alert=true');

  // ----------------------------------------------------
  // Test 6: Stream Input Flexibility & Error Guards
  // ----------------------------------------------------
  console.log('\n--- Test Group 6: Input Flexibility & Safety Guards ---');

  // Array input normalization
  const arrayResults = await lastValueFrom(
    compileGraphToStream(
      {
        nodes: [
          { id: 'src', type: 'source', config: {} },
          { id: 'flt', type: 'filter', config: { field: 'temperature', minimum: 70 } },
        ],
        edges: [{ source: 'src', target: 'flt' }],
      },
      [{ temperature: 65 }, { temperature: 75 }]
    ).pipe(toArray())
  );
  assert(arrayResults.length === 1 && arrayResults[0].temperature === 75, 'Automatically normalizes plain Array inputs to RxJS stream');

  // Rejects source node with incoming edge
  assertThrows(
    () => compileGraphToStream(
      {
        nodes: [
          { id: 'src1', type: 'source', config: {} },
          { id: 'src2', type: 'source', config: {} },
        ],
        edges: [{ source: 'src1', target: 'src2' }],
      },
      of({ value: 1 })
    ),
    /Source node src2 cannot have incoming edges/,
    'Rejects source nodes that have incoming edges'
  );

  // Rejects orphaned non-source node
  assertThrows(
    () => compileGraphToStream(
      {
        nodes: [
          { id: 'src', type: 'source', config: {} },
          { id: 'orphan', type: 'filter', config: {} },
        ],
        edges: [],
      },
      of({ value: 1 })
    ),
    /has no connection/,
    'Rejects orphaned nodes without incoming connections'
  );

  // ----------------------------------------------------
  // Test 7: Strict Numeric Validation Guards (nodeOperators)
  // ----------------------------------------------------
  console.log('\n--- Test Group 7: Strict Numeric Validation Guards ---');

  const testPipeline = {
    nodes: [
      { id: 's', type: 'source', config: {} },
      { id: 'm', type: 'math', config: { field: 'temperature', factor: 1 } },
    ],
    edges: [{ source: 's', target: 'm' }],
  };

  const assertStreamThrows = async (payload, description) => {
    try {
      await lastValueFrom(compileGraphToStream(testPipeline, of(payload)));
      console.error(`  ✗ FAIL (Expected throw, but succeeded): ${description}`);
      failedCount++;
    } catch (err) {
      if (/must be a finite number/.test(err.message)) {
        console.log(`  ✓ ${description}`);
        passedCount++;
      } else {
        console.error(`  ✗ FAIL: ${description} (Got unexpected error: ${err.message})`);
        failedCount++;
      }
    }
  };

  await assertStreamThrows({ temperature: '85' }, 'Rejects numeric string ("85")');
  await assertStreamThrows({ temperature: '0' }, 'Rejects numeric string zero ("0")');
  await assertStreamThrows({ temperature: null }, 'Rejects null temperature value');
  await assertStreamThrows({ temperature: undefined }, 'Rejects undefined temperature value');
  await assertStreamThrows({}, 'Rejects missing temperature property (no silent conversion to 0)');
  await assertStreamThrows({ temperature: true }, 'Rejects boolean true');
  await assertStreamThrows({ temperature: false }, 'Rejects boolean false');
  await assertStreamThrows({ temperature: NaN }, 'Rejects NaN temperature value');
  await assertStreamThrows({ temperature: Infinity }, 'Rejects Infinity temperature value');
  await assertStreamThrows({ temperature: -Infinity }, 'Rejects -Infinity temperature value');

  // Verify valid numbers including zero and negative numbers
  const validZeroResult = await lastValueFrom(
    compileGraphToStream(testPipeline, of({ temperature: 0 }))
  );
  assert(validZeroResult.temperature === 0, 'Accepts valid numeric zero (0) without error');

  const validNegativeResult = await lastValueFrom(
    compileGraphToStream(testPipeline, of({ temperature: -12.5 }))
  );
  assert(validNegativeResult.temperature === -12.5, 'Accepts valid negative finite number (-12.5)');

  // ==========================================
  // Summary
  // ==========================================
  console.log('\n==================================================');
  console.log(` Test Results: ${passedCount} passed, ${failedCount} failed`);
  console.log('==================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
};

runTests().catch((error) => {
  console.error('Unhandled test suite error:', error);
  process.exit(1);
});
