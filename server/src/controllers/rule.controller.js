/**
 * Visual Rule CRUD and Lifecycle Controller
 *
 * Implements REST endpoints for visual rule graph management and execution:
 * - POST   /api/rules              Create a new rule (defaults to inactive)
 * - GET    /api/rules              Retrieve all rules (with optional filtering and live state)
 * - GET    /api/rules/:graphId     Retrieve single rule by graphId
 * - PUT    /api/rules/:graphId     Update rule definition (strictly blocked if rule is active)
 * - PATCH  /api/rules/:graphId/activate    Activate rule and bind to central telemetry stream
 * - PATCH  /api/rules/:graphId/deactivate  Deactivate rule and detach from stream
 * - DELETE /api/rules/:graphId     Delete rule and clean up active subscription
 *
 * @module controllers/rule.controller
 */

const Rule = require('../models/rule.model');
const liveRuleRegistry = require('../services/liveRuleRegistry.service');

/**
 * Creates a new visual rule in MongoDB.
 * Rules are created with active: false by default.
 *
 * @route   POST /api/rules
 */
const createRule = async (req, res, next) => {
  try {
    const payload = req.body;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return res.status(400).json({
        status: 'error',
        message: 'Request body must be a valid JSON object.'
      });
    }

    const graphId = (payload.graphId || '').toString().trim();
    if (!graphId) {
      return res.status(400).json({
        status: 'error',
        message: 'graphId is required and must be a non-empty string.'
      });
    }

    const name = (payload.name || '').toString().trim();
    if (!name) {
      return res.status(400).json({
        status: 'error',
        message: 'Rule name is required and must be a non-empty string.'
      });
    }

    // Never allow client to inject internal fields or force active on create
    const ruleDoc = new Rule({
      graphId,
      name,
      description: payload.description ? String(payload.description).trim() : '',
      scope: payload.scope || undefined,
      nodes: payload.nodes || [],
      edges: payload.edges || [],
      active: false
    });

    // Document-level .save() invokes pre('validate') for graph topological and cycle checks
    const savedRule = await ruleDoc.save();

    return res.status(201).json({
      status: 'success',
      message: 'Rule created successfully',
      data: savedRule
    });
  } catch (error) {
    // Duplicate graphId index violation
    if (error.code === 11000) {
      return res.status(409).json({
        status: 'error',
        message: `Rule with graphId "${req.body && req.body.graphId}" already exists.`
      });
    }

    // Mongoose schema / topological sort validation error
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors || {}).map((err) => err.message);
      return res.status(400).json({
        status: 'error',
        message: error.message,
        errors: messages.length > 0 ? messages : [error.message]
      });
    }

    console.error('[RuleController] createRule error:', error.message);
    next(error);
  }
};

/**
 * Retrieves all visual rules from MongoDB.
 * Enriches each document with current in-memory registry status.
 *
 * @route   GET /api/rules
 */
const getAllRules = async (req, res, next) => {
  try {
    const query = {};

    if (req.query.active !== undefined) {
      query.active = req.query.active === 'true';
    }

    if (req.query.deviceId && typeof req.query.deviceId === 'string') {
      query['scope.deviceId'] = req.query.deviceId.trim();
    }

    if (req.query.location && typeof req.query.location === 'string') {
      query['scope.location'] = req.query.location.trim();
    }

    const rules = await Rule.find(query).sort({ createdAt: -1 });

    const data = rules.map((rule) => {
      const plain = rule.toObject();
      const isLive = liveRuleRegistry.isRuleActive(plain.graphId);
      return {
        ...plain,
        isLive,
        runtime: isLive ? liveRuleRegistry.getActiveRule(plain.graphId) : null
      };
    });

    return res.status(200).json({
      status: 'success',
      count: data.length,
      data
    });
  } catch (error) {
    console.error('[RuleController] getAllRules error:', error.message);
    next(error);
  }
};

/**
 * Retrieves a single visual rule by its graphId.
 *
 * @route   GET /api/rules/:graphId
 */
const getRuleByGraphId = async (req, res, next) => {
  try {
    const graphId = (req.params.graphId || '').toString().trim();
    if (!graphId) {
      return res.status(400).json({
        status: 'error',
        message: 'A valid graphId parameter is required.'
      });
    }

    const rule = await Rule.findOne({ graphId });
    if (!rule) {
      return res.status(404).json({
        status: 'error',
        message: `Rule with graphId "${graphId}" not found.`
      });
    }

    const isLive = liveRuleRegistry.isRuleActive(graphId);
    const data = {
      ...rule.toObject(),
      isLive,
      runtime: isLive ? liveRuleRegistry.getActiveRule(graphId) : null
    };

    return res.status(200).json({
      status: 'success',
      data
    });
  } catch (error) {
    console.error('[RuleController] getRuleByGraphId error:', error.message);
    next(error);
  }
};

/**
 * Updates an existing visual rule.
 * Graph definition updates to active rules are strictly rejected with HTTP 409.
 * Uses document-level .save() to guarantee pre('validate') topological checks.
 *
 * @route   PUT /api/rules/:graphId
 */
const updateRule = async (req, res, next) => {
  try {
    const graphId = (req.params.graphId || '').toString().trim();
    if (!graphId) {
      return res.status(400).json({
        status: 'error',
        message: 'A valid graphId parameter is required.'
      });
    }

    const payload = req.body;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return res.status(400).json({
        status: 'error',
        message: 'Request body must be a valid JSON object.'
      });
    }

    const rule = await Rule.findOne({ graphId });
    if (!rule) {
      return res.status(404).json({
        status: 'error',
        message: `Rule with graphId "${graphId}" not found.`
      });
    }

    // Reject updates to rules that are currently active in the registry or marked active
    if (liveRuleRegistry.isRuleActive(graphId) || rule.active) {
      return res.status(409).json({
        status: 'error',
        message: `Cannot update active rule "${graphId}". Deactivate the rule before editing its definition.`
      });
    }

    // graphId is immutable during updates
    if (payload.graphId !== undefined && payload.graphId.toString().trim() !== graphId) {
      return res.status(400).json({
        status: 'error',
        message: 'graphId is immutable and cannot be modified.'
      });
    }

    // Apply mutable fields only
    if (payload.name !== undefined) {
      const name = payload.name.toString().trim();
      if (!name) {
        return res.status(400).json({
          status: 'error',
          message: 'Rule name cannot be empty.'
        });
      }
      rule.name = name;
    }

    if (payload.description !== undefined) {
      rule.description = String(payload.description).trim();
    }

    if (payload.scope !== undefined) {
      rule.scope = payload.scope;
    }

    if (payload.nodes !== undefined) {
      rule.nodes = payload.nodes;
    }

    if (payload.edges !== undefined) {
      rule.edges = payload.edges;
    }

    // Never allow updating _id, graphId, createdAt, updatedAt, or active via PUT
    // Document-level .save() executes pre('validate') Kahn's algorithm and schema validators
    const updatedRule = await rule.save();

    return res.status(200).json({
      status: 'success',
      message: 'Rule updated successfully',
      data: updatedRule
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors || {}).map((err) => err.message);
      return res.status(400).json({
        status: 'error',
        message: error.message,
        errors: messages.length > 0 ? messages : [error.message]
      });
    }

    console.error('[RuleController] updateRule error:', error.message);
    next(error);
  }
};

/**
 * Activates a visual rule and subscribes it to the live central telemetry stream.
 * Rolls back the in-memory subscription if database persistence fails.
 *
 * @route   PATCH /api/rules/:graphId/activate
 */
const activateRuleHandler = async (req, res, next) => {
  try {
    const graphId = (req.params.graphId || '').toString().trim();
    if (!graphId) {
      return res.status(400).json({
        status: 'error',
        message: 'A valid graphId parameter is required.'
      });
    }

    const rule = await Rule.findOne({ graphId });
    if (!rule) {
      return res.status(404).json({
        status: 'error',
        message: `Rule with graphId "${graphId}" not found.`
      });
    }

    // Check if already active in registry
    if (liveRuleRegistry.isRuleActive(graphId)) {
      return res.status(409).json({
        status: 'error',
        message: `Rule "${graphId}" is already active in the live registry.`
      });
    }

    // Step 1: Activate rule in memory
    let activationSummary;
    try {
      activationSummary = liveRuleRegistry.activateRule(rule);
      if (activationSummary === false || (activationSummary && activationSummary.activated === false)) {
        return res.status(400).json({
          status: 'error',
          message: `Failed to activate rule "${graphId}" in live registry.`
        });
      }
    } catch (compileError) {
      return res.status(400).json({
        status: 'error',
        message: `Failed to compile and activate rule: ${compileError.message}`
      });
    }

    // Step 2: Persist active status in MongoDB
    try {
      rule.active = true;
      await rule.save();
    } catch (dbError) {
      // Compensating transaction: roll back in-memory subscription
      liveRuleRegistry.deactivateRule(graphId);
      console.error(`[RuleController] Failed to persist active state for "${graphId}", subscription rolled back:`, dbError.message);
      return res.status(500).json({
        status: 'error',
        message: 'Failed to update rule activation state in database. Live subscription rolled back.'
      });
    }

    return res.status(200).json({
      status: 'success',
      message: `Rule "${graphId}" activated successfully`,
      data: {
        graphId,
        active: true,
        activation: activationSummary
      }
    });
  } catch (error) {
    console.error('[RuleController] activateRuleHandler error:', error.message);
    next(error);
  }
};

/**
 * Deactivates an active visual rule, detaching it from the live telemetry stream.
 * Idempotently cleans up in-memory subscription and updates MongoDB active flag.
 *
 * @route   PATCH /api/rules/:graphId/deactivate
 */
const deactivateRuleHandler = async (req, res, next) => {
  try {
    const graphId = (req.params.graphId || '').toString().trim();
    if (!graphId) {
      return res.status(400).json({
        status: 'error',
        message: 'A valid graphId parameter is required.'
      });
    }

    const rule = await Rule.findOne({ graphId });
    if (!rule) {
      return res.status(404).json({
        status: 'error',
        message: `Rule with graphId "${graphId}" not found.`
      });
    }

    // Step 1: Teardown subscription from in-memory registry
    const wasLiveInRegistry = liveRuleRegistry.deactivateRule(graphId);

    // Step 2: Persist inactive state in MongoDB
    try {
      rule.active = false;
      await rule.save();
    } catch (dbError) {
      let compensationError = null;
      let restored = false;

      // Compensating action: If the rule was live, restore its subscription to preserve state alignment
      if (wasLiveInRegistry) {
        try {
          const activationResult = liveRuleRegistry.activateRule(rule);
          const isNowActive = activationResult !== false &&
                              (activationResult == null || activationResult.activated !== false) &&
                              liveRuleRegistry.isRuleActive(graphId);

          if (isNowActive) {
            restored = true;
            console.warn(`[RuleController] Database deactivation failed for "${graphId}". Subscription successfully restored.`);
          } else {
            compensationError = new Error(`activateRule returned non-active result: ${JSON.stringify(activationResult)}`);
            console.error(
              `[RuleController] CRITICAL: Database deactivation failed for "${graphId}" (${dbError.message}), ` +
              `and compensation (subscription restoration) failed: activateRule returned non-active result.`
            );
          }
        } catch (compErr) {
          compensationError = compErr;
          console.error(
            `[RuleController] CRITICAL: Database deactivation failed for "${graphId}" (${dbError.message}), ` +
            `and compensation (subscription restoration) also failed: ${compErr.message}`
          );
        }
      }

      console.error(`[RuleController] Failed to persist inactive state for "${graphId}":`, dbError.message);

      let message = 'Failed to update rule deactivation state in database.';
      if (restored) {
        message = 'Failed to update rule deactivation state in database. Subscription restored.';
      } else if (compensationError) {
        message = 'Failed to update rule deactivation state in database, and compensation to restore subscription failed.';
      }

      return res.status(500).json({
        status: 'error',
        message,
        details: {
          subscriptionRestored: restored,
          ...(compensationError ? { compensationFailed: true } : {})
        }
      });
    }

    return res.status(200).json({
      status: 'success',
      message: `Rule "${graphId}" deactivated successfully`,
      data: {
        graphId,
        active: false,
        wasLiveInRegistry
      }
    });
  } catch (error) {
    console.error('[RuleController] deactivateRuleHandler error:', error.message);
    next(error);
  }
};

/**
 * Deletes a visual rule from MongoDB and cleans up any live registry subscription.
 *
 * Distributed Consistency & Race Condition Architecture Note:
 * In a distributed MongoDB environment (e.g. replica sets or sharded clusters), network write
 * acknowledgement timeouts can leave the client in an indeterminate state regarding whether
 * deleteOne() actually purged the document on the primary or failed before committing.
 * To mitigate "ghost rules" (in-memory subscriptions running for non-existent documents that
 * can never again be retrieved or deleted via REST), this controller performs an existence check
 * (await Rule.exists({ graphId })) before attempting compensating reactivation.
 *
 * Limitations of this check:
 * 1. Read Preference & Replication Lag: In replica sets with non-primary read preferences, a secondary
 *    read could return a stale exists result before replication oplog catches up. Mongoose queries
 *    default to primary read preference, ensuring read-after-write consistency on the primary node.
 * 2. Time-of-Check to Time-of-Use (TOCTOU): In high-concurrency environments, another client or worker
 *    could concurrently re-create or delete the rule during the microsecond window between deleteOne()
 *    failing and Rule.exists() executing.
 * 3. Network Partitioning: If the MongoDB connection is completely severed, Rule.exists() will also throw.
 *    Our design strictly refuses blind restoration in this state, preferring to fail safely without creating
 *    an unmonitored ghost subscription in memory. The rule can be cleanly re-activated on recovery or via
 *    startup hydration.
 *
 * @route   DELETE /api/rules/:graphId
 */
const deleteRule = async (req, res, next) => {
  try {
    const graphId = (req.params.graphId || '').toString().trim();
    if (!graphId) {
      return res.status(400).json({
        status: 'error',
        message: 'A valid graphId parameter is required.'
      });
    }

    const rule = await Rule.findOne({ graphId });
    if (!rule) {
      return res.status(404).json({
        status: 'error',
        message: `Rule with graphId "${graphId}" not found.`
      });
    }

    // Step 1: Clean up any active subscription in the live registry
    const wasLiveInRegistry = liveRuleRegistry.deactivateRule(graphId);

    // Step 2: Delete document from MongoDB
    try {
      await rule.deleteOne();
    } catch (deleteError) {
      let compensationError = null;
      let restored = false;

      // Compensating action: If rule was actively running, verify whether document
      // still exists before attempting subscription restoration.
      // Mitigates ghost subscriptions if deleteOne() actually deleted the document
      // but write acknowledgement failed due to network socket timeout.
      if (wasLiveInRegistry) {
        try {
          let docStillExists = null;
          try {
            docStillExists = await Rule.exists({ graphId });
          } catch (existsErr) {
            console.error(
              `[RuleController] CRITICAL: Existence check failed for "${graphId}" following delete error (${deleteError.message}): ${existsErr.message}. ` +
              `Refusing blind subscription restoration to prevent potential ghost rule.`
            );
            throw existsErr;
          }

          if (docStillExists) {
            const activationResult = liveRuleRegistry.activateRule(rule);
            const isNowActive = activationResult !== false &&
                                (activationResult == null || activationResult.activated !== false) &&
                                liveRuleRegistry.isRuleActive(graphId);

            if (isNowActive) {
              restored = true;
              console.warn(`[RuleController] deleteOne() failed for rule "${graphId}" and document still exists. Subscription successfully restored.`);
            } else {
              compensationError = new Error(`activateRule returned non-active result: ${JSON.stringify(activationResult)}`);
              console.error(
                `[RuleController] CRITICAL: deleteOne() failed for rule "${graphId}" (${deleteError.message}), ` +
                `and compensation (subscription restoration) failed: activateRule returned non-active result.`
              );
            }
          } else {
            console.warn(
              `[RuleController] deleteOne() threw an error for rule "${graphId}", but document no longer exists in database. ` +
              `Subscription not restored to prevent ghost rule.`
            );
          }
        } catch (compErr) {
          compensationError = compErr;
          console.error(
            `[RuleController] CRITICAL: deleteOne() failed for rule "${graphId}" (${deleteError.message}), ` +
            `and compensation (subscription restoration) could not be completed: ${compErr.message}`
          );
        }
      }

      console.error(`[RuleController] Failed to delete rule "${graphId}":`, deleteError.message);

      let message = 'Failed to delete rule from database.';
      if (restored) {
        message = 'Failed to delete rule from database. Active subscription restored.';
      } else if (compensationError) {
        message = 'Failed to delete rule from database, and compensation to restore subscription failed.';
      }

      return res.status(500).json({
        status: 'error',
        message,
        details: {
          subscriptionRestored: restored,
          ...(compensationError ? { compensationFailed: true } : {})
        }
      });
    }

    return res.status(200).json({
      status: 'success',
      message: `Rule "${graphId}" deleted successfully`,
      data: {
        graphId
      }
    });
  } catch (error) {
    console.error('[RuleController] deleteRule error:', error.message);
    next(error);
  }
};

module.exports = {
  createRule,
  getAllRules,
  getRuleByGraphId,
  updateRule,
  activateRuleHandler,
  deactivateRuleHandler,
  deleteRule
};
