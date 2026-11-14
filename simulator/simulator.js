const INTERVAL_MS = 1500;

function randomValue(min, max) {
  return Number((Math.random() * (max - min) + min).toFixed(2));
}

function generateTelemetry() {
  const temperature = randomValue(68, 96);
  const pressure = randomValue(20, 42);
  const vibration = randomValue(0.5, 7.5);

  return {
    timestamp: new Date().toISOString(),
    sensor: 'turbine-01',
    temperature,
    pressure,
    vibration,
    anomaly: temperature > 88 || vibration > 5.5,
  };
}

console.log('NexusFlow telemetry simulator started.');

setInterval(() => {
  const telemetry = generateTelemetry();
  console.log(JSON.stringify(telemetry));
}, INTERVAL_MS);
