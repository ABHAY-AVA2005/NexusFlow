/**
 * Live Visual Rule Registry Service
 *
 * Manages in-memory runtime execution of active visual rules:
 * - Subscribes compiled visual rule graphs to the central RxJS telemetry stream.
 * - Applies pre-graph scope filtering (deviceId, deviceType, location).
 * - Guarantees error isolation between concurrent rules and the central stream.
 * - Prevents duplicate subscriptions and manages complete rule lifecycle.
 *
 * @module services/liveRuleRegistry.service
 */

const { filter } = require('rxjs/operators');
const { getTelemetryStream } = require('./telemetryStream.service');
const { validateGraph, topologicalSort, compileGraphToStream } = require('../compiler/graphCompiler');

/**
 * In-memory registry of active rule subscriptions, keyed by graphId.
 * @type {Map<string, object>}
 * @private
 */
const _activeRules = new Map();

/**
 * Evaluates whether a telemetry record matches the specified rule scope.
 *
 * Scope resolution:
 * - 'all' matches any value for that scope dimension.
 * - Non-'all' values must exactly match the record's metadata.
 *
 * @param {object} scope - Normalized rule scope { deviceId, deviceType, location }.
 * @param {object} record - Telemetry record emitted by the central stream.
 * @returns {boolean} True if matching, false otherwise.
 */
const matchesScope = (scope, record) => {
  if (!scope) return true;
  if (!record || typeof record !== 'object') return false;

  const metadata = record.metadata;
  if (!metadata || typeof metadata !== 'object') {
    return false;
  }

  const ruleDeviceId = scope.deviceId || 'all';
  const ruleDeviceType = scope.deviceType || 'all';
  const ruleLocation = scope.location || 'all';

  if (ruleDeviceId !== 'all' && metadata.deviceId !== ruleDeviceId) {
    return false;
  }
  if (ruleDeviceType !== 'all' && metadata.deviceType !== ruleDeviceType) {
    return false;
  }
  if (ruleLocation !== 'all' && metadata.location !== ruleLocation) {
    return false;
  }

  return true;
};

/**
 * Activates a visual rule and attaches it to the live telemetry stream.
 *
 * @param {object} rule - Rule definition (Mongoose model instance or plain object).
 * @param {object} [options={}] - Optional configuration and event hooks.
 * @param {Function} [options.onResult] - Callback invoked with each compiled output record.
 * @param {Function} [options.onAlert] - Callback invoked when an action node triggers alert: true.
 * @param {Function} [options.onError] - Callback invoked on pipeline or handler error.
 * @param {import('rxjs').Observable} [options.telemetry$] - Optional telemetry stream override.
 * @returns {object} Activation metadata summary.
 * @throws {Error} If rule is invalid, already active, or fails graph compilation.
 */
const activateRule = (rule, options = {}) => {
  if (!rule || typeof rule !== 'object' || Array.isArray(rule)) {
    throw new Error('Rule must be a valid non-null object.');
  }

  // Normalize Mongoose document if provided
  const rawRule = typeof rule.toObject === 'function' ? rule.toObject() : rule;

  const graphId = (rawRule.graphId || rawRule.id || '').toString().trim();
  if (!graphId) {
    throw new Error('Rule graphId is required and must be a non-empty string.');
  }

  // Prevent duplicate subscriptions: only live, non-errored subscriptions block activation
  const existingEntry = _activeRules.get(graphId);
  if (existingEntry) {
    const isLive = existingEntry.status !== 'error' &&
                   existingEntry.subscription &&
                   !existingEntry.subscription.closed;
    if (isLive) {
      throw new Error(`Rule with graphId "${graphId}" is already active.`);
    }
    _activeRules.delete(graphId);
  }

  // Normalize nodes and configs
  const plainNodes = Array.isArray(rawRule.nodes)
    ? rawRule.nodes.map((node) => {
        if (node && typeof node.toObject === 'function') {
          const obj = node.toObject();
          if (!obj.config || typeof obj.config !== 'object' || Array.isArray(obj.config)) {
            obj.config = {};
          }
          return obj;
        }
        return {
          ...node,
          config: node && typeof node.config === 'object' && !Array.isArray(node.config) ? node.config : {}
        };
      })
    : [];

  const plainEdges = Array.isArray(rawRule.edges)
    ? rawRule.edges.map((edge) => (edge && typeof edge.toObject === 'function' ? edge.toObject() : { ...edge }))
    : [];

  const graphPayload = {
    id: graphId,
    nodes: plainNodes,
    edges: plainEdges
  };

  // Pre-validate graph topology and cycle prevention before subscription
  validateGraph(graphPayload);
  topologicalSort(graphPayload);

  // Normalize scope
  const rawScope = rawRule.scope && typeof rawRule.scope.toObject === 'function'
    ? rawRule.scope.toObject()
    : (rawRule.scope || {});

  const normalizedScope = {
    deviceId: typeof rawScope.deviceId === 'string' && rawScope.deviceId.trim() ? rawScope.deviceId.trim() : 'all',
    deviceType: typeof rawScope.deviceType === 'string' && rawScope.deviceType.trim() ? rawScope.deviceType.trim() : 'all',
    location: typeof rawScope.location === 'string' && rawScope.location.trim() ? rawScope.location.trim() : 'all'
  };

  // Base telemetry source: defaults to singleton central telemetry stream
  const baseTelemetry$ = options.telemetry$ || getTelemetryStream();

  // Apply scope filtering before graph execution
  const scopedTelemetry$ = baseTelemetry$.pipe(
    filter((record) => matchesScope(normalizedScope, record))
  );

  // Compile visual rule graph to reactive RxJS stream pipeline
  const ruleStream$ = compileGraphToStream(graphPayload, scopedTelemetry$);

  const registryEntry = {
    graphId,
    name: (rawRule.name || 'Untitled Rule').toString().trim(),
    scope: normalizedScope,
    subscription: null,
    rule: rawRule,
    lastResult: null,
    executionCount: 0,
    alertCount: 0,
    status: 'active',
    activatedAt: new Date()
  };

  // Declare subscription variable with let prior to subscribe() to prevent Temporal Dead Zone (TDZ)
  // if an unhandled error is dispatched synchronously during subscription construction.
  let subscription = null;

  // Subscribe to rule output with strict error isolation
  subscription = ruleStream$.subscribe({
    next: (result) => {
      try {
        registryEntry.executionCount += 1;
        registryEntry.lastResult = result;

        if (result && result.alert) {
          registryEntry.alertCount += 1;
        }

        if (typeof options.onResult === 'function') {
          options.onResult(result);
        }

        if (result && result.alert && typeof options.onAlert === 'function') {
          options.onAlert(result);
        }
      } catch (handlerErr) {
        if (typeof options.onError === 'function') {
          try {
            options.onError(handlerErr);
          } catch (_) {}
        }
      }
    },
    error: (streamErr) => {
      registryEntry.status = 'error';
      registryEntry.lastError = streamErr ? streamErr.message : 'Unknown stream error';

      // Preserve onError callback and protect registry if onError throws
      if (typeof options.onError === 'function') {
        try {
          options.onError(streamErr);
        } catch (_) {}
      }

      // Identity-safe cleanup: delete from registry ONLY if the current entry references this exact subscription
      const currentEntry = _activeRules.get(graphId);
      if (currentEntry && subscription && currentEntry.subscription === subscription) {
        _activeRules.delete(graphId);
      }
    },
    complete: () => {
      registryEntry.status = 'completed';
    }
  });

  registryEntry.subscription = subscription;

  // Only store in registry if subscription did not fail synchronously
  if (subscription && !subscription.closed && registryEntry.status !== 'error') {
    _activeRules.set(graphId, registryEntry);
  }

  return {
    graphId,
    name: registryEntry.name,
    scope: registryEntry.scope,
    activated: true,
    activatedAt: registryEntry.activatedAt
  };
};

/**
 * Deactivates an active rule, tearing down its subscription and removing it from the registry.
 *
 * @param {string} graphId - Unique identifier of the rule to deactivate.
 * @returns {boolean} True if rule was active and deactivated; false if not found.
 */
const deactivateRule = (graphId) => {
  if (!graphId || typeof graphId !== 'string') {
    return false;
  }
  const cleanId = graphId.trim();
  const entry = _activeRules.get(cleanId);
  if (!entry) {
    return false;
  }

  if (entry.subscription && typeof entry.subscription.unsubscribe === 'function') {
    entry.subscription.unsubscribe();
  }

  _activeRules.delete(cleanId);
  return true;
};

/**
 * Checks if a rule is currently active.
 *
 * @param {string} graphId - Unique identifier of the rule.
 * @returns {boolean} True if rule exists and has an active, unclosed subscription.
 */
const isRuleActive = (graphId) => {
  if (!graphId || typeof graphId !== 'string') return false;
  const cleanId = graphId.trim();
  const entry = _activeRules.get(cleanId);
  if (!entry) return false;
  if (entry.status === 'error' || !entry.subscription || entry.subscription.closed) {
    _activeRules.delete(cleanId);
    return false;
  }
  return true;
};

/**
 * Returns an array of all currently active graphIds with live subscriptions.
 *
 * @returns {string[]}
 */
const getActiveRuleIds = () => {
  const activeIds = [];
  for (const [id, entry] of _activeRules.entries()) {
    if (entry && entry.status !== 'error' && entry.subscription && !entry.subscription.closed) {
      activeIds.push(id);
    } else {
      _activeRules.delete(id);
    }
  }
  return activeIds;
};

/**
 * Returns summary details for a specific active rule.
 *
 * @param {string} graphId - Unique identifier of the rule.
 * @returns {object|null}
 */
const getActiveRule = (graphId) => {
  if (!graphId || typeof graphId !== 'string') return null;
  const cleanId = graphId.trim();
  const entry = _activeRules.get(cleanId);
  if (!entry) return null;
  if (entry.status === 'error' || !entry.subscription || entry.subscription.closed) {
    _activeRules.delete(cleanId);
    return null;
  }

  return {
    graphId: entry.graphId,
    name: entry.name,
    scope: entry.scope,
    executionCount: entry.executionCount,
    alertCount: entry.alertCount,
    lastResult: entry.lastResult,
    activatedAt: entry.activatedAt
  };
};

/**
 * Returns an array of summary objects for all currently active rules.
 *
 * @returns {object[]}
 */
const getActiveRules = () => {
  const activeList = [];
  for (const [id, entry] of _activeRules.entries()) {
    if (entry && entry.status !== 'error' && entry.subscription && !entry.subscription.closed) {
      activeList.push({
        graphId: entry.graphId,
        name: entry.name,
        scope: entry.scope,
        executionCount: entry.executionCount,
        alertCount: entry.alertCount,
        lastResult: entry.lastResult,
        activatedAt: entry.activatedAt
      });
    } else {
      _activeRules.delete(id);
    }
  }
  return activeList;
};

/**
 * Returns the count of currently active rules with live subscriptions.
 *
 * @returns {number}
 */
const getActiveRuleCount = () => {
  let count = 0;
  for (const [id, entry] of _activeRules.entries()) {
    if (entry && entry.status !== 'error' && entry.subscription && !entry.subscription.closed) {
      count += 1;
    } else {
      _activeRules.delete(id);
    }
  }
  return count;
};

/**
 * Clears all active rules, cleanly unsubscribing each from the telemetry stream.
 */
const clearRegistry = () => {
  for (const entry of _activeRules.values()) {
    if (entry.subscription && typeof entry.subscription.unsubscribe === 'function') {
      entry.subscription.unsubscribe();
    }
  }
  _activeRules.clear();
};

module.exports = {
  activateRule,
  deactivateRule,
  isRuleActive,
  getActiveRuleIds,
  getActiveRule,
  getActiveRules,
  getActiveRuleCount,
  clearRegistry,
  matchesScope
};
