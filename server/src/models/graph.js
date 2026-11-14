class GraphModel {
  constructor({ id, name, nodes = [], edges = [] }) {
    this.id = id || `graph-${Date.now()}`;
    this.name = name || 'Untitled graph';
    this.nodes = nodes;
    this.edges = edges;
    this.createdAt = new Date().toISOString();
  }
}

module.exports = GraphModel;
