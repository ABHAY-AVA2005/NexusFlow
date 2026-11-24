export function serializeGraph(nodes, edges) {
  return {
    nodes: nodes.map((node) => ({
      id: node.id,
      type: node.data?.ruleType || 'source',
      config: node.data?.config || {},
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
    })),
  };
}

export function deserializeGraph(graph) {
  if (!graph || !Array.isArray(graph.nodes)) {
    return { nodes: [], edges: [] };
  }

  const nodes = graph.nodes.map((node, index) => ({
    id: node.id,
    type: 'rule',
    position: node.position || { x: 80 + (index % 3) * 220, y: 80 + Math.floor(index / 3) * 150 },
    data: {
      ruleType: node.type,
      label: node.config?.label || node.type,
      config: node.config || {},
    },
  }));

  const edges = (graph.edges || []).map((edge) => ({
    id: edge.id || `${edge.source}-${edge.target}`,
    source: edge.source,
    target: edge.target,
  }));

  return { nodes, edges };
}
