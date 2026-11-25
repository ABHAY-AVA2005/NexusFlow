/**
 * @module server/compiler/graphCompiler
 * @description Validates visual rule graphs and compiles them into ordered RxJS execution streams.
 */
const { merge, from } = require('rxjs');
const { getNodeOperator } = require('./nodeOperators');

const NODE_TYPES = new Set(['source', 'math', 'filter', 'action']);

function validateGraph(graph) {
  if (!graph || typeof graph !== 'object' || Array.isArray(graph)) {
    throw new Error('Graph payload must be an object.');
  }

  if (!Array.isArray(graph.nodes)) {
    throw new Error('Graph nodes must be an array.');
  }

  if (!Array.isArray(graph.edges)) {
    throw new Error('Graph edges must be an array.');
  }

  const nodeIds = new Set();

  for (const node of graph.nodes) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) {
      throw new Error('Every node must be an object.');
    }

    if (!node.id || typeof node.id !== 'string') {
      throw new Error('Each node requires a string id.');
    }

    if (nodeIds.has(node.id)) {
      throw new Error(`Duplicate node id detected: ${node.id}`);
    }

    if (!NODE_TYPES.has(node.type)) {
      throw new Error(`Node ${node.id} has unsupported type: ${node.type}`);
    }

    if (!node.config || typeof node.config !== 'object' || Array.isArray(node.config)) {
      throw new Error(`Node ${node.id} requires a config object.`);
    }

    nodeIds.add(node.id);
  }

  for (const edge of graph.edges) {
    if (!edge || typeof edge !== 'object' || Array.isArray(edge)) {
      throw new Error('Every edge must be an object.');
    }

    if (!edge.source || typeof edge.source !== 'string') {
      throw new Error('Each edge requires a string source.');
    }

    if (!edge.target || typeof edge.target !== 'string') {
      throw new Error('Each edge requires a string target.');
    }

    if (!nodeIds.has(edge.source)) {
      throw new Error(`Edge source not found: ${edge.source}`);
    }

    if (!nodeIds.has(edge.target)) {
      throw new Error(`Edge target not found: ${edge.target}`);
    }
  }

  return true;
}

function topologicalSort(graph) {
  validateGraph(graph);

  const adjacency = new Map();
  const indegree = new Map();

  for (const node of graph.nodes) {
    adjacency.set(node.id, []);
    indegree.set(node.id, 0);
  }

  for (const edge of graph.edges) {
    adjacency.get(edge.source).push(edge.target);
    indegree.set(edge.target, indegree.get(edge.target) + 1);
  }

  const queue = [];
  for (const [nodeId, degree] of indegree.entries()) {
    if (degree === 0) {
      queue.push(nodeId);
    }
  }

  const order = [];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor];
    order.push(current);

    for (const nextNode of adjacency.get(current)) {
      indegree.set(nextNode, indegree.get(nextNode) - 1);
      if (indegree.get(nextNode) === 0) {
        queue.push(nextNode);
      }
    }
  }

  if (order.length !== graph.nodes.length) {
    throw new Error('Graph contains a cycle and cannot be compiled.');
  }

  return order;
}

function compileGraph(graph) {
  validateGraph(graph);

  const orderedNodes = topologicalSort(graph);
  const lookup = new Map(graph.nodes.map((node) => [node.id, node]));

  return {
    id: graph.id || 'graph-default',
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
    order: orderedNodes,
    nodes: orderedNodes.map((nodeId) => ({
      id: nodeId,
      type: lookup.get(nodeId).type,
      config: lookup.get(nodeId).config,
    })),
  };
}

function normalizeTelemetryStream(telemetry$) {
  if (!telemetry$) {
    throw new Error('Telemetry input must be an RxJS Observable or iterable of records.');
  }

  if (typeof telemetry$.pipe === 'function') {
    return telemetry$;
  }

  if (Array.isArray(telemetry$) || typeof telemetry$[Symbol.iterator] === 'function') {
    return from(telemetry$);
  }

  throw new Error('Telemetry input must be an RxJS Observable or iterable of records.');
}

function compileGraphToStream(graph, telemetry$) {
  const telemetryStream = normalizeTelemetryStream(telemetry$);

  const compiled = compileGraph(graph);
  const incoming = new Map(compiled.nodes.map((node) => [node.id, []]));
  const outgoing = new Map(compiled.nodes.map((node) => [node.id, []]));

  for (const edge of graph.edges) {
    incoming.get(edge.target).push(edge.source);
    outgoing.get(edge.source).push(edge.target);
  }

  const streams = new Map();

  for (const node of compiled.nodes) {
    const sources = incoming.get(node.id);

    if (node.type === 'source') {
      if (sources.length > 0) {
        throw new Error(`Source node ${node.id} cannot have incoming edges.`);
      }
      streams.set(node.id, telemetryStream.pipe(getNodeOperator(node)));
      continue;
    }

    if (sources.length === 0) {
      throw new Error(`Non-source node ${node.id} must have an incoming edge.`);
    }

    const parents = sources.map((sourceId) => streams.get(sourceId));
    const input$ = parents.length === 1 ? parents[0] : merge(...parents);
    streams.set(node.id, input$.pipe(getNodeOperator(node)));
  }

  const outputStreams = compiled.nodes
    .filter((node) => outgoing.get(node.id).length === 0)
    .map((node) => streams.get(node.id));

  return outputStreams.length === 1 ? outputStreams[0] : merge(...outputStreams);
}

module.exports = {
  validateGraph,
  topologicalSort,
  compileGraph,
  compileGraphToStream,
};
