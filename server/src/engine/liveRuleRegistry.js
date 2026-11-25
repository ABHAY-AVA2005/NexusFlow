/**
 * @module server/engine/liveRuleRegistry
 * @description Keeps a list of rules that are currently running. Every new telemetry
 * reading is sent through all active rules, while alerts are emitted only for rules
 * that match the incoming values.
 */
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
    const sourceNode = (graph.nodes || []).find((node) => node.type === 'source');
    const machineId = sourceNode?.config?.machineId || 'all';
    const subscription = stream.subscribe({
      next: (result) => {
        if (!result || !result.alert) {
          return;
        }

        Promise.resolve(dispatchAlert({
          message: result.message || 'Rule threshold exceeded',
          telemetry: result,
          ruleName: graph.name || 'Untitled live rule',
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

    activeRules.set(graphId, {
      telemetry$,
      subscription,
      name: graph.name || 'Untitled live rule',
      machineId,
      graph,
    });
    return { graphId, compiled, name: graph.name || 'Untitled live rule', machineId };
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
    const recordMachineId = record?.sensorId || record?.deviceId || record?.metadata?.deviceId;
    for (const { telemetry$, machineId } of activeRules.values()) {
      if (machineId !== 'all' && recordMachineId !== machineId) {
        continue;
      }
      telemetry$.next(record);
    }
  }

  function listActiveRules() {
    return Array.from(activeRules.entries()).map(([graphId, rule]) => ({
      graphId,
      name: rule.name,
      machineId: rule.machineId,
      graph: rule.graph,
    }));
  }

  return {
    activateRuleGraph,
    deactivateRuleGraph,
    processTelemetry,
    listActiveRules,
  };
}

const liveRuleRegistry = createLiveRuleRegistry();

module.exports = {
  createLiveRuleRegistry,
  ...liveRuleRegistry,
};
