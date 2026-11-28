/**
 * NexusFlow - Live Rule Registry Test Suite
 *
 * Verifies runtime rule execution and lifecycle:
 * 1. Activating a valid rule.
 * 2. Receiving telemetry through an active rule & graph pipeline execution.
 * 3. DeviceId scope matching.
 * 4. DeviceType scope matching.
 * 5. Location scope matching.
 * 6. "all" scope behavior across all scope dimensions.
 * 7. Non-matching telemetry is safely ignored.
 * 8. Duplicate activation prevention (no duplicate subscriptions).
 * 9. Deactivation stops rule execution.
 * 10. Reactivation after deactivation works reliably.
 * 11. Error isolation (one rule's error does not affect another rule or stream).
 * 12. Invalid graph rejection before registry mutation.
 * 13. Subscription cleanup and registry clearing.
 * 14. Compatibility with Mongoose Rule documents (.toObject normalization).
 * 15. Pipeline error lifecycle, de-registration, and clean reactivation.
 * 16. Throwing onError callback isolation.
 * 17. Identity-safe cleanup prevention against newer subscription.
 *
 * Execution:
 *   node tests/liveRuleRegistry.test.js
 */

const {
  activateRule,
  deactivateRule,
  isRuleActive,
  getActiveRule,
  getActiveRules,
  getActiveRuleIds,
  getActiveRuleCount,
  clearRegistry,
  matchesScope
} = require('../src/services/liveRuleRegistry.service');

const { publishTelemetry, getTelemetryStream } = require('../src/services/telemetryStream.service');

// ==========================================
// Test Runner Harness
// ==========================================

let passedCount = 0;
let failedCount = 0;

const assert = (condition, message) => {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passedCount++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failedCount++;
  }
};

const assertThrows = (fn, expectedPattern, message) => {
  try {
    fn();
    console.error(`  ✗ FAIL (Expected throw, but succeeded): ${message}`);
    failedCount++;
  } catch (error) {
    if (expectedPattern && !expectedPattern.test(error.message)) {
      console.error(`  ✗ FAIL: ${message} (Expected message matching ${expectedPattern}, got "${error.message}")`);
      failedCount++;
    } else {
      console.log(`  ✓ ${message}`);
      passedCount++;
    }
  }
};

// ==========================================
// Mock Factories
// ==========================================

const createMockTelemetry = (overrides = {}) => {
  return {
    _id: `test-telemetry-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    metadata: {
      deviceId: 'sensor-furnace-01',
      deviceType: 'temperature-probe',
      location: 'Foundry-Zone-A'
    },
    temperature: 80.0,
    pressure: 101.3,
    vibration: 0.04,
    ...overrides
  };
};

const createMockRule = (overrides = {}) => {
  return {
    graphId: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: 'Furnace Overheat Alert',
    scope: {
      deviceId: 'sensor-furnace-01',
      deviceType: 'temperature-probe',
      location: 'Foundry-Zone-A'
    },
    nodes: [
      { id: 'src-1', type: 'source', config: { field: 'temperature' } },
      { id: 'math-1', type: 'math', config: { field: 'temperature', factor: 1.1 } },
      { id: 'action-1', type: 'action', config: { field: 'temperature', threshold: 90, message: 'Furnace temperature critical' } }
    ],
    edges: [
      { source: 'src-1', target: 'math-1' },
      { source: 'math-1', target: 'action-1' }
    ],
    ...overrides
  };
};

// ==========================================
// Test Suite Execution
// ==========================================

const runTests = async () => {
  console.log('\n==================================================');
  console.log(' NexusFlow: Live Rule Registry Test Suite');
  console.log('==================================================\n');

  try {
    // ----------------------------------------------------
    // Test 1: Activating a valid rule
    // ----------------------------------------------------
    console.log('Test 1: Activating a valid rule');
    clearRegistry();

    const rule1 = createMockRule({ graphId: 'rule-test-01', name: 'Primary Test Rule' });
    const activationResult = activateRule(rule1);

    assert(activationResult.activated === true, 'activateRule returns activated: true');
    assert(activationResult.graphId === 'rule-test-01', 'activateRule returns correct graphId');
    assert(isRuleActive('rule-test-01') === true, 'isRuleActive returns true for active rule');
    assert(isRuleActive('non-existent-rule') === false, 'isRuleActive returns false for unknown rule');
    assert(getActiveRuleCount() === 1, 'getActiveRuleCount returns 1');
    assert(getActiveRuleIds().includes('rule-test-01'), 'getActiveRuleIds contains registered rule');

    const ruleDetails = getActiveRule('rule-test-01');
    assert(ruleDetails !== null, 'getActiveRule returns registered rule object');
    assert(ruleDetails.name === 'Primary Test Rule', 'Rule details name matches input');
    assert(ruleDetails.executionCount === 0, 'Initial executionCount is 0');
    assert(ruleDetails.alertCount === 0, 'Initial alertCount is 0');

    // ----------------------------------------------------
    // Test 2: Receiving telemetry through an active rule
    // ----------------------------------------------------
    console.log('\nTest 2: Receiving telemetry through an active rule');
    clearRegistry();

    const resultsTest2 = [];
    const alertsTest2 = [];

    const rule2 = createMockRule({
      graphId: 'rule-pipeline-02',
      nodes: [
        { id: 's-1', type: 'source', config: { field: 'temperature' } },
        { id: 'm-1', type: 'math', config: { field: 'temperature', factor: 1.2 } },
        { id: 'a-1', type: 'action', config: { field: 'temperature', threshold: 100, message: 'Temp exceeded 100C' } }
      ],
      edges: [
        { source: 's-1', target: 'm-1' },
        { source: 'm-1', target: 'a-1' }
      ]
    });

    activateRule(rule2, {
      onResult: (res) => resultsTest2.push(res),
      onAlert: (res) => alertsTest2.push(res)
    });

    // Sub-test 2a: Temperature 80 * 1.2 = 96 (< 100 -> alert: false)
    publishTelemetry(createMockTelemetry({ temperature: 80.0 }));

    assert(resultsTest2.length === 1, 'Rule received and processed 1st telemetry record');
    assert(resultsTest2[0].temperature === 96.0, 'Math node scaled temperature correctly (80 * 1.2 = 96.0)');
    assert(resultsTest2[0].alert === false, 'Action node evaluated alert=false when below threshold');
    assert(alertsTest2.length === 0, 'onAlert hook was NOT triggered for non-alert record');

    // Sub-test 2b: Temperature 90 * 1.2 = 108 (>= 100 -> alert: true)
    publishTelemetry(createMockTelemetry({ temperature: 90.0 }));

    assert(resultsTest2.length === 2, 'Rule received and processed 2nd telemetry record');
    assert(resultsTest2[1].temperature === 108.0, 'Math node scaled temperature correctly (90 * 1.2 = 108.0)');
    assert(resultsTest2[1].alert === true, 'Action node evaluated alert=true when at or above threshold');
    assert(resultsTest2[1].threshold === 100, 'Alert result attached threshold value');
    assert(resultsTest2[1].message === 'Temp exceeded 100C', 'Alert result attached custom message');
    assert(alertsTest2.length === 1, 'onAlert hook was triggered exactly once');
    assert(alertsTest2[0].temperature === 108.0, 'Alert payload matches emission');

    const detailsTest2 = getActiveRule('rule-pipeline-02');
    assert(detailsTest2.executionCount === 2, 'Execution count incremented to 2');
    assert(detailsTest2.alertCount === 1, 'Alert count incremented to 1');

    // ----------------------------------------------------
    // Test 3: DeviceId scope matching
    // ----------------------------------------------------
    console.log('\nTest 3: DeviceId scope matching');
    clearRegistry();

    const deviceResults = [];
    const deviceRule = createMockRule({
      graphId: 'rule-device-scope',
      scope: { deviceId: 'furnace-target-42', deviceType: 'all', location: 'all' }
    });

    activateRule(deviceRule, { onResult: (res) => deviceResults.push(res) });

    // Matching deviceId
    publishTelemetry(createMockTelemetry({
      metadata: { deviceId: 'furnace-target-42', deviceType: 'probe-a', location: 'Zone-1' }
    }));
    assert(deviceResults.length === 1, 'Matching deviceId telemetry was processed');

    // Non-matching deviceId
    publishTelemetry(createMockTelemetry({
      metadata: { deviceId: 'furnace-other-99', deviceType: 'probe-a', location: 'Zone-1' }
    }));
    assert(deviceResults.length === 1, 'Non-matching deviceId telemetry was filtered out');

    // ----------------------------------------------------
    // Test 4: DeviceType scope matching
    // ----------------------------------------------------
    console.log('\nTest 4: DeviceType scope matching');
    clearRegistry();

    const typeResults = [];
    const typeRule = createMockRule({
      graphId: 'rule-type-scope',
      scope: { deviceId: 'all', deviceType: 'vibration-sensor', location: 'all' }
    });

    activateRule(typeRule, { onResult: (res) => typeResults.push(res) });

    // Matching deviceType
    publishTelemetry(createMockTelemetry({
      metadata: { deviceId: 'mach-01', deviceType: 'vibration-sensor', location: 'Zone-X' }
    }));
    assert(typeResults.length === 1, 'Matching deviceType telemetry was processed');

    // Non-matching deviceType
    publishTelemetry(createMockTelemetry({
      metadata: { deviceId: 'mach-01', deviceType: 'pressure-gauge', location: 'Zone-X' }
    }));
    assert(typeResults.length === 1, 'Non-matching deviceType telemetry was filtered out');

    // ----------------------------------------------------
    // Test 5: Location scope matching
    // ----------------------------------------------------
    console.log('\nTest 5: Location scope matching');
    clearRegistry();

    const locationResults = [];
    const locationRule = createMockRule({
      graphId: 'rule-location-scope',
      scope: { deviceId: 'all', deviceType: 'all', location: 'Sector-Green' }
    });

    activateRule(locationRule, { onResult: (res) => locationResults.push(res) });

    // Matching location
    publishTelemetry(createMockTelemetry({
      metadata: { deviceId: 'unit-1', deviceType: 'sensor', location: 'Sector-Green' }
    }));
    assert(locationResults.length === 1, 'Matching location telemetry was processed');

    // Non-matching location
    publishTelemetry(createMockTelemetry({
      metadata: { deviceId: 'unit-1', deviceType: 'sensor', location: 'Sector-Red' }
    }));
    assert(locationResults.length === 1, 'Non-matching location telemetry was filtered out');

    // ----------------------------------------------------
    // Test 6: "all" scope behavior across all scope dimensions
    // ----------------------------------------------------
    console.log('\nTest 6: "all" scope behavior');
    clearRegistry();

    const allScopeResults = [];
    const allScopeRule = createMockRule({
      graphId: 'rule-all-scope',
      scope: { deviceId: 'all', deviceType: 'all', location: 'all' }
    });

    activateRule(allScopeRule, { onResult: (res) => allScopeResults.push(res) });

    publishTelemetry(createMockTelemetry({
      metadata: { deviceId: 'dev-A', deviceType: 'type-A', location: 'loc-A' }
    }));
    publishTelemetry(createMockTelemetry({
      metadata: { deviceId: 'dev-B', deviceType: 'type-B', location: 'loc-B' }
    }));
    publishTelemetry(createMockTelemetry({
      metadata: { deviceId: 'dev-C', deviceType: 'type-C', location: 'loc-C' }
    }));

    assert(allScopeResults.length === 3, '"all" scope rule received all 3 disparate telemetry records');

    // ----------------------------------------------------
    // Test 7: Non-matching telemetry is ignored
    // ----------------------------------------------------
    console.log('\nTest 7: Non-matching telemetry is ignored');
    clearRegistry();

    const strictResults = [];
    const strictRule = createMockRule({
      graphId: 'rule-strict-scope',
      scope: {
        deviceId: 'furnace-exact-01',
        deviceType: 'temp-probe-exact',
        location: 'Zone-Exact'
      }
    });

    activateRule(strictRule, { onResult: (res) => strictResults.push(res) });

    // Matches deviceId and deviceType but fails location
    publishTelemetry(createMockTelemetry({
      metadata: { deviceId: 'furnace-exact-01', deviceType: 'temp-probe-exact', location: 'Zone-Wrong' }
    }));

    // Matches none
    publishTelemetry(createMockTelemetry({
      metadata: { deviceId: 'other-id', deviceType: 'other-type', location: 'other-loc' }
    }));

    assert(strictResults.length === 0, 'Zero records processed when any scope dimension mismatches');
    assert(getActiveRule('rule-strict-scope').executionCount === 0, 'Execution count remains 0');

    // ----------------------------------------------------
    // Test 8: Duplicate activation prevention
    // ----------------------------------------------------
    console.log('\nTest 8: Duplicate activation prevention');
    clearRegistry();

    const dupExecutions = [];
    const dupRule = createMockRule({ graphId: 'rule-dup-check' });

    activateRule(dupRule, { onResult: (res) => dupExecutions.push(res) });
    assert(getActiveRuleCount() === 1, 'Initial activation succeeded');

    assertThrows(
      () => activateRule(dupRule),
      /already active/,
      'Duplicate activation of active graphId is rejected'
    );

    assert(getActiveRuleCount() === 1, 'Registry count remains 1 after duplicate attempt');

    publishTelemetry(createMockTelemetry({
      metadata: { deviceId: 'sensor-furnace-01', deviceType: 'temperature-probe', location: 'Foundry-Zone-A' }
    }));

    assert(dupExecutions.length === 1, 'Telemetry executed exactly once (no duplicate subscription created)');

    // ----------------------------------------------------
    // Test 9: Deactivation stops rule execution
    // ----------------------------------------------------
    console.log('\nTest 9: Deactivation stops rule execution');
    clearRegistry();

    const deactResults = [];
    const deactRule = createMockRule({ graphId: 'rule-deact-test' });

    activateRule(deactRule, { onResult: (res) => deactResults.push(res) });

    publishTelemetry(createMockTelemetry({
      metadata: { deviceId: 'sensor-furnace-01', deviceType: 'temperature-probe', location: 'Foundry-Zone-A' }
    }));
    assert(deactResults.length === 1, 'Record received prior to deactivation');

    const deactivated = deactivateRule('rule-deact-test');
    assert(deactivated === true, 'deactivateRule returns true for active rule');
    assert(isRuleActive('rule-deact-test') === false, 'isRuleActive returns false after deactivation');
    assert(getActiveRuleCount() === 0, 'Active rule count is 0 after deactivation');

    // Subsequent telemetry should NOT be received
    publishTelemetry(createMockTelemetry({
      metadata: { deviceId: 'sensor-furnace-01', deviceType: 'temperature-probe', location: 'Foundry-Zone-A' }
    }));
    assert(deactResults.length === 1, 'No further telemetry processed after deactivation');

    // Deactivating non-active rule returns false
    const deactAgain = deactivateRule('rule-deact-test');
    assert(deactAgain === false, 'deactivateRule returns false when rule is already inactive');

    // ----------------------------------------------------
    // Test 10: Reactivation works
    // ----------------------------------------------------
    console.log('\nTest 10: Reactivation works');
    clearRegistry();

    const reactResults = [];
    const reactRule = createMockRule({ graphId: 'rule-reactivate' });

    activateRule(reactRule, { onResult: (res) => reactResults.push(res) });
    deactivateRule('rule-reactivate');
    assert(isRuleActive('rule-reactivate') === false, 'Rule confirmed inactive');

    // Reactivate the same rule
    const reactivated = activateRule(reactRule, { onResult: (res) => reactResults.push(res) });
    assert(reactivated.activated === true, 'Reactivation succeeded');
    assert(isRuleActive('rule-reactivate') === true, 'isRuleActive returns true after reactivation');

    publishTelemetry(createMockTelemetry({
      metadata: { deviceId: 'sensor-furnace-01', deviceType: 'temperature-probe', location: 'Foundry-Zone-A' }
    }));
    assert(reactResults.length === 1, 'Reactivated rule successfully receives telemetry');

    // ----------------------------------------------------
    // Test 11: Error isolation (one rule's error does not affect others)
    // ----------------------------------------------------
    console.log('\nTest 11: Error isolation across rules');
    clearRegistry();

    let faultyRuleErrorCaptured = null;
    const healthyRuleResults = [];

    const faultyRule = createMockRule({
      graphId: 'rule-faulty-01',
      scope: { deviceId: 'all', deviceType: 'all', location: 'all' }
    });

    const healthyRule = createMockRule({
      graphId: 'rule-healthy-02',
      scope: { deviceId: 'all', deviceType: 'all', location: 'all' }
    });

    // Rule 1 has a faulty onResult callback that throws synchronously
    activateRule(faultyRule, {
      onResult: () => {
        throw new Error('Rogue error in faulty rule consumer callback');
      },
      onError: (err) => {
        faultyRuleErrorCaptured = err;
      }
    });

    // Rule 2 is healthy
    activateRule(healthyRule, {
      onResult: (res) => healthyRuleResults.push(res)
    });

    // Publish telemetry to both rules
    publishTelemetry(createMockTelemetry({ temperature: 50.0 }));

    assert(faultyRuleErrorCaptured !== null, 'Faulty rule error was captured and isolated');
    assert(
      faultyRuleErrorCaptured.message.includes('Rogue error'),
      'Captured error matches thrown message'
    );
    assert(
      healthyRuleResults.length === 1,
      'Healthy rule successfully processed telemetry despite peer rule throwing'
    );

    // Verify stream resilience: central telemetry stream remains operational
    publishTelemetry(createMockTelemetry({ temperature: 55.0 }));
    assert(
      healthyRuleResults.length === 2,
      'Healthy rule continues receiving subsequent records without interruption'
    );

    // ----------------------------------------------------
    // Test 12: Invalid graph handling
    // ----------------------------------------------------
    console.log('\nTest 12: Invalid graph handling');
    clearRegistry();

    assertThrows(
      () => activateRule(null),
      /valid non-null object/,
      'Rejects null rule payload'
    );

    assertThrows(
      () => activateRule({ name: 'No Graph ID' }),
      /graphId is required/,
      'Rejects rule without graphId'
    );

    assertThrows(
      () => activateRule(createMockRule({
        graphId: 'invalid-type-rule',
        nodes: [{ id: 'n1', type: 'unsupported-plugin', config: {} }]
      })),
      /unsupported type/i,
      'Rejects rule with unsupported node type'
    );

    assertThrows(
      () => activateRule(createMockRule({
        graphId: 'cycle-rule',
        nodes: [
          { id: 'c1', type: 'math', config: {} },
          { id: 'c2', type: 'math', config: {} }
        ],
        edges: [
          { source: 'c1', target: 'c2' },
          { source: 'c2', target: 'c1' }
        ]
      })),
      /contains a cycle/,
      'Rejects rule containing circular dependency'
    );

    assertThrows(
      () => activateRule(createMockRule({
        graphId: 'orphan-rule',
        nodes: [
          { id: 's1', type: 'source', config: { field: 'temperature' } },
          { id: 'orphan', type: 'math', config: { field: 'temperature' } }
        ],
        edges: []
      })),
      /no connection/i,
      'Rejects rule with disconnected/orphaned nodes'
    );

    assert(getActiveRuleCount() === 0, 'Registry map remains clean and empty after all rejections');

    // ----------------------------------------------------
    // Test 13: Subscription cleanup and registry clearing
    // ----------------------------------------------------
    console.log('\nTest 13: Subscription cleanup and registry clearing');
    clearRegistry();

    const ruleA = createMockRule({ graphId: 'cleanup-rule-a' });
    const ruleB = createMockRule({ graphId: 'cleanup-rule-b' });
    const ruleC = createMockRule({ graphId: 'cleanup-rule-c' });

    activateRule(ruleA);
    activateRule(ruleB);
    activateRule(ruleC);
    assert(getActiveRuleCount() === 3, '3 rules registered');

    // Deactivate one
    deactivateRule('cleanup-rule-b');
    assert(getActiveRuleCount() === 2, '2 rules remain after single deactivation');
    assert(!getActiveRuleIds().includes('cleanup-rule-b'), 'Deactivated rule removed from IDs');

    // Clear all
    clearRegistry();
    assert(getActiveRuleCount() === 0, 'clearRegistry sets active count to 0');
    assert(getActiveRuleIds().length === 0, 'getActiveRuleIds is empty after clearRegistry');

    // ----------------------------------------------------
    // Test 14: Compatibility with Mongoose Rule document (.toObject)
    // ----------------------------------------------------
    console.log('\nTest 14: Mongoose Rule document normalization compatibility');
    clearRegistry();

    const mongooseEmulatedRule = {
      graphId: 'mongoose-doc-rule-01',
      name: 'Mongoose Emulated Rule',
      scope: {
        deviceId: 'furnace-doc-01',
        deviceType: 'all',
        location: 'all',
        toObject() {
          return { deviceId: 'furnace-doc-01', deviceType: 'all', location: 'all' };
        }
      },
      nodes: [
        {
          id: 'src-doc',
          type: 'source',
          config: { field: 'temperature' },
          toObject() {
            return { id: 'src-doc', type: 'source', config: { field: 'temperature' } };
          }
        },
        {
          id: 'act-doc',
          type: 'action',
          config: { field: 'temperature', threshold: 75 },
          toObject() {
            return { id: 'act-doc', type: 'action', config: { field: 'temperature', threshold: 75 } };
          }
        }
      ],
      edges: [
        {
          id: 'e1',
          source: 'src-doc',
          target: 'act-doc',
          toObject() {
            return { id: 'e1', source: 'src-doc', target: 'act-doc' };
          }
        }
      ],
      toObject() {
        return {
          graphId: 'mongoose-doc-rule-01',
          name: 'Mongoose Emulated Rule',
          scope: this.scope.toObject(),
          nodes: this.nodes.map((n) => n.toObject()),
          edges: this.edges.map((e) => e.toObject())
        };
      }
    };

    const docResults = [];
    activateRule(mongooseEmulatedRule, { onResult: (res) => docResults.push(res) });

    assert(isRuleActive('mongoose-doc-rule-01') === true, 'Mongoose-like document activated successfully');

    publishTelemetry(createMockTelemetry({
      metadata: { deviceId: 'furnace-doc-01', deviceType: 'any', location: 'any' },
      temperature: 78.0
    }));

    assert(docResults.length === 1, 'Mongoose document rule executed and received telemetry');
    assert(docResults[0].alert === true, 'Action evaluated correctly on normalized subdocuments');

    // ----------------------------------------------------
    // Test 15: Pipeline error lifecycle, de-registration & reactivation
    // ----------------------------------------------------
    console.log('\nTest 15: Pipeline error lifecycle and safe reactivation');
    clearRegistry();

    let capturedErrorA = null;
    const peerBResults = [];

    // Rule A: Math operator references a non-existent field, causing getNumericValue to throw
    const ruleFatalA = createMockRule({
      graphId: 'rule-pipeline-error-a',
      name: 'Fatal Pipeline Rule A',
      nodes: [
        { id: 's1', type: 'source', config: { field: 'temperature' } },
        { id: 'm1', type: 'math', config: { field: 'unmapped_missing_field', factor: 1.5 } }
      ],
      edges: [{ source: 's1', target: 'm1' }]
    });

    // Rule B: Healthy peer rule
    const ruleHealthyB = createMockRule({
      graphId: 'rule-healthy-peer-b',
      name: 'Healthy Peer Rule B'
    });

    activateRule(ruleFatalA, { onError: (err) => { capturedErrorA = err; } });
    activateRule(ruleHealthyB, { onResult: (res) => peerBResults.push(res) });

    assert(getActiveRuleCount() === 2, 'Initial active count is 2');
    assert(isRuleActive('rule-pipeline-error-a') === true, 'Rule A initially active');
    assert(isRuleActive('rule-healthy-peer-b') === true, 'Rule B initially active');

    // Publish 1st telemetry record: triggers Rule A pipeline error
    publishTelemetry(createMockTelemetry());

    // A. Rule A pipeline error terminates its subscription
    assert(capturedErrorA !== null, 'Rule A pipeline error was captured in onError (A)');

    // B. Rule B continues processing telemetry
    assert(peerBResults.length === 1, 'Rule B processed telemetry successfully despite Rule A error (B)');

    // C. Rule A is removed from the active registry
    assert(getActiveRule('rule-pipeline-error-a') === null, 'Rule A removed from active registry (C)');

    // D. isRuleActive(A) returns false
    assert(isRuleActive('rule-pipeline-error-a') === false, 'isRuleActive(A) returns false after termination (D)');

    // E. Active rule count decreases correctly
    assert(getActiveRuleCount() === 1, 'Active rule count decreased from 2 to 1 (E)');

    // F. Active rule IDs exclude Rule A
    const activeIdsAfterError = getActiveRuleIds();
    assert(
      !activeIdsAfterError.includes('rule-pipeline-error-a') && activeIdsAfterError.includes('rule-healthy-peer-b'),
      'Active rule IDs exclude Rule A and retain Rule B (F)'
    );

    // G. Rule A can be reactivated using the same graphId
    const ruleAFixed = createMockRule({
      graphId: 'rule-pipeline-error-a',
      name: 'Fixed Rule A'
    });
    const reactivatedA = activateRule(ruleAFixed, {
      onResult: (res) => peerBResults.push(res)
    });
    assert(reactivatedA.activated === true, 'Rule A reactivated successfully with same graphId (G)');
    assert(isRuleActive('rule-pipeline-error-a') === true, 'isRuleActive(A) is true after reactivation');
    assert(getActiveRuleCount() === 2, 'Active rule count restored to 2');

    // H. A second telemetry emission is processed by the reactivated rule
    const bCountBefore = peerBResults.length;
    publishTelemetry(createMockTelemetry());
    assert(peerBResults.length === bCountBefore + 2, 'Second telemetry emission processed by both reactivated Rule A and Rule B (H)');

    // ----------------------------------------------------
    // Test 16: Throwing onError callback isolation
    // ----------------------------------------------------
    console.log('\nTest 16: Throwing onError callback isolation');
    clearRegistry();

    const throwingErrorRule = createMockRule({
      graphId: 'rule-throwing-onerror',
      nodes: [
        { id: 's1', type: 'source', config: { field: 'temperature' } },
        { id: 'm1', type: 'math', config: { field: 'missing_field_throw', factor: 2 } }
      ],
      edges: [{ source: 's1', target: 'm1' }]
    });

    const unaffectedPeerResults = [];
    const unaffectedRule = createMockRule({
      graphId: 'rule-unaffected-peer'
    });

    // onError callback explicitly throws an unhandled exception
    activateRule(throwingErrorRule, {
      onError: () => {
        throw new Error('Explosion from inside consumer onError hook!');
      }
    });

    activateRule(unaffectedRule, {
      onResult: (res) => unaffectedPeerResults.push(res)
    });

    // Publish telemetry: throwing onError must not crash process or stop unaffected peer
    publishTelemetry(createMockTelemetry());

    assert(unaffectedPeerResults.length === 1, 'Unaffected peer processed telemetry despite throwing onError (I)');
    assert(isRuleActive('rule-throwing-onerror') === false, 'Failed rule cleaned up even when its onError threw');
    assert(getActiveRuleCount() === 1, 'Registry count accurately reflects only surviving peer rule');

    // ----------------------------------------------------
    // Test 17: Identity-safe cleanup prevention against newer subscription
    // ----------------------------------------------------
    console.log('\nTest 17: Identity-safe cleanup prevention against newer subscription');
    clearRegistry();

    // 1. Rule J initial configuration configured to fail on telemetry
    const ruleJ = createMockRule({
      graphId: 'rule-id-race-check',
      name: 'Initial Crashing Rule J',
      nodes: [
        { id: 's1', type: 'source', config: { field: 'temperature' } },
        { id: 'm1', type: 'math', config: { field: 'missing_field_trigger', factor: 1 } }
      ],
      edges: [{ source: 's1', target: 'm1' }]
    });

    const newRuleJ = createMockRule({
      graphId: 'rule-id-race-check',
      name: 'New Replacement Rule J'
    });

    let oldSubErrorHandled = false;
    let replacementRuleActivated = false;
    const newSubscriptionResults = [];

    // Consumer immediately reacts to error by activating a replacement rule under the same graphId
    activateRule(ruleJ, {
      onError: () => {
        oldSubErrorHandled = true;
        const result = activateRule(newRuleJ, {
          onResult: (res) => newSubscriptionResults.push(res)
        });
        replacementRuleActivated = result.activated;
      }
    });

    assert(isRuleActive('rule-id-race-check') === true, 'Initial rule activated');

    // 2. Publish telemetry to trigger error in initial rule
    publishTelemetry(createMockTelemetry());

    // 3. Verify old subscription's error hook ran and replacement rule was activated
    assert(oldSubErrorHandled === true, 'Old subscription error handler executed');
    assert(replacementRuleActivated === true, 'Replacement rule activated inside onError');

    // 4. Verify identity-safe check protected the new subscription from being deleted by old cleanup
    assert(isRuleActive('rule-id-race-check') === true, 'New subscription was NOT deleted by old error callback (J)');
    assert(getActiveRuleCount() === 1, 'Active rule count remains 1');
    assert(getActiveRule('rule-id-race-check').name === 'New Replacement Rule J', 'Registry holds new subscription');

    // 5. Verify new subscription receives and processes subsequent telemetry
    publishTelemetry(createMockTelemetry());
    assert(newSubscriptionResults.length === 1, 'New replacement subscription continues processing telemetry');

  } finally {
    clearRegistry();
  }

  // ----------------------------------------------------
  // Summary
  // ----------------------------------------------------
  console.log('\n==================================================');
  console.log(` Tests passed: ${passedCount}`);
  console.log(` Tests failed: ${failedCount}`);
  console.log('==================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
};

runTests().catch((err) => {
  console.error('Unhandled test failure:', err);
  process.exit(1);
});
