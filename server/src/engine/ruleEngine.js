/**
 * @module server/engine/ruleEngine
 * @description Compiles and executes rule graphs against records or telemetry streams.
 */
const { of, firstValueFrom } = require('rxjs');
const { defaultIfEmpty } = require('rxjs/operators');
const { compileGraph, compileGraphToStream } = require('../compiler/graphCompiler');

function createRuleEngine(graph) {
  const compiled = compileGraph(graph);

  function processStream(telemetry$) {
    return compileGraphToStream(graph, telemetry$);
  }

  async function processTelemetry(recordOrRecords) {
    if (Array.isArray(recordOrRecords)) {
      const results = await Promise.all(
        recordOrRecords.map((record) => processTelemetry(record))
      );
      return results.filter((result) => result !== null && result !== undefined);
    }

    return firstValueFrom(processStream(of(recordOrRecords)).pipe(defaultIfEmpty(null)));
  }

  return {
    compiled,
    processStream,
    processTelemetry,
  };
}

module.exports = {
  createRuleEngine,
};
