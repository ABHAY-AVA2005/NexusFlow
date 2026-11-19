const { WebSocket, WebSocketServer } = require('ws');

let webSocketServer;

function startTelemetryWebSocketServer(port) {
  if (webSocketServer) {
    throw new Error('Telemetry WebSocket server is already running.');
  }

  webSocketServer = new WebSocketServer({ port });
  webSocketServer.on('error', (error) => {
    console.error(`Telemetry WebSocket error: ${error.message}`);
  });

  return webSocketServer;
}

function broadcastTelemetry(telemetry) {
  if (!webSocketServer) {
    return;
  }

  const message = JSON.stringify(telemetry);
  webSocketServer.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message, (error) => {
        if (error) {
          console.error(`Failed to broadcast telemetry: ${error.message}`);
        }
      });
    }
  });
}

function broadcastAlert(alert) {
  if (!webSocketServer) {
    return;
  }

  const message = JSON.stringify({ type: 'alert', alert });
  webSocketServer.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

module.exports = {
  startTelemetryWebSocketServer,
  broadcastTelemetry,
  broadcastAlert,
};
