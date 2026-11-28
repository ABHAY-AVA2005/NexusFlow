/**
 * Visual Rule Routes
 *
 * Defines REST endpoints for visual rule CRUD and lifecycle operations:
 * - POST   /api/rules              Create a visual rule
 * - GET    /api/rules              Retrieve all visual rules
 * - GET    /api/rules/:graphId     Retrieve single visual rule by graphId
 * - PUT    /api/rules/:graphId     Update visual rule definition
 * - PATCH  /api/rules/:graphId/activate    Activate rule and subscribe to stream
 * - PATCH  /api/rules/:graphId/deactivate  Deactivate rule and detach from stream
 * - DELETE /api/rules/:graphId     Delete visual rule and clean up subscription
 *
 * @module routes/rule.routes
 */

const express = require('express');
const router = express.Router();
const {
  createRule,
  getAllRules,
  getRuleByGraphId,
  updateRule,
  activateRuleHandler,
  deactivateRuleHandler,
  deleteRule
} = require('../controllers/rule.controller');

router.post('/', createRule);
router.get('/', getAllRules);
router.get('/:graphId', getRuleByGraphId);
router.put('/:graphId', updateRule);
router.patch('/:graphId/activate', activateRuleHandler);
router.patch('/:graphId/deactivate', deactivateRuleHandler);
router.delete('/:graphId', deleteRule);

module.exports = router;
