const http = require('http');
const https = require('https');
const config = require('../config/env');

async function postWebhook(payload) {
  if (!config.alertWebhookUrl) {
    return { delivered: false, transport: 'webhook', reason: 'Webhook URL is not configured' };
  }

  const url = new URL(config.alertWebhookUrl);
  const client = url.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const request = client.request({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || undefined,
      path: `${url.pathname}${url.search}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      timeout: 2000,
    }, (response) => {
      response.resume();
      resolve({
        delivered: response.statusCode >= 200 && response.statusCode < 300,
        transport: 'webhook',
        statusCode: response.statusCode,
      });
    });

    request.on('timeout', () => request.destroy(new Error('Webhook request timed out')));
    request.on('error', reject);
    request.end(JSON.stringify(payload));
  });
}

async function dispatchActionAlert(alert) {
  const payload = {
    source: 'NexusFlow',
    severity: 'HIGH',
    timestamp: new Date().toISOString(),
    ...alert,
  };

  try {
    const webhook = await postWebhook(payload);
    return { ok: true, payload, webhook, sms: { delivered: true, transport: 'mock-sms', recipient: 'factory-manager' } };
  } catch (error) {
    return { ok: false, payload, webhook: { delivered: false, transport: 'webhook', reason: error.message }, sms: { delivered: true, transport: 'mock-sms', recipient: 'factory-manager' } };
  }
}

module.exports = {
  dispatchActionAlert,
};
