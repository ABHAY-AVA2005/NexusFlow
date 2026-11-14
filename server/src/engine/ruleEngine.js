const { compileGraph } = require('../compiler/graphCompiler');

function createRuleEngine(graph) {
  const compiled = compileGraph(graph);

  function evaluateNode(node, input) {
    const config = node.config || {};
    const field = config.field || 'value';
    const threshold = config.threshold;

    if (node.type === 'source') {
      return input;
    }

    if (node.type === 'math') {
      const value = Number(input?.[field] ?? input ?? 0);
      const factor = Number(config.factor || 1);
      return {
        ...input,
        [field]: Number((value * factor).toFixed(2)),
      };
    }

    if (node.type === 'filter') {
      const value = Number(input?.[field] ?? input ?? 0);
      const minimum = Number(config.minimum ?? Number.NEGATIVE_INFINITY);
      const maximum = Number(config.maximum ?? Number.POSITIVE_INFINITY);

      const inRange = value >= minimum && value <= maximum;
      return inRange ? { ...input, [field]: value } : null;
    }

    if (node.type === 'action') {
      const value = Number(input?.[field] ?? input ?? 0);
      if (threshold === undefined) {
        return {
          ...input,
          alert: true,
          message: config.message || 'Action triggered',
        };
      }

      if (value >= Number(threshold)) {
        return {
          ...input,
          alert: true,
          message: config.message || 'Threshold exceeded',
        };
      }

      return {
        ...input,
        alert: false,
      };
    }

    return input;
  }

  function processTelemetry(record) {
    let current = record;

    for (const node of compiled.nodes) {
      current = evaluateNode(node, current);
      if (current === null) {
        return null;
      }
    }

    return current;
  }

  return {
    compiled,
    processTelemetry,
  };
}

module.exports = {
  createRuleEngine,
};
