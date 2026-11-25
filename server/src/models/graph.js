/**
 * @module server/models/graph
 * @description Persists visual rule graphs so active rules can be restored after a
 * backend restart.
 */
const mongoose = require('mongoose');

const graphSchema = new mongoose.Schema({
  graphId: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true, trim: true },
  nodes: { type: Array, required: true },
  edges: { type: Array, required: true, default: [] },
  active: { type: Boolean, required: true, default: true },
}, { timestamps: true });

module.exports = mongoose.models.VisualRule || mongoose.model('VisualRule', graphSchema);
