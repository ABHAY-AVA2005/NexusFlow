const test = require('node:test');
const assert = require('node:assert/strict');
const { of, toArray } = require('rxjs');
const { lastValueFrom } = require('rxjs');
const { compileGraph, compileGraphToStream } = require('../src/compiler/graphCompiler');
const { createRuleEngine } = require('../src/engine/ruleEngine');

const thresholdGraph = {
  nodes: [
    { id: 'sensor', type: 'source', config: { field: 'temperature' } },
    { id: 'filter', type: 'filter', config: { field: 'temperature', minimum: 80 } },
    { id: 'alert', type: 'action', config: { field: 'temperature', threshold: 85 } },
  ],
  edges: [
    { source: 'sensor', target: 'filter' },
    { source: 'filter', target: 'alert' },
  ],
};

test('compiles nodes in dependency order regardless of input order', () => {
  const graph = {
    nodes: [...thresholdGraph.nodes].reverse(),
    edges: thresholdGraph.edges,
  };

  assert.deepEqual(compileGraph(graph).order, ['sensor', 'filter', 'alert']);
});

test('rejects graphs with missing edge endpoints and cycles', () => {
  assert.throws(
    () => compileGraph({ nodes: thresholdGraph.nodes, edges: [{ source: 'missing', target: 'filter' }] }),
    /Edge source not found/
  );
  assert.throws(
    () => compileGraph({
      nodes: thresholdGraph.nodes,
      edges: [...thresholdGraph.edges, { source: 'alert', target: 'sensor' }],
    }),
    /cycle/
  );
});

test('executes a graph as an RxJS stream and filters telemetry by graph path', async () => {
  const results = await lastValueFrom(
    compileGraphToStream(
      thresholdGraph,
      of({ temperature: 75 }, { temperature: 82 }, { temperature: 90 })
    ).pipe(toArray())
  );

  assert.deepEqual(results, [
    { temperature: 82, alert: false },
    { temperature: 90, alert: true, message: 'Threshold exceeded' },
  ]);
});

test('exposes single-record processing through the rule engine', async () => {
  const engine = createRuleEngine(thresholdGraph);

  assert.deepEqual(
    await engine.processTelemetry({ temperature: 88 }),
    { temperature: 88, alert: true, message: 'Threshold exceeded' }
  );
  assert.equal(await engine.processTelemetry({ temperature: 70 }), null);
});

test('merges fan-out branches and runs each branch operator', async () => {
  const graph = {
    nodes: [
      { id: 'sensor', type: 'source', config: {} },
      { id: 'double', type: 'math', config: { field: 'temperature', factor: 2 } },
      { id: 'threshold', type: 'filter', config: { field: 'temperature', minimum: 40 } },
    ],
    edges: [
      { source: 'sensor', target: 'double' },
      { source: 'sensor', target: 'threshold' },
    ],
  };
  const results = await lastValueFrom(
    compileGraphToStream(graph, of({ temperature: 45 })).pipe(toArray())
  );

  assert.deepEqual(results, [
    { temperature: 90 },
    { temperature: 45 },
  ]);
});
