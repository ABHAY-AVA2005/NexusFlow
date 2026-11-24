const { randomUUID } = require('crypto');
const { Subject } = require('rxjs');
const { compileGraph, compileGraphToStream } = require('../compiler/graphCompiler');
const { dispatchActionAlert } = require('../alerting/alertService');
const { broadcastAlert } = require('../ws/telemetryServer');

function createLiveRuleRegistry({
  dispatchAlert = dispatchActionAlert,
  publishAlert = broadcastAlert,
  logger = console,
} = {}) {
  const activeRules = new Map();

  function activateRuleGraph(graph) {
    const compiled = compileGraph(graph);
    if (compiled.nodeCount === 0) {
      throw new Error('Cannot activate an empty rule graph.');
    }

    if (graph.id !== undefined && (typeof graph.id !== 'string' || !graph.id.trim())) {
      throw new Error('Graph id must be a non-empty string when provided.');
    }

    const graphId = graph.id ? graph.id.trim() : randomUUID();
    if (activeRules.has(graphId)) {
      throw new Error(`Rule graph is already active: ${graphId}`);
    }

    const telemetry$ = new Subject();
    const stream = compileGraphToStream(graph, telemetry$);
    const subscription = stream.subscribe({
      next: (result) => {
        if (!result || !result.alert) {
          return;
        }

        Promise.resolve(dispatchAlert({
          message: result.message || 'Rule threshold exceeded',
          telemetry: result,
        }))
          .then((dispatch) => publishAlert(dispatch.payload))
          .catch((error) => {
            logger.error(`Failed to dispatch live rule alert for "${graphId}": ${error.message}`);
          });
      },
      error: (error) => {
        activeRules.delete(graphId);
        logger.error(`Live rule "${graphId}" stopped: ${error.message}`);
      },
    });

    activeRules.set(graphId, { telemetry$, subscription });
    return { graphId, compiled };
  }

  function deactivateRuleGraph(graphId) {
    const activeRule = activeRules.get(graphId);
    if (!activeRule) {
      return false;
    }

    activeRule.subscription.unsubscribe();
    activeRule.telemetry$.complete();
    activeRules.delete(graphId);
    return true;
  }

  function processTelemetry(record) {
    for (const { telemetry$ } of activeRules.values()) {
      telemetry$.next(record);
    }
  }

  return {
    activateRuleGraph,
    deactivateRuleGraph,
    processTelemetry,
  };
}

const liveRuleRegistry = createLiveRuleRegistry();

module.exports = {
  createLiveRuleRegistry,
  ...liveRuleRegistry,
};
