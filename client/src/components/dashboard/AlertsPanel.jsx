import React from 'react';

export default function AlertsPanel({ alerts, onClear }) {
  return (
    <div
      style={{
        background: '#0d1b2a',
        borderRadius: '10px',
        padding: '16px',
        border: '1px solid #1e293b',
        color: '#e0e1dd',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        maxHeight: '380px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', color: '#f87171' }}>Active Alerts & Rules</h3>
          <span
            style={{
              background: '#ef444422',
              color: '#ef4444',
              borderRadius: '999px',
              padding: '2px 8px',
              fontSize: '0.75rem',
              fontWeight: 'bold',
            }}
          >
            {alerts.length}
          </span>
        </div>
        {alerts.length > 0 && (
          <button
            onClick={onClear}
            style={{
              background: 'transparent',
              border: '1px solid #475569',
              color: '#94a3b8',
              borderRadius: '6px',
              padding: '4px 8px',
              fontSize: '0.75rem',
              cursor: 'pointer',
            }}
          >
            Clear All
          </button>
        )}
      </div>

      <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {alerts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px', color: '#64748b', fontSize: '0.85rem' }}>
            ✅ No anomalies detected. System operating within normal parameters.
          </div>
        ) : (
          alerts.map((alert) => (
            <div
              key={alert.id}
              style={{
                background: '#1b263b',
                borderLeft: '4px solid #ef4444',
                padding: '10px 12px',
                borderRadius: '4px',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                <strong style={{ color: '#fca5a5' }}>{alert.sensorId}</strong>
                <span style={{ color: '#94a3b8' }}>{alert.timestamp}</span>
              </div>
              <div style={{ fontSize: '0.8rem', color: '#e2e8f0' }}>{alert.message}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
