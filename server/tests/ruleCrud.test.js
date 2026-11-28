/**
 * NexusFlow - Rule CRUD & Lifecycle Integration Test Suite
 *
 * Verifies the 7 REST endpoints for visual rule graph management:
 * 1. POST   /api/rules              - Successful rule creation (active: false).
 * 2. POST   /api/rules              - Duplicate graphId rejection (HTTP 409).
 * 3. POST   /api/rules              - Invalid graph rejection (cycles, missing endpoints, bad node types) (HTTP 400).
 * 4. GET    /api/rules              - Retrieve all rules (with query filtering and isLive flag).
 * 5. GET    /api/rules/:graphId     - Retrieve single rule / nonexistent rule handling (HTTP 404).
 * 6. PUT    /api/rules/:graphId     - Update inactive rule definition (immutable graphId, validation checks).
 * 7. PATCH  /api/rules/:graphId/activate   - Rule activation & subscription to central stream (HTTP 200).
 * 8. PATCH  /api/rules/:graphId/activate   - Duplicate activation prevention (HTTP 409).
 * 9. PUT    /api/rules/:graphId     - Active rule update rejection (HTTP 409).
 * 10. Central Stream Integration     - Telemetry execution through an API-activated rule.
 * 11. Activation Persistence Failure - In-memory subscription rollback on database write failure.
 * 12. PATCH /api/rules/:graphId/deactivate - Idempotent rule deactivation (HTTP 200).
 * 13. Concurrent Activation Guard   - Concurrent activation attempts race protection (exactly one succeeds).
 * 14. DELETE /api/rules/:graphId    - Safe deletion of active rule with subscription cleanup.
 * 15. DELETE /api/rules/:graphId    - Nonexistent rule deletion (HTTP 404).
 * 16. Deactivation failure with successful subscription restoration compensation.
 * 17. Deactivation failure with failed compensation (non-swallowed error, CWE-209 safe).
 * 18. Active-rule delete failure with subscription restoration compensation.
 * 19. Deactivation failure for an already inactive rule (accurate non-restored response).
 * 20. Deletion failure for an inactive rule (accurate non-restored response).
 * 21. Ghost subscription mitigation when document was actually deleted despite write timeout.
 * 22. Blind restoration refused when Rule.exists() throws during delete failure compensation.
 * 23. CWE-209 Information Disclosure Verification (no leaked Mongo errors, IPs, or stack traces).
 * 24. Deactivation failure where activateRule() returns false during compensation.
 * 25. Active-rule delete failure where activateRule() throws during compensation.
 * 26. Active-rule delete failure where activateRule() returns false during compensation.
 *
 * Execution:
 *   node tests/ruleCrud.test.js
 */

const http = require('http');
const express = require('express');
const mongoose = require('mongoose');
const config = require('../src/config/env');
const ruleRoutes = require('../src/routes/rule.routes');
const { errorHandler } = require('../src/middleware/errorHandler');
const Rule = require('../src/models/rule.model');
const liveRuleRegistry = require('../src/services/liveRuleRegistry.service');
const {
  isRuleActive,
  getActiveRule,
  getActiveRuleCount,
  clearRegistry
} = liveRuleRegistry;
const {
  publishTelemetry,
  getTelemetryStream
} = require('../src/services/telemetryStream.service');

const TEST_PORT = 5096;
const SERVER_URL = `http://localhost:${TEST_PORT}`;

let httpServer;
let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${label}`);
    failed++;
  }
}

// Helper to create a valid visual graph payload
const makeValidGraph = (graphId, overrides = {}) => ({
  graphId,
  name: `Rule ${graphId}`,
  description: 'Test rule for CRUD verification',
  scope: {
    deviceId: 'all',
    deviceType: 'all',
    location: 'all'
  },
  nodes: [
    { id: 'src-1', type: 'source', config: { field: 'temperature' } },
    { id: 'filter-1', type: 'filter', config: { field: 'temperature', minimum: 50, maximum: 120 } },
    { id: 'math-1', type: 'math', config: { field: 'temperature', factor: 1.0 } },
    { id: 'action-1', type: 'action', config: { field: 'temperature', threshold: 85, message: 'High temperature alert' } }
  ],
  edges: [
    { source: 'src-1', target: 'filter-1' },
    { source: 'filter-1', target: 'math-1' },
    { source: 'math-1', target: 'action-1' }
  ],
  ...overrides
});

async function runTests() {
  console.log('\n==================================================');
  console.log(' NexusFlow: Rule CRUD & Lifecycle Integration Tests');
  console.log('==================================================\n');

  console.log('--- Setup ---');
  await mongoose.connect(config.mongoUri);
  console.log('  MongoDB connected.');

  // Clean test artifacts
  await Rule.deleteMany({ graphId: { $regex: /^test-crud-/ } });
  clearRegistry();

  const app = express();
  app.use(express.json());
  app.use('/api/rules', ruleRoutes);
  app.use(errorHandler);

  httpServer = http.createServer(app);
  await new Promise((resolve) => httpServer.listen(TEST_PORT, resolve));
  console.log(`  Test HTTP server listening on port ${TEST_PORT}\n`);

  try {
    // ════════════════════════════════════════════════════════════
    // Test 1: Create a valid rule (POST /api/rules)
    // ════════════════════════════════════════════════════════════
    console.log('Test 1: Successful rule creation (POST /api/rules)');
    const rule1Payload = makeValidGraph('test-crud-rule-1');

    const res1 = await fetch(`${SERVER_URL}/api/rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rule1Payload)
    });
    const body1 = await res1.json();

    assert(res1.status === 201, 'Valid rule returns HTTP 201 Created');
    assert(body1.status === 'success', 'Response status is "success"');
    assert(body1.data.graphId === 'test-crud-rule-1', 'Response contains correct graphId');
    assert(body1.data.active === false, 'New rule defaults to active: false');
    assert(body1.data.nodes.length === 4, 'Rule persists all 4 nodes');
    assert(body1.data.edges.length === 3, 'Rule persists all 3 edges');
    assert(isRuleActive('test-crud-rule-1') === false, 'New rule is not active in the live registry');

    // ════════════════════════════════════════════════════════════
    // Test 2: Duplicate graphId rejection (POST /api/rules)
    // ════════════════════════════════════════════════════════════
    console.log('\nTest 2: Duplicate graphId rejection (POST /api/rules)');
    const res2 = await fetch(`${SERVER_URL}/api/rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rule1Payload)
    });
    const body2 = await res2.json();

    assert(res2.status === 409, 'Duplicate graphId returns HTTP 409 Conflict');
    assert(body2.status === 'error', 'Error status is "error"');
    assert(body2.message.includes('already exists'), 'Message indicates graphId conflict');

    // ════════════════════════════════════════════════════════════
    // Test 3: Invalid graph and cyclic graph rejection (POST /api/rules)
    // ════════════════════════════════════════════════════════════
    console.log('\nTest 3: Invalid graph and cycle rejection (POST /api/rules)');

    // 3A: Circular graph (A -> B -> A)
    const cyclicPayload = makeValidGraph('test-crud-cyclic', {
      edges: [
        { source: 'src-1', target: 'filter-1' },
        { source: 'filter-1', target: 'math-1' },
        { source: 'math-1', target: 'filter-1' } // cycle!
      ]
    });
    const res3A = await fetch(`${SERVER_URL}/api/rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cyclicPayload)
    });
    assert(res3A.status === 400, 'Cyclic graph returns HTTP 400 Bad Request');

    // 3B: Unsupported node type
    const badTypePayload = makeValidGraph('test-crud-bad-type', {
      nodes: [
        { id: 'src-1', type: 'invalid-type', config: {} }
      ]
    });
    const res3B = await fetch(`${SERVER_URL}/api/rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(badTypePayload)
    });
    assert(res3B.status === 400, 'Invalid node type returns HTTP 400 Bad Request');

    // 3C: Orphaned edge target
    const orphanedEdgePayload = makeValidGraph('test-crud-bad-edge', {
      edges: [
        { source: 'src-1', target: 'non-existent-node' }
      ]
    });
    const res3C = await fetch(`${SERVER_URL}/api/rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orphanedEdgePayload)
    });
    assert(res3C.status === 400, 'Edge with nonexistent target returns HTTP 400 Bad Request');

    // 3D: Missing graphId
    const missingIdPayload = { name: 'Rule without graphId', nodes: [{ id: 's1', type: 'source', config: {} }] };
    const res3D = await fetch(`${SERVER_URL}/api/rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(missingIdPayload)
    });
    assert(res3D.status === 400, 'Missing graphId returns HTTP 400 Bad Request');

    // ════════════════════════════════════════════════════════════
    // Test 4: Retrieve all rules (GET /api/rules)
    // ════════════════════════════════════════════════════════════
    console.log('\nTest 4: Retrieve all rules (GET /api/rules)');
    const res4 = await fetch(`${SERVER_URL}/api/rules`);
    const body4 = await res4.json();

    assert(res4.status === 200, 'GET /api/rules returns HTTP 200 OK');
    assert(body4.status === 'success', 'Response status is "success"');
    assert(Array.isArray(body4.data), 'Response data is an array');
    assert(body4.count >= 1, 'Array contains at least 1 created rule');

    const createdItem = body4.data.find((r) => r.graphId === 'test-crud-rule-1');
    assert(createdItem !== undefined, 'Found created rule in collection');
    assert(createdItem.isLive === false, 'Rule includes isLive: false flag');

    // ════════════════════════════════════════════════════════════
    // Test 5: Retrieve single rule (GET /api/rules/:graphId)
    // ════════════════════════════════════════════════════════════
    console.log('\nTest 5: Retrieve single rule (GET /api/rules/:graphId)');
    const res5 = await fetch(`${SERVER_URL}/api/rules/test-crud-rule-1`);
    const body5 = await res5.json();

    assert(res5.status === 200, 'GET /api/rules/:graphId returns HTTP 200 OK');
    assert(body5.data.graphId === 'test-crud-rule-1', 'Returned document matches graphId');
    assert(body5.data.isLive === false, 'Single rule includes isLive: false');

    // 5B: Missing rule returns 404
    const res5Missing = await fetch(`${SERVER_URL}/api/rules/test-crud-nonexistent`);
    assert(res5Missing.status === 404, 'Nonexistent graphId returns HTTP 404 Not Found');

    // ════════════════════════════════════════════════════════════
    // Test 6: Update inactive rule (PUT /api/rules/:graphId)
    // ════════════════════════════════════════════════════════════
    console.log('\nTest 6: Update inactive rule (PUT /api/rules/:graphId)');
    const updatePayload = {
      name: 'Updated Rule Title',
      description: 'Updated rule description',
      nodes: [
        { id: 'src-1', type: 'source', config: { field: 'temperature' } },
        { id: 'action-1', type: 'action', config: { field: 'temperature', threshold: 95, message: 'Extreme overheat' } }
      ],
      edges: [
        { source: 'src-1', target: 'action-1' }
      ]
    };

    const res6 = await fetch(`${SERVER_URL}/api/rules/test-crud-rule-1`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatePayload)
    });
    const body6 = await res6.json();

    assert(res6.status === 200, 'Update inactive rule returns HTTP 200 OK');
    assert(body6.data.name === 'Updated Rule Title', 'Rule name updated in database');
    assert(body6.data.nodes.length === 2, 'Nodes count updated to 2');
    assert(body6.data.edges.length === 1, 'Edges count updated to 1');

    // 6B: Immutability of graphId
    const res6Immutable = await fetch(`${SERVER_URL}/api/rules/test-crud-rule-1`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ graphId: 'attempted-new-id', name: 'Changed' })
    });
    assert(res6Immutable.status === 400, 'Attempting to change graphId returns HTTP 400 Bad Request');

    // 6C: Updating with cyclic graph is rejected by document .save() pre('validate') hook
    const res6Cycle = await fetch(`${SERVER_URL}/api/rules/test-crud-rule-1`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nodes: [
          { id: 'n1', type: 'source', config: {} },
          { id: 'n2', type: 'filter', config: {} }
        ],
        edges: [
          { source: 'n1', target: 'n2' },
          { source: 'n2', target: 'n1' } // cycle!
        ]
      })
    });
    assert(res6Cycle.status === 400, 'Updating rule with cyclic graph returns HTTP 400 Bad Request');

    // ════════════════════════════════════════════════════════════
    // Test 7: Activate rule (PATCH /api/rules/:graphId/activate)
    // ════════════════════════════════════════════════════════════
    console.log('\nTest 7: Rule activation (PATCH /api/rules/:graphId/activate)');
    const res7 = await fetch(`${SERVER_URL}/api/rules/test-crud-rule-1/activate`, {
      method: 'PATCH'
    });
    const body7 = await res7.json();

    assert(res7.status === 200, 'Activate returns HTTP 200 OK');
    assert(body7.status === 'success', 'Response status is "success"');
    assert(body7.data.active === true, 'Response data indicates active: true');
    assert(isRuleActive('test-crud-rule-1') === true, 'Rule is active in the live registry');

    // Verify DB reflection
    const dbRule7 = await Rule.findOne({ graphId: 'test-crud-rule-1' });
    assert(dbRule7.active === true, 'MongoDB document field active is true');

    // Verify GET /:graphId reflects live state
    const res7Get = await fetch(`${SERVER_URL}/api/rules/test-crud-rule-1`);
    const body7Get = await res7Get.json();
    assert(body7Get.data.isLive === true, 'GET endpoint reports isLive: true');
    assert(body7Get.data.runtime !== null, 'GET endpoint attaches runtime registry info');

    // ════════════════════════════════════════════════════════════
    // Test 8: Prevent duplicate activation (PATCH /api/rules/:graphId/activate)
    // ════════════════════════════════════════════════════════════
    console.log('\nTest 8: Prevent duplicate activation');
    const res8 = await fetch(`${SERVER_URL}/api/rules/test-crud-rule-1/activate`, {
      method: 'PATCH'
    });
    const body8 = await res8.json();

    assert(res8.status === 409, 'Duplicate activation returns HTTP 409 Conflict');
    assert(body8.message.includes('already active'), 'Message indicates rule is already active');
    assert(getActiveRuleCount() === 1, 'Registry maintains exactly 1 active subscription');

    // ════════════════════════════════════════════════════════════
    // Test 9: Reject update on active rule (PUT /api/rules/:graphId)
    // ════════════════════════════════════════════════════════════
    console.log('\nTest 9: Reject update on active rule (PUT /api/rules/:graphId)');
    const res9 = await fetch(`${SERVER_URL}/api/rules/test-crud-rule-1`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Illegal Active Modification' })
    });
    const body9 = await res9.json();

    assert(res9.status === 409, 'Updating an active rule returns HTTP 409 Conflict');
    assert(body9.message.includes('Deactivate the rule before editing'), 'Message guides client to deactivate first');

    const dbRule9 = await Rule.findOne({ graphId: 'test-crud-rule-1' });
    assert(dbRule9.name === 'Updated Rule Title', 'Rule title remained untouched in MongoDB');

    // ════════════════════════════════════════════════════════════
    // Test 10: Telemetry execution through an API-activated rule
    // ════════════════════════════════════════════════════════════
    console.log('\nTest 10: Telemetry execution through API-activated rule');
    // Rule was updated in Test 6 to: src-1 -> action-1 (threshold: 95)
    // Emit telemetry reading: temperature 98 (above threshold 95)
    publishTelemetry({
      _id: new mongoose.Types.ObjectId(),
      timestamp: new Date(),
      metadata: { deviceId: 'furnace-01', deviceType: 'temp-sensor', location: 'Plant-1' },
      temperature: 98,
      pressure: 101.3,
      vibration: 0.05
    });

    // Allow RxJS stream synchronous execution to settle
    await new Promise((r) => setTimeout(r, 20));

    const activeInfo = getActiveRule('test-crud-rule-1');
    assert(activeInfo !== null, 'Active rule registry entry exists');
    assert(activeInfo.executionCount >= 1, 'Rule received and executed telemetry record');
    assert(activeInfo.alertCount >= 1, 'Action node triggered alert for temperature 98 >= 95');

    // ════════════════════════════════════════════════════════════
    // Test 11: Activation persistence failure rollback
    // ════════════════════════════════════════════════════════════
    console.log('\nTest 11: Activation persistence failure rollback');
    // Create rule 2
    const rule2Payload = makeValidGraph('test-crud-rule-2');
    await fetch(`${SERVER_URL}/api/rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rule2Payload)
    });

    // Temporarily mock Rule.prototype.save to reject on this specific document
    const originalSave = Rule.prototype.save;
    let failNextSave = true;
    Rule.prototype.save = async function (...args) {
      if (this.graphId === 'test-crud-rule-2' && failNextSave) {
        failNextSave = false;
        throw new Error('Simulated transient MongoDB persistence failure');
      }
      return originalSave.apply(this, args);
    };

    try {
      const res11 = await fetch(`${SERVER_URL}/api/rules/test-crud-rule-2/activate`, {
        method: 'PATCH'
      });
      const body11 = await res11.json();

      assert(res11.status === 500, 'Database save failure returns HTTP 500');
      assert(body11.message.includes('rolled back'), 'Message notes subscription rollback');
      assert(isRuleActive('test-crud-rule-2') === false, 'Live subscription was rolled back and is NOT active in registry');

      const dbRule2 = await Rule.findOne({ graphId: 'test-crud-rule-2' });
      assert(dbRule2.active === false, 'Database active state remains false');
    } finally {
      Rule.prototype.save = originalSave;
    }

    // ════════════════════════════════════════════════════════════
    // Test 12: Deactivate rule (PATCH /api/rules/:graphId/deactivate)
    // ════════════════════════════════════════════════════════════
    console.log('\nTest 12: Idempotent rule deactivation (PATCH /api/rules/:graphId/deactivate)');
    const res12 = await fetch(`${SERVER_URL}/api/rules/test-crud-rule-1/deactivate`, {
      method: 'PATCH'
    });
    const body12 = await res12.json();

    assert(res12.status === 200, 'Deactivation returns HTTP 200 OK');
    assert(body12.data.active === false, 'Response indicates active: false');
    assert(isRuleActive('test-crud-rule-1') === false, 'Rule subscription is detached from live registry');

    const dbRule12 = await Rule.findOne({ graphId: 'test-crud-rule-1' });
    assert(dbRule12.active === false, 'Database record reflects active: false');

    // Emit telemetry; deactivated rule must NOT process it
    const preCount = activeInfo.executionCount;
    publishTelemetry({
      _id: new mongoose.Types.ObjectId(),
      timestamp: new Date(),
      metadata: { deviceId: 'furnace-01', deviceType: 'temp-sensor', location: 'Plant-1' },
      temperature: 99,
      pressure: 101.3,
      vibration: 0.05
    });
    await new Promise((r) => setTimeout(r, 20));
    assert(getActiveRule('test-crud-rule-1') === null, 'Deactivated rule has no active entry in registry');

    // 12B: Idempotent deactivation on already inactive rule
    const res12Idempotent = await fetch(`${SERVER_URL}/api/rules/test-crud-rule-1/deactivate`, {
      method: 'PATCH'
    });
    assert(res12Idempotent.status === 200, 'Second deactivation call on inactive rule returns HTTP 200');

    // ════════════════════════════════════════════════════════════
    // Test 13: Concurrent activation attempts guard
    // ════════════════════════════════════════════════════════════
    console.log('\nTest 13: Concurrent activation attempts guard');
    // Issue two concurrent activation calls for test-crud-rule-1
    const [concurrentRes1, concurrentRes2] = await Promise.all([
      fetch(`${SERVER_URL}/api/rules/test-crud-rule-1/activate`, { method: 'PATCH' }),
      fetch(`${SERVER_URL}/api/rules/test-crud-rule-1/activate`, { method: 'PATCH' })
    ]);

    const statuses = [concurrentRes1.status, concurrentRes2.status].sort();
    assert(statuses[0] === 200 && statuses[1] === 409, 'Exactly one concurrent request returns 200 and the other returns 409');
    assert(getActiveRuleCount() === 1, 'Registry contains exactly 1 subscription despite concurrent attempts');

    // ════════════════════════════════════════════════════════════
    // Test 14: Safe deletion of active rule (DELETE /api/rules/:graphId)
    // ════════════════════════════════════════════════════════════
    console.log('\nTest 14: Safe deletion of active rule with subscription cleanup');
    assert(isRuleActive('test-crud-rule-1') === true, 'Rule is active prior to deletion');

    const res14 = await fetch(`${SERVER_URL}/api/rules/test-crud-rule-1`, {
      method: 'DELETE'
    });
    const body14 = await res14.json();

    assert(res14.status === 200, 'DELETE returns HTTP 200 OK');
    assert(body14.status === 'success', 'Response status is "success"');
    assert(isRuleActive('test-crud-rule-1') === false, 'Live subscription was cleaned up during deletion');

    const dbDeleted = await Rule.findOne({ graphId: 'test-crud-rule-1' });
    assert(dbDeleted === null, 'Document was deleted from MongoDB');

    // Verify GET now returns 404
    const res14Check = await fetch(`${SERVER_URL}/api/rules/test-crud-rule-1`);
    assert(res14Check.status === 404, 'Subsequent GET returns HTTP 404 Not Found');

    // ════════════════════════════════════════════════════════════
    // Test 15: Delete nonexistent rule (DELETE /api/rules/:graphId)
    // ════════════════════════════════════════════════════════════
    console.log('\nTest 15: Delete nonexistent rule');
    const res15 = await fetch(`${SERVER_URL}/api/rules/test-crud-nonexistent`, {
      method: 'DELETE'
    });
    assert(res15.status === 404, 'Deleting nonexistent rule returns HTTP 404 Not Found');

    // ════════════════════════════════════════════════════════════
    // Test 16: Deactivation failure with successful subscription restoration compensation
    // ════════════════════════════════════════════════════════════
    console.log('\nTest 16: Deactivation failure with successful subscription restoration compensation');
    const rule16Payload = makeValidGraph('test-crud-rule-decomp-succ');
    await fetch(`${SERVER_URL}/api/rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rule16Payload)
    });
    await fetch(`${SERVER_URL}/api/rules/test-crud-rule-decomp-succ/activate`, { method: 'PATCH' });
    assert(isRuleActive('test-crud-rule-decomp-succ') === true, 'Rule is active prior to deactivation failure');

    const origSave16 = Rule.prototype.save;
    let failDeactSave = true;
    Rule.prototype.save = async function (...args) {
      if (this.graphId === 'test-crud-rule-decomp-succ' && failDeactSave) {
        failDeactSave = false;
        throw new Error('Simulated MongoDB write failure during deactivation');
      }
      return origSave16.apply(this, args);
    };

    try {
      const res16 = await fetch(`${SERVER_URL}/api/rules/test-crud-rule-decomp-succ/deactivate`, {
        method: 'PATCH'
      });
      const body16 = await res16.json();

      assert(res16.status === 500, 'Deactivation DB failure returns HTTP 500');
      assert(body16.details.subscriptionRestored === true, 'Response reports subscription was restored');
      assert(body16.details.databaseError === undefined, 'Raw databaseError is omitted from response (CWE-209)');
      assert(body16.details.compensationError === undefined, 'Raw compensationError is omitted from response (CWE-209)');
      assert(body16.message === 'Failed to update rule deactivation state in database. Subscription restored.', 'Message indicates subscription restored');
      assert(isRuleActive('test-crud-rule-decomp-succ') === true, 'Subscription remains active in live registry');

      const dbDoc16 = await Rule.findOne({ graphId: 'test-crud-rule-decomp-succ' });
      assert(dbDoc16.active === true, 'MongoDB document field active remains true');
    } finally {
      Rule.prototype.save = origSave16;
    }

    // ════════════════════════════════════════════════════════════
    // Test 17: Deactivation failure with failed compensation (non-swallowed compensation error)
    // ════════════════════════════════════════════════════════════
    console.log('\nTest 17: Deactivation failure with failed compensation (non-swallowed error)');
    const rule17Payload = makeValidGraph('test-crud-rule-decomp-fail');
    await fetch(`${SERVER_URL}/api/rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rule17Payload)
    });
    await fetch(`${SERVER_URL}/api/rules/test-crud-rule-decomp-fail/activate`, { method: 'PATCH' });
    assert(isRuleActive('test-crud-rule-decomp-fail') === true, 'Rule is active prior to deactivation failure');

    const origSave17 = Rule.prototype.save;
    let failDeactComp = true;
    Rule.prototype.save = async function (...args) {
      if (this.graphId === 'test-crud-rule-decomp-fail' && failDeactComp) {
        failDeactComp = false;
        // Corrupt in-memory nodes so that activateRule(rule) in catch block throws during compile
        this.nodes = [{ id: 'src-1', type: 'corrupt-node-type-triggering-failure', config: {} }];
        throw new Error('Simulated database deactivation failure: MongoServerError: connection closed [10.0.0.1:27017]');
      }
      return origSave17.apply(this, args);
    };

    try {
      const res17 = await fetch(`${SERVER_URL}/api/rules/test-crud-rule-decomp-fail/deactivate`, {
        method: 'PATCH'
      });
      const body17 = await res17.json();

      assert(res17.status === 500, 'Deactivation failure returns HTTP 500');
      assert(body17.details.subscriptionRestored === false, 'Response indicates subscription restoration failed');
      assert(body17.details.compensationFailed === true, 'Response flags compensationFailed as true');
      assert(body17.details.compensationError === undefined, 'Raw compensationError is omitted from response (CWE-209)');
      assert(body17.details.databaseError === undefined, 'Raw databaseError is omitted from response (CWE-209)');
      assert(body17.message.includes('compensation to restore subscription failed'), 'Message details failed compensation');
      assert(isRuleActive('test-crud-rule-decomp-fail') === false, 'Rule subscription is not active');
    } finally {
      Rule.prototype.save = origSave17;
    }

    // ════════════════════════════════════════════════════════════
    // Test 18: Active-rule delete failure with subscription restoration compensation
    // ════════════════════════════════════════════════════════════
    console.log('\nTest 18: Active-rule delete failure with subscription restoration compensation');
    const rule18Payload = makeValidGraph('test-crud-rule-del-active');
    await fetch(`${SERVER_URL}/api/rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rule18Payload)
    });
    await fetch(`${SERVER_URL}/api/rules/test-crud-rule-del-active/activate`, { method: 'PATCH' });
    assert(isRuleActive('test-crud-rule-del-active') === true, 'Rule is active prior to delete failure');

    const origDeleteOne18 = Rule.prototype.deleteOne;
    let failDelete18 = true;
    Rule.prototype.deleteOne = async function (...args) {
      if (this.graphId === 'test-crud-rule-del-active' && failDelete18) {
        failDelete18 = false;
        throw new Error('Simulated database deleteOne() write conflict: MongoServerError');
      }
      return origDeleteOne18.apply(this, args);
    };

    try {
      const res18 = await fetch(`${SERVER_URL}/api/rules/test-crud-rule-del-active`, {
        method: 'DELETE'
      });
      const body18 = await res18.json();

      assert(res18.status === 500, 'Delete failure returns HTTP 500');
      assert(body18.details.subscriptionRestored === true, 'Response reports active subscription was restored');
      assert(body18.details.databaseError === undefined, 'Raw databaseError is omitted from response (CWE-209)');
      assert(body18.message === 'Failed to delete rule from database. Active subscription restored.', 'Message indicates subscription restored');
      assert(isRuleActive('test-crud-rule-del-active') === true, 'Rule subscription remains active in live registry');

      const dbDoc18 = await Rule.findOne({ graphId: 'test-crud-rule-del-active' });
      assert(dbDoc18 !== null, 'MongoDB document still exists');
      assert(dbDoc18.active === true, 'MongoDB document field active remains true');
    } finally {
      Rule.prototype.deleteOne = origDeleteOne18;
    }

    // ════════════════════════════════════════════════════════════
    // Test 19: Deactivation failure for an already inactive rule
    // ════════════════════════════════════════════════════════════
    console.log('\nTest 19: Deactivation failure for an already inactive rule');
    const rule19Payload = makeValidGraph('test-crud-rule-deact-inact');
    await fetch(`${SERVER_URL}/api/rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rule19Payload)
    });
    assert(isRuleActive('test-crud-rule-deact-inact') === false, 'Rule is inactive prior to test');

    const origSave19 = Rule.prototype.save;
    let failSave19 = true;
    Rule.prototype.save = async function (...args) {
      if (this.graphId === 'test-crud-rule-deact-inact' && failSave19) {
        failSave19 = false;
        throw new Error('Simulated database error saving inactive state');
      }
      return origSave19.apply(this, args);
    };

    try {
      const res19 = await fetch(`${SERVER_URL}/api/rules/test-crud-rule-deact-inact/deactivate`, {
        method: 'PATCH'
      });
      const body19 = await res19.json();

      assert(res19.status === 500, 'Deactivation failure returns HTTP 500');
      assert(body19.details.subscriptionRestored === false, 'subscriptionRestored is false since rule was not live');
      assert(body19.details.compensationFailed === undefined, 'compensationFailed is undefined since no compensation was needed');
      assert(body19.message === 'Failed to update rule deactivation state in database.', 'Message does not falsely claim subscription restored');
      assert(isRuleActive('test-crud-rule-deact-inact') === false, 'Rule remains inactive in live registry');
    } finally {
      Rule.prototype.save = origSave19;
    }

    // ════════════════════════════════════════════════════════════
    // Test 20: Deletion failure for an inactive rule
    // ════════════════════════════════════════════════════════════
    console.log('\nTest 20: Deletion failure for an inactive rule');
    const rule20Payload = makeValidGraph('test-crud-rule-del-inact');
    await fetch(`${SERVER_URL}/api/rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rule20Payload)
    });
    assert(isRuleActive('test-crud-rule-del-inact') === false, 'Rule is inactive prior to deletion');

    const origDeleteOne20 = Rule.prototype.deleteOne;
    let failDelete20 = true;
    Rule.prototype.deleteOne = async function (...args) {
      if (this.graphId === 'test-crud-rule-del-inact' && failDelete20) {
        failDelete20 = false;
        throw new Error('Simulated database error deleting inactive rule');
      }
      return origDeleteOne20.apply(this, args);
    };

    try {
      const res20 = await fetch(`${SERVER_URL}/api/rules/test-crud-rule-del-inact`, {
        method: 'DELETE'
      });
      const body20 = await res20.json();

      assert(res20.status === 500, 'Deletion failure returns HTTP 500');
      assert(body20.details.subscriptionRestored === false, 'subscriptionRestored is false since rule was not live');
      assert(body20.details.compensationFailed === undefined, 'compensationFailed is undefined');
      assert(body20.message === 'Failed to delete rule from database.', 'Message does not falsely claim active subscription restored');
      assert(isRuleActive('test-crud-rule-del-inact') === false, 'Rule remains inactive in live registry');
    } finally {
      Rule.prototype.deleteOne = origDeleteOne20;
    }

    // ════════════════════════════════════════════════════════════
    // Test 21: Ghost subscription mitigation when document was actually deleted
    // ════════════════════════════════════════════════════════════
    console.log('\nTest 21: Ghost subscription mitigation when document was actually deleted');
    const rule21Payload = makeValidGraph('test-crud-rule-del-ghost');
    await fetch(`${SERVER_URL}/api/rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rule21Payload)
    });
    await fetch(`${SERVER_URL}/api/rules/test-crud-rule-del-ghost/activate`, { method: 'PATCH' });
    assert(isRuleActive('test-crud-rule-del-ghost') === true, 'Rule is active prior to deletion');

    const origDeleteOne21 = Rule.prototype.deleteOne;
    const origExists21 = Rule.exists;
    let failDelete21 = true;
    Rule.prototype.deleteOne = async function (...args) {
      if (this.graphId === 'test-crud-rule-del-ghost' && failDelete21) {
        failDelete21 = false;
        throw new Error('Simulated write acknowledgement timeout on deleteOne()');
      }
      return origDeleteOne21.apply(this, args);
    };
    // Simulate document being deleted on MongoDB despite client write timeout
    Rule.exists = async function (filter) {
      if (filter && filter.graphId === 'test-crud-rule-del-ghost') {
        return null;
      }
      return origExists21.apply(this, [filter]);
    };

    try {
      const res21 = await fetch(`${SERVER_URL}/api/rules/test-crud-rule-del-ghost`, {
        method: 'DELETE'
      });
      const body21 = await res21.json();

      assert(res21.status === 500, 'Delete failure returns HTTP 500');
      assert(body21.details.subscriptionRestored === false, 'subscriptionRestored is false because document was deleted');
      assert(body21.message === 'Failed to delete rule from database.', 'Message does not report subscription restored');
      assert(isRuleActive('test-crud-rule-del-ghost') === false, 'Subscription was NOT resurrected as ghost rule');
    } finally {
      Rule.prototype.deleteOne = origDeleteOne21;
      Rule.exists = origExists21;
    }

    // ════════════════════════════════════════════════════════════
    // Test 22: Blind restoration refused when Rule.exists() throws
    // ════════════════════════════════════════════════════════════
    console.log('\nTest 22: Blind restoration refused when Rule.exists() throws');
    const rule22Payload = makeValidGraph('test-crud-rule-del-ex-fail');
    await fetch(`${SERVER_URL}/api/rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rule22Payload)
    });
    await fetch(`${SERVER_URL}/api/rules/test-crud-rule-del-ex-fail/activate`, { method: 'PATCH' });
    assert(isRuleActive('test-crud-rule-del-ex-fail') === true, 'Rule is active prior to deletion');

    const origDeleteOne22 = Rule.prototype.deleteOne;
    const origExists22 = Rule.exists;
    let failDelete22 = true;
    Rule.prototype.deleteOne = async function (...args) {
      if (this.graphId === 'test-crud-rule-del-ex-fail' && failDelete22) {
        failDelete22 = false;
        throw new Error('Simulated write conflict on deleteOne()');
      }
      return origDeleteOne22.apply(this, args);
    };
    // Simulate database network crash during existence check
    Rule.exists = async function (filter) {
      if (filter && filter.graphId === 'test-crud-rule-del-ex-fail') {
        throw new Error('Simulated network timeout during Rule.exists() check');
      }
      return origExists22.apply(this, [filter]);
    };

    try {
      const res22 = await fetch(`${SERVER_URL}/api/rules/test-crud-rule-del-ex-fail`, {
        method: 'DELETE'
      });
      const body22 = await res22.json();

      assert(res22.status === 500, 'Delete failure returns HTTP 500');
      assert(body22.details.subscriptionRestored === false, 'subscriptionRestored is false');
      assert(body22.details.compensationFailed === true, 'compensationFailed is flagged true');
      assert(body22.message.includes('compensation to restore subscription failed'), 'Message reports failed compensation');
      assert(isRuleActive('test-crud-rule-del-ex-fail') === false, 'Blind restoration was refused');
    } finally {
      Rule.prototype.deleteOne = origDeleteOne22;
      Rule.exists = origExists22;
    }

    // ════════════════════════════════════════════════════════════
    // Test 23: CWE-209 Information Disclosure Verification
    // ════════════════════════════════════════════════════════════
    console.log('\nTest 23: CWE-209 Information Disclosure Verification');
    const sensitiveTerms = ['MongoServerError', 'ECONNREFUSED', '127.0.0.1:27017', 'stack', 'Simulated'];
    const rule23Payload = makeValidGraph('test-crud-rule-cwe209');
    await fetch(`${SERVER_URL}/api/rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rule23Payload)
    });
    await fetch(`${SERVER_URL}/api/rules/test-crud-rule-cwe209/activate`, { method: 'PATCH' });

    const origSave23 = Rule.prototype.save;
    Rule.prototype.save = async function (...args) {
      if (this.graphId === 'test-crud-rule-cwe209') {
        throw new Error('MongoServerError: connection ECONNREFUSED 127.0.0.1:27017 at Socket.<anonymous>');
      }
      return origSave23.apply(this, args);
    };

    try {
      const res23 = await fetch(`${SERVER_URL}/api/rules/test-crud-rule-cwe209/deactivate`, {
        method: 'PATCH'
      });
      const text23 = await res23.text();
      const body23 = JSON.parse(text23);

      assert(res23.status === 500, 'Returns HTTP 500');
      assert(body23.details.databaseError === undefined, 'No databaseError property in details');
      assert(body23.details.compensationError === undefined, 'No compensationError property in details');

      for (const term of sensitiveTerms) {
        assert(!text23.includes(term), `HTTP response body does not contain sensitive term "${term}"`);
      }
    } finally {
      Rule.prototype.save = origSave23;
    }

    // ════════════════════════════════════════════════════════════
    // Test 24: Deactivation failure where activateRule() returns false during compensation
    // ════════════════════════════════════════════════════════════
    console.log('\nTest 24: Deactivation failure where activateRule() returns false during compensation');
    const rule24Payload = makeValidGraph('test-crud-rule-decomp-ret-false');
    await fetch(`${SERVER_URL}/api/rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rule24Payload)
    });
    await fetch(`${SERVER_URL}/api/rules/test-crud-rule-decomp-ret-false/activate`, { method: 'PATCH' });
    assert(isRuleActive('test-crud-rule-decomp-ret-false') === true, 'Rule is active prior to deactivation failure');

    const origSave24 = Rule.prototype.save;
    const origActivate24 = liveRuleRegistry.activateRule;
    let failDeact24 = true;
    Rule.prototype.save = async function (...args) {
      if (this.graphId === 'test-crud-rule-decomp-ret-false' && failDeact24) {
        failDeact24 = false;
        throw new Error('Simulated database deactivation failure: write concern error');
      }
      return origSave24.apply(this, args);
    };
    liveRuleRegistry.activateRule = function (ruleArg, ...args) {
      const gId = ruleArg && (ruleArg.graphId || ruleArg.id);
      if (gId === 'test-crud-rule-decomp-ret-false') {
        return false;
      }
      return origActivate24.apply(this, [ruleArg, ...args]);
    };

    try {
      const res24 = await fetch(`${SERVER_URL}/api/rules/test-crud-rule-decomp-ret-false/deactivate`, {
        method: 'PATCH'
      });
      const body24 = await res24.json();

      assert(res24.status === 500, 'Deactivation failure returns HTTP 500');
      assert(body24.details.subscriptionRestored === false, 'subscriptionRestored is false when activateRule returns false');
      assert(body24.details.compensationFailed === true, 'compensationFailed is true');
      assert(body24.details.databaseError === undefined, 'No raw databaseError leaked (CWE-209)');
      assert(body24.message.includes('compensation to restore subscription failed'), 'Message details failed compensation');
      assert(isRuleActive('test-crud-rule-decomp-ret-false') === false, 'Rule is not active in live registry');
    } finally {
      Rule.prototype.save = origSave24;
      liveRuleRegistry.activateRule = origActivate24;
    }

    // ════════════════════════════════════════════════════════════
    // Test 25: Active-rule delete failure where activateRule() throws during compensation
    // ════════════════════════════════════════════════════════════
    console.log('\nTest 25: Active-rule delete failure where activateRule() throws during compensation');
    const rule25Payload = makeValidGraph('test-crud-rule-del-comp-throw');
    await fetch(`${SERVER_URL}/api/rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rule25Payload)
    });
    await fetch(`${SERVER_URL}/api/rules/test-crud-rule-del-comp-throw/activate`, { method: 'PATCH' });
    assert(isRuleActive('test-crud-rule-del-comp-throw') === true, 'Rule is active prior to delete failure');

    const origDeleteOne25 = Rule.prototype.deleteOne;
    const origActivate25 = liveRuleRegistry.activateRule;
    let failDelete25 = true;
    Rule.prototype.deleteOne = async function (...args) {
      if (this.graphId === 'test-crud-rule-del-comp-throw' && failDelete25) {
        failDelete25 = false;
        throw new Error('Simulated database error during deleteOne()');
      }
      return origDeleteOne25.apply(this, args);
    };
    liveRuleRegistry.activateRule = function (ruleArg, ...args) {
      const gId = ruleArg && (ruleArg.graphId || ruleArg.id);
      if (gId === 'test-crud-rule-del-comp-throw') {
        throw new Error('Simulated compilation/activation crash during delete compensation');
      }
      return origActivate25.apply(this, [ruleArg, ...args]);
    };

    try {
      const res25 = await fetch(`${SERVER_URL}/api/rules/test-crud-rule-del-comp-throw`, {
        method: 'DELETE'
      });
      const body25 = await res25.json();

      assert(res25.status === 500, 'Delete failure returns HTTP 500');
      assert(body25.details.subscriptionRestored === false, 'subscriptionRestored is false when activateRule throws');
      assert(body25.details.compensationFailed === true, 'compensationFailed is flagged true');
      assert(body25.details.databaseError === undefined, 'No raw databaseError leaked (CWE-209)');
      assert(body25.message.includes('compensation to restore subscription failed'), 'Message details failed compensation');
      assert(isRuleActive('test-crud-rule-del-comp-throw') === false, 'Rule subscription is not active');
    } finally {
      Rule.prototype.deleteOne = origDeleteOne25;
      liveRuleRegistry.activateRule = origActivate25;
    }

    // ════════════════════════════════════════════════════════════
    // Test 26: Active-rule delete failure where activateRule() returns false during compensation
    // ════════════════════════════════════════════════════════════
    console.log('\nTest 26: Active-rule delete failure where activateRule() returns false during compensation');
    const rule26Payload = makeValidGraph('test-crud-rule-del-comp-false');
    await fetch(`${SERVER_URL}/api/rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rule26Payload)
    });
    await fetch(`${SERVER_URL}/api/rules/test-crud-rule-del-comp-false/activate`, { method: 'PATCH' });
    assert(isRuleActive('test-crud-rule-del-comp-false') === true, 'Rule is active prior to delete failure');

    const origDeleteOne26 = Rule.prototype.deleteOne;
    const origActivate26 = liveRuleRegistry.activateRule;
    let failDelete26 = true;
    Rule.prototype.deleteOne = async function (...args) {
      if (this.graphId === 'test-crud-rule-del-comp-false' && failDelete26) {
        failDelete26 = false;
        throw new Error('Simulated database write conflict during deleteOne()');
      }
      return origDeleteOne26.apply(this, args);
    };
    liveRuleRegistry.activateRule = function (ruleArg, ...args) {
      const gId = ruleArg && (ruleArg.graphId || ruleArg.id);
      if (gId === 'test-crud-rule-del-comp-false') {
        return false;
      }
      return origActivate26.apply(this, [ruleArg, ...args]);
    };

    try {
      const res26 = await fetch(`${SERVER_URL}/api/rules/test-crud-rule-del-comp-false`, {
        method: 'DELETE'
      });
      const body26 = await res26.json();

      assert(res26.status === 500, 'Delete failure returns HTTP 500');
      assert(body26.details.subscriptionRestored === false, 'subscriptionRestored is false when activateRule returns false');
      assert(body26.details.compensationFailed === true, 'compensationFailed is flagged true');
      assert(body26.details.databaseError === undefined, 'No raw databaseError leaked (CWE-209)');
      assert(body26.message.includes('compensation to restore subscription failed'), 'Message details failed compensation');
      assert(isRuleActive('test-crud-rule-del-comp-false') === false, 'Rule subscription is not active');
    } finally {
      Rule.prototype.deleteOne = origDeleteOne26;
      liveRuleRegistry.activateRule = origActivate26;
    }

  } finally {
    // ── Teardown ──────────────────────────────────────────────
    console.log('\n--- Teardown ---');
    clearRegistry();
    await Rule.deleteMany({ graphId: { $regex: /^test-crud-/ } });
    await new Promise((resolve) => httpServer.close(resolve));
    await mongoose.disconnect();
    console.log('  Cleaned up test data and closed connections.\n');
  }

  // ── Results Summary ─────────────────────────────────────────
  console.log('==================================================');
  console.log(` Tests passed: ${passed}`);
  console.log(` Tests failed: ${failed}`);
  console.log('==================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
