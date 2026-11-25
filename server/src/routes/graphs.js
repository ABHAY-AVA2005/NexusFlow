/**
 * @module server/routes/graphs
 * @description Maps visual-rule URLs to their handlers. It separates checking a graph,
 * testing it once, and keeping it active for continuous incoming telemetry.
 */
const express = require('express');
const { compileGraph } = require('../compiler/graphCompiler');
const { createRuleEngine } = require('../engine/ruleEngine');
const { activateRuleGraph, deactivateRuleGraph } = require('../engine/liveRuleRegistry');
const { dispatchActionAlert } = require('../alerting/alertService');
const { broadcastAlert } = require('../ws/telemetryServer');
const SavedGraph = require('../models/graph');
const mongoose = require('mongoose');

const router = express.Router();

router.get('/active', (req, res) => {
  const { listActiveRules } = require('../engine/liveRuleRegistry');
  res.json({ ok: true, rules: listActiveRules() });
});

router.get('/sample', (req, res) => {
  res.json({
    nodes: [
      { id: 'source-1', type: 'source', config: { field: 'temperature', machineId: 'all' } },
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

router.post('/activate', async (req, res) => {
  try {
    const result = activateRuleGraph(req.body || {});
    if (mongoose.connection.readyState === 1) {
      try {
        await SavedGraph.findOneAndUpdate(
          { graphId: result.graphId },
          {
            graphId: result.graphId,
            name: req.body.name || 'Untitled live rule',
            nodes: req.body.nodes || [],
            edges: req.body.edges || [],
            active: true,
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
      } catch (error) {
        console.error(`Could not persist rule "${result.graphId}": ${error.message}`);
      }
    }
    res.status(201).json({ ok: true, ...result });
  } catch (error) {
    res.status(400).json({ ok: false, message: error.message });
  }
});

router.delete('/activate/:graphId', async (req, res) => {
  const stopped = deactivateRuleGraph(req.params.graphId);
  if (!stopped) {
    return res.status(404).json({ ok: false, message: 'Active rule graph not found.' });
  }

  if (mongoose.connection.readyState === 1) {
    try {
      await SavedGraph.deleteOne({ graphId: req.params.graphId });
    } catch (error) {
      console.error(`Could not delete persisted rule "${req.params.graphId}": ${error.message}`);
    }
  }

  return res.json({ ok: true, graphId: req.params.graphId });
});

router.post('/execute', async (req, res) => {
  try {
    const { graph, telemetry } = req.body || {};
    const engine = createRuleEngine(graph || {});
    const result = await engine.processTelemetry(telemetry || {});

    let alertDispatch = null;
    if (result && result.alert) {
      alertDispatch = await dispatchActionAlert({
        message: result.message || 'Rule threshold exceeded',
        telemetry: result,
      });
      broadcastAlert(alertDispatch.payload);
    }

    res.json({ ok: true, result, alertDispatch, compiled: engine.compiled });
  } catch (error) {
    res.status(400).json({ ok: false, message: error.message });
  }
});

module.exports = router;
