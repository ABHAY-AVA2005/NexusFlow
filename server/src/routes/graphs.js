const express = require('express');
const { compileGraph } = require('../compiler/graphCompiler');
const { createRuleEngine } = require('../engine/ruleEngine');

const router = express.Router();

router.get('/sample', (req, res) => {
  res.json({
    nodes: [
      { id: 'source-1', type: 'source', config: { field: 'temperature' } },
      { id: 'filter-1', type: 'filter', config: { field: 'temperature', minimum: 80 } },
      { id: 'action-1', type: 'action', config: { field: 'temperature', threshold: 85, message: 'High temperature alert' } },
    ],
    edges: [
      { source: 'source-1', target: 'filter-1' },
      { source: 'filter-1', target: 'action-1' },
    ],
  });
});

router.post('/compile', (req, res) => {
  try {
    const compiled = compileGraph(req.body || {});
    res.json({ ok: true, compiled });
  } catch (error) {
    res.status(400).json({ ok: false, message: error.message });
  }
});

router.post('/execute', (req, res) => {
  try {
    const { graph, telemetry } = req.body || {};
    const engine = createRuleEngine(graph || {});
    const result = engine.processTelemetry(telemetry || {});

    res.json({ ok: true, result, compiled: engine.compiled });
  } catch (error) {
    res.status(400).json({ ok: false, message: error.message });
  }
});

module.exports = router;
