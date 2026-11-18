import React from 'react';
import { useTelemetrySocket } from '../../hooks/useTelemetrySocket';
import MetricsCard from './MetricsCard';
import SensorChart from './SensorChart';
import AlertsPanel from './AlertsPanel';

export default function TelemetryDashboard() {
  const {
    telemetryData,
    alerts,
    connectionStatus,
    isPaused,
    togglePause,
    manualReconnect,
    sensorSummary,
    clearAlerts,
  } = useTelemetrySocket();

  const activeSensors = Object.keys(sensorSummary);

  const getStatusBadge = () => {
    switch (connectionStatus) {
      case 'CONNECTED':
        return { label: 'WebSocket Live', color: '#10b981' };
      case 'RECONNECTING':
        return { label: 'Reconnecting...', color: '#f59e0b' };
      case 'SIMULATED':
      default:
        return { label: 'Simulated Stream', color: '#38bdf8' };
    }
  };

  const status = getStatusBadge();

  return (
    <div style={{ padding: '24px', background: '#07111f', minHeight: '100vh', color: '#e0e1dd' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.6rem', color: '#f8fafc', fontWeight: 'bold' }}>
            ⚡ NexusFlow Telemetry & Rule Monitor
          </h1>
          <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '0.85rem' }}>
            Real-time IoT streaming pipeline & anomaly evaluation engine
          </p>
        </div>

        {/* Controls Bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Pause / Resume Button */}
          <button
            onClick={togglePause}
            style={{
              background: isPaused ? '#ef444422' : '#1e293b',
              color: isPaused ? '#ef4444' : '#94a3b8',
              border: `1px solid ${isPaused ? '#ef4444' : '#334155'}`,
              borderRadius: '6px',
              padding: '6px 12px',
              fontSize: '0.8rem',
              cursor: 'pointer',
              fontWeight: '500',
            }}
          >
            {isPaused ? '▶ Resume Stream' : '⏸ Pause Stream'}
          </button>

          {/* Connection State Badge */}
          <div
            onClick={connectionStatus !== 'CONNECTED' ? manualReconnect : undefined}
            title={connectionStatus !== 'CONNECTED' ? 'Click to reconnect' : ''}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.8rem',
              background: '#0d1b2a',
              border: `1px solid ${status.color}44`,
              padding: '6px 12px',
              borderRadius: '8px',
              cursor: connectionStatus !== 'CONNECTED' ? 'pointer' : 'default',
            }}
          >
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: status.color,
                boxShadow: `0 0 8px ${status.color}`,
              }}
            />
            <span style={{ color: status.color, fontWeight: '500' }}>{status.label}</span>
          </div>

          <div style={{ background: '#1e293b', padding: '6px 12px', borderRadius: '8px', fontSize: '0.8rem' }}>
            Active Machines: <strong style={{ color: '#38bdf8' }}>{activeSensors.length || 4}</strong>
          </div>
        </div>
      </div>

      {/* Metrics Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        {activeSensors.length > 0 ? (
          activeSensors.map((id) => (
            <MetricsCard key={id} sensorId={id} data={sensorSummary[id]} />
          ))
        ) : (
          ['turbine-01', 'boiler-04', 'pump-12', 'conveyor-09'].map((id) => (
            <MetricsCard
              key={id}
              sensorId={id}
              data={{
                temperature: 75.0,
                pressure: 30.0,
                vibration: 2.1,
                rpm: 2950,
                status: 'NORMAL',
                time: 'Initializing...',
              }}
            />
          ))
        )}
      </div>

      {/* Live Stream Chart & Alerts Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px', flexWrap: 'wrap' }}>
        <SensorChart data={telemetryData} />
        <AlertsPanel alerts={alerts} onClear={clearAlerts} />
      </div>
    </div>
  );
}