function validateGraph(graph) {
  if (!graph || typeof graph !== 'object') {
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
    if (!node || typeof node !== 'object') {
      throw new Error('Every node must be an object.');
    }

    if (!node.id || typeof node.id !== 'string') {
      throw new Error('Each node requires a string id.');
    }

    if (nodeIds.has(node.id)) {
      throw new Error(`Duplicate node id detected: ${node.id}`);
    }

    if (!node.type || typeof node.type !== 'string') {
      throw new Error(`Node ${node.id} requires a string type.`);
    }

    if (!node.config || typeof node.config !== 'object') {
      throw new Error(`Node ${node.id} requires a config object.`);
    }

    nodeIds.add(node.id);
  }

  for (const edge of graph.edges) {
    if (!edge || typeof edge !== 'object') {
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
    indegree.set(edge.target, (indegree.get(edge.target) || 0) + 1);
  }

  const queue = [];
  for (const [nodeId, degree] of indegree.entries()) {
    if (degree === 0) {
      queue.push(nodeId);
    }
  }

  const order = [];
  while (queue.length) {
    const current = queue.shift();
    order.push(current);

    for (const nextNode of adjacency.get(current) || []) {
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

  const compiled = {
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

  return compiled;
}

module.exports = {
  validateGraph,
  topologicalSort,
  compileGraph,
};
