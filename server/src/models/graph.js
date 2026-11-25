/**
 * @module server/models/graph
 * @description Represents a visual graph while it is held in memory. It provides a small
 * document-style interface before or instead of MongoDB graph persistence.
 */
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
