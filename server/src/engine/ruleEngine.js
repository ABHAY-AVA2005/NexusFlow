const { of, firstValueFrom } = require('rxjs');
const { defaultIfEmpty } = require('rxjs/operators');
const { compileGraph, compileGraphToStream } = require('../compiler/graphCompiler');

function createRuleEngine(graph) {
  const compiled = compileGraph(graph);

  function processStream(telemetry$) {
    return compileGraphToStream(graph, telemetry$);
  }

  async function processTelemetry(record) {
    return firstValueFrom(processStream(of(record)).pipe(defaultIfEmpty(null)));
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
