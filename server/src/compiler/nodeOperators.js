/**
 * @module server/compiler/nodeOperators
 * @description Maps visual rule node types to RxJS operators and validated numeric values.
 */
const { filter, map } = require('rxjs/operators');

function getNumericValue(input, field) {
  const rawValue = input && typeof input === 'object' ? input[field] : input;
  const value = Number(rawValue ?? 0);

  if (!Number.isFinite(value)) {
    throw new Error(`Telemetry field "${field}" must be a finite number.`);
  }

  return value;
}

function getNodeOperator(node) {
  const config = node.config || {};
  const field = config.field || 'value';

  if (node.type === 'source') {
    return map((record) => record);
  }

  if (node.type === 'math') {
    const factor = Number(config.factor ?? 1);
    if (!Number.isFinite(factor)) {
      throw new Error(`Node ${node.id} requires a finite math factor.`);
    }

    return map((input) => {
      const value = getNumericValue(input, field);
      return {
        ...input,
        [field]: Number((value * factor).toFixed(2)),
      };
    });
  }

  if (node.type === 'filter') {
    const minimum = config.minimum === undefined ? Number.NEGATIVE_INFINITY : Number(config.minimum);
    const maximum = config.maximum === undefined ? Number.POSITIVE_INFINITY : Number(config.maximum);

    if (Number.isNaN(minimum) || Number.isNaN(maximum) || minimum > maximum) {
      throw new Error(`Node ${node.id} requires a valid filter range.`);
    }

    return filter((input) => {
      const value = getNumericValue(input, field);
      return value >= minimum && value <= maximum;
    });
  }

  if (node.type === 'action') {
    const threshold = config.threshold === undefined ? undefined : Number(config.threshold);
    if (threshold !== undefined && !Number.isFinite(threshold)) {
      throw new Error(`Node ${node.id} requires a finite action threshold.`);
    }

    return map((input) => {
      const value = getNumericValue(input, field);
      const alert = threshold === undefined || value >= threshold;

      return {
        ...input,
        alert,
        ...(alert ? { message: config.message || (threshold === undefined ? 'Action triggered' : 'Threshold exceeded') } : {}),
      };
    });
  }

  throw new Error(`Node ${node.id} has unsupported type: ${node.type}`);
}

module.exports = {
  getNodeOperator,
};
