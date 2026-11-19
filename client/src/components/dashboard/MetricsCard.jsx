import React from 'react';

export default function MetricsCard({ sensorId, data }) {
  if (!data) return null;

  const isCritical = data.anomaly || data.temperature > 85;
  const isWarning = data.temperature > 78 && !isCritical;

  const statusColor = isCritical ? '#ef4444' : isWarning ? '#f59e0b' : '#10b981';
  const statusText = isCritical ? 'CRITICAL' : isWarning ? 'WARNING' : 'OPTIMAL';

  return (
    <div
      style={{
        background: '#0d1b2a',
        border: `1px solid ${statusColor}44`,
        borderRadius: '10px',
        padding: '16px',
        color: '#e0e1dd',
        boxShadow: isCritical ? '0 0 14px rgba(239, 68, 68, 0.25)' : 'none',
        transition: 'all 0.3s ease',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h4 style={{ margin: 0, fontSize: '1.1rem', color: '#93c5fd' }}>{sensorId}</h4>
        <span
          style={{
            background: `${statusColor}22`,
            color: statusColor,
            border: `1px solid ${statusColor}66`,
            padding: '2px 8px',
            borderRadius: '12px',
            fontSize: '0.75rem',
            fontWeight: 'bold',
          }}
        >
          {statusText}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <div>
          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Temperature</span>
          <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: data.temperature > 85 ? '#ef4444' : '#f8fafc' }}>
            {data.temperature}°C
          </div>
        </div>

        <div>
          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Pressure</span>
          <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#f8fafc' }}>
            {data.pressure} PSI
          </div>
        </div>

        <div>
          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Vibration</span>
          <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: data.vibration > 5.5 ? '#ef4444' : '#f8fafc' }}>
            {data.vibration} mm/s
          </div>
        </div>

        <div>
          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Speed</span>
          <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#f8fafc' }}>
            {data.rpm} RPM
          </div>
        </div>
      </div>

      <div style={{ marginTop: '12px', fontSize: '0.7rem', color: '#64748b', textAlign: 'right' }}>
        Updated: {data.time || 'Live'}
      </div>
    </div>
  );
}
