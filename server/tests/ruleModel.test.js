/**
 * NexusFlow - Rule Model Unit & Database Integration Test Suite
 *
 * Verifies the Mongoose 9 Visual Rule model:
 * 1. Valid rule creation and persistence.
 * 2. Rejection of missing required fields (graphId, name, nodes).
 * 3. Strict node type enum enforcement (source, math, filter, action).
 * 4. Invalid edge endpoint detection and cycle prevention.
 * 5. Unique graphId index and duplicate rejection.
 * 6. Default active=false lifecycle flag.
 * 7. Default and custom scope persistence.
 * 8. Automatic timestamp generation and updates.
 * 9. Safe deactivation preserving all graph nodes and edges.
 *
 * Execution:
 *   node tests/ruleModel.test.js
 */

const mongoose = require('mongoose');
const Rule = require('../src/models/rule.model');
const config = require('../src/config/env');

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

const createValidGraphPayload = (overrides = {}) => {
  return {
    graphId: `test-rule-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: 'Overheat Detection Rule',
    description: 'Triggers alarm when furnace temperature exceeds 90C',
    scope: {
      deviceId: 'furnace-01',
      deviceType: 'temperature-probe',
      location: 'Foundry-Zone-A'
    },
    nodes: [
      { id: 'src-1', type: 'source', config: { field: 'temperature' } },
      { id: 'filter-1', type: 'filter', config: { field: 'temperature', minimum: 60, maximum: 120 } },
      { id: 'math-1', type: 'math', config: { field: 'temperature', factor: 1.1 } },
      { id: 'action-1', type: 'action', config: { field: 'temperature', threshold: 90, message: 'Furnace temperature critical' } }
    ],
    edges: [
      { source: 'src-1', target: 'filter-1' },
      { source: 'filter-1', target: 'math-1' },
      { source: 'math-1', target: 'action-1' }
    ],
    ...overrides
  };
};

async function runTests() {
  console.log('\n==================================================');
  console.log(' NexusFlow: Rule Model & Persistence Tests');
  console.log('==================================================\n');

  console.log('--- Setup ---');
  await mongoose.connect(config.mongoUri);
  console.log('  MongoDB connected successfully.\n');

  // Ensure collection and unique indexes are synchronized
  await Rule.init();

  try {
    // ════════════════════════════════════════════════════════════
    // Test 1: Valid Rule Creation & Persistence
    // ════════════════════════════════════════════════════════════
    console.log('Test 1: Valid Rule Creation & Persistence');
    const validData = createValidGraphPayload({
      graphId: 'test-valid-rule-001',
      name: 'Turbine Vibration Monitor'
    });

    const savedRule = await Rule.create(validData);
    assert(savedRule !== null, 'Rule document saved to database');
    assert(savedRule.graphId === 'test-valid-rule-001', 'Stored graphId matches input');
    assert(savedRule.name === 'Turbine Vibration Monitor', 'Stored name matches input');
    assert(savedRule.nodes.length === 4, 'All 4 graph nodes stored in subdocuments');
    assert(savedRule.edges.length === 3, 'All 3 graph edges stored in subdocuments');
    assert(savedRule.nodes[0].type === 'source', 'First node type is source');
    assert(savedRule.nodes[3].type === 'action', 'Terminal node type is action');

    // ════════════════════════════════════════════════════════════
    // Test 2: Missing Required Fields Rejection
    // ════════════════════════════════════════════════════════════
    console.log('\nTest 2: Missing Required Fields Rejection');

    // Missing graphId
    try {
      await Rule.create(createValidGraphPayload({ graphId: undefined }));
      assert(false, 'Should reject document with missing graphId');
    } catch (err) {
      assert(err.name === 'ValidationError' && err.errors.graphId, 'Rejects missing graphId with ValidationError');
    }

    // Missing name
    try {
      await Rule.create(createValidGraphPayload({ name: undefined }));
      assert(false, 'Should reject document with missing name');
    } catch (err) {
      assert(err.name === 'ValidationError' && err.errors.name, 'Rejects missing name with ValidationError');
    }

    // Missing nodes
    try {
      await Rule.create(createValidGraphPayload({ nodes: undefined }));
      assert(false, 'Should reject document with missing nodes');
    } catch (err) {
      assert(err.name === 'ValidationError' && err.errors.nodes, 'Rejects missing nodes with ValidationError');
    }

    // Empty nodes array
    try {
      await Rule.create(createValidGraphPayload({ nodes: [], edges: [] }));
      assert(false, 'Should reject document with empty nodes array');
    } catch (err) {
      assert(err.name === 'ValidationError' && err.errors.nodes, 'Rejects empty nodes array (requires at least 1 node)');
    }

    // ════════════════════════════════════════════════════════════
    // Test 3: Invalid Node Type Rejection (Enum Enforcement)
    // ════════════════════════════════════════════════════════════
    console.log('\nTest 3: Invalid Node Type Rejection');

    try {
      await Rule.create(
        createValidGraphPayload({
          nodes: [
            { id: 'src-1', type: 'source', config: {} },
            { id: 'invalid-1', type: 'unsupported-plugin', config: {} }
          ],
          edges: [{ source: 'src-1', target: 'invalid-1' }]
        })
      );
      assert(false, 'Should reject unsupported node type');
    } catch (err) {
      assert(
        err.name === 'ValidationError' && /unsupported/i.test(err.message),
        'Rejects unsupported node type via enum validation'
      );
    }

    // ════════════════════════════════════════════════════════════
    // Test 4: Invalid Edge & Graph Topology Validation
    // ════════════════════════════════════════════════════════════
    console.log('\nTest 4: Invalid Edge & Graph Topology Validation');

    // Edge references non-existent target
    try {
      await Rule.create(
        createValidGraphPayload({
          nodes: [{ id: 'src-1', type: 'source', config: {} }],
          edges: [{ source: 'src-1', target: 'ghost-target-id' }]
        })
      );
      assert(false, 'Should reject edge referencing non-existent target');
    } catch (err) {
      assert(
        err.name === 'ValidationError' && /Edge target not found/.test(err.message),
        'Rejects edge referencing non-existent target'
      );
    }

    // Edge references non-existent source
    try {
      await Rule.create(
        createValidGraphPayload({
          nodes: [{ id: 'filter-1', type: 'filter', config: {} }],
          edges: [{ source: 'ghost-source-id', target: 'filter-1' }]
        })
      );
      assert(false, 'Should reject edge referencing non-existent source');
    } catch (err) {
      assert(
        err.name === 'ValidationError' && /Edge source not found/.test(err.message),
        'Rejects edge referencing non-existent source'
      );
    }

    // Duplicate node IDs
    try {
      await Rule.create(
        createValidGraphPayload({
          nodes: [
            { id: 'duplicate-node', type: 'source', config: {} },
            { id: 'duplicate-node', type: 'action', config: {} }
          ],
          edges: []
        })
      );
      assert(false, 'Should reject duplicate node IDs');
    } catch (err) {
      assert(
        err.name === 'ValidationError' && /Duplicate node id detected/.test(err.message),
        'Rejects graph with duplicate node IDs'
      );
    }

    // Graph contains a cycle
    try {
      await Rule.create(
        createValidGraphPayload({
          nodes: [
            { id: 'n1', type: 'math', config: {} },
            { id: 'n2', type: 'math', config: {} }
          ],
          edges: [
            { source: 'n1', target: 'n2' },
            { source: 'n2', target: 'n1' }
          ]
        })
      );
      assert(false, 'Should reject graph containing cycles');
    } catch (err) {
      assert(
        err.name === 'ValidationError' && /contains a cycle/.test(err.message),
        'Rejects graph containing circular dependency via Kahn topological sort'
      );
    }

    // ════════════════════════════════════════════════════════════
    // Test 5: Unique graphId Index & Duplicate Rejection
    // ════════════════════════════════════════════════════════════
    console.log('\nTest 5: Unique graphId Enforcement');

    const duplicateGraphId = 'test-unique-conflict-id';
    await Rule.create(createValidGraphPayload({ graphId: duplicateGraphId, name: 'Original Rule' }));

    try {
      await Rule.create(createValidGraphPayload({ graphId: duplicateGraphId, name: 'Duplicate Rule Attempt' }));
      assert(false, 'Should reject duplicate graphId insertion');
    } catch (err) {
      const isDuplicateKey = err.code === 11000 || (err.message && err.message.includes('E11000'));
      assert(isDuplicateKey, 'Rejects duplicate graphId with MongoDB E11000 duplicate key error');
    }

    // ════════════════════════════════════════════════════════════
    // Test 6: Default active=false Lifecycle Flag
    // ════════════════════════════════════════════════════════════
    console.log('\nTest 6: Default active=false Flag');

    const defaultActiveDoc = await Rule.create(
      createValidGraphPayload({ graphId: 'test-default-active-rule' })
    );
    assert(defaultActiveDoc.active === false, 'Default active flag is false when not specified');

    // ════════════════════════════════════════════════════════════
    // Test 7: Scope Defaults & Custom Scoping
    // ════════════════════════════════════════════════════════════
    console.log('\nTest 7: Scope Defaults & Custom Scoping');

    // Default scope
    const defaultScopeDoc = await Rule.create(
      createValidGraphPayload({
        graphId: 'test-default-scope-rule',
        scope: undefined
      })
    );
    assert(
      defaultScopeDoc.scope &&
      defaultScopeDoc.scope.deviceId === 'all' &&
      defaultScopeDoc.scope.deviceType === 'all' &&
      defaultScopeDoc.scope.location === 'all',
      'Scope fields default to "all"'
    );

    // Custom scope
    const customScopeDoc = await Rule.create(
      createValidGraphPayload({
        graphId: 'test-custom-scope-rule',
        scope: {
          deviceId: 'boiler-04',
          deviceType: 'boiler-sensor',
          location: 'Boiler-Room-East'
        }
      })
    );
    assert(customScopeDoc.scope.deviceId === 'boiler-04', 'Custom scope deviceId stored');
    assert(customScopeDoc.scope.deviceType === 'boiler-sensor', 'Custom scope deviceType stored');
    assert(customScopeDoc.scope.location === 'Boiler-Room-East', 'Custom scope location stored');

    // ════════════════════════════════════════════════════════════
    // Test 8: Timestamp Behavior (createdAt & updatedAt)
    // ════════════════════════════════════════════════════════════
    console.log('\nTest 8: Timestamp Behavior');

    const timestampRule = await Rule.create(
      createValidGraphPayload({ graphId: 'test-timestamp-rule' })
    );
    assert(timestampRule.createdAt instanceof Date, 'createdAt is an instance of Date');
    assert(timestampRule.updatedAt instanceof Date, 'updatedAt is an instance of Date');

    const originalUpdatedAt = timestampRule.updatedAt.getTime();

    // Wait 25ms and update document
    await new Promise((r) => setTimeout(r, 25));
    timestampRule.description = 'Updated description';
    await timestampRule.save();

    assert(
      timestampRule.updatedAt.getTime() > originalUpdatedAt,
      'updatedAt updates automatically upon document mutation'
    );

    // ════════════════════════════════════════════════════════════
    // Test 9: Deactivation & Graph Definition Preservation
    // ════════════════════════════════════════════════════════════
    console.log('\nTest 9: Deactivation & Graph Definition Preservation');

    // 1. Create an active rule
    const activeRule = await Rule.create(
      createValidGraphPayload({
        graphId: 'test-deactivation-rule',
        active: true
      })
    );
    assert(activeRule.active === true, 'Rule is created with active=true');

    // 2. Deactivate the rule (toggle active to false)
    activeRule.active = false;
    await activeRule.save();

    // 3. Re-query from MongoDB and verify entire definition is intact
    const reloadedRule = await Rule.findOne({ graphId: 'test-deactivation-rule' });
    assert(reloadedRule !== null, 'Deactivated rule remains persisted in MongoDB');
    assert(reloadedRule.active === false, 'Rule active flag changed to false');
    assert(reloadedRule.name === activeRule.name, 'Rule name is preserved');
    assert(reloadedRule.nodes.length === 4, 'All 4 nodes remain preserved after deactivation');
    assert(reloadedRule.edges.length === 3, 'All 3 edges remain preserved after deactivation');
    assert(reloadedRule.scope.deviceId === 'furnace-01', 'Scope deviceId remains preserved');
    assert(reloadedRule.nodes[1].config.minimum === 60, 'Node config values remain preserved');

  } finally {
    // ── Cleanup ────────────────────────────────────────────────
    console.log('\n--- Cleanup ---');
    const deleteResult = await Rule.deleteMany({
      graphId: { $regex: /^test-/ }
    });
    console.log(`  Test rule documents removed: ${deleteResult.deletedCount}`);

    await mongoose.disconnect();
    console.log('  MongoDB disconnected.');
  }

  // ── Results Summary ──────────────────────────────────────────
  console.log('\n==================================================');
  console.log(` Tests passed: ${passed}`);
  console.log(` Tests failed: ${failed}`);
  console.log('==================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Unhandled test failure:', err);
  process.exit(1);
});
