/**
 * @module client/dashboard/AlertsPanel
 * @description Displays rule-triggered alerts and explains their severity. Users can
 * filter the list and download a JSON incident report for a maintenance review.
 */
import React, { useState, useEffect, useRef } from 'react';

export default function AlertsPanel({ alerts, onClear }) {
  const [filter, setFilter] = useState('ALL'); // 'ALL' | 'CRITICAL'
  const [soundEnabled, setSoundEnabled] = useState(false);
  const audioContextRef = useRef(null);

  // Web Audio API chime synthesizer (self-contained, zero external files required)
  const playAlertChime = () => {
    if (!soundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = audioContextRef.current || new AudioCtx();
      audioContextRef.current = ctx;
      if (ctx.state === 'suspended') ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 note
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.25); // ramp to A4

      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } catch {}
  };

  const toggleSound = () => {
    if (!soundEnabled) {
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          const ctx = audioContextRef.current || new AudioCtx();
          audioContextRef.current = ctx;
          if (ctx.state === 'suspended') ctx.resume();
          setSoundEnabled(true);
        }
      } catch {}
    } else {
      setSoundEnabled(false);
    }
  };

  // Play chime whenever a new critical alert arrives
  useEffect(() => {
    if (alerts.length > 0 && alerts[0].severity === 'HIGH') {
      playAlertChime();
    }
  }, [alerts.length, soundEnabled]);

  // Export alert log to a JSON file for incident reporting
  const exportAlerts = () => {
    if (alerts.length === 0) return;
    const blob = new Blob([JSON.stringify(alerts, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nexusflow-alerts-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const criticalAlerts = alerts.filter((a) => a.severity === 'HIGH');
  const filteredAlerts = filter === 'CRITICAL' ? criticalAlerts : alerts;

  return (
    <div
      style={{
        background: '#0d1b2a',
        borderRadius: '12px',
        padding: '20px',
        border: '1px solid #1e293b',
        color: '#e0e1dd',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        maxHeight: '400px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
      }}
    >
      {/* Top Header & Audio Chime Toggle */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#f87171', fontWeight: '600' }}>
            🚨 Anomaly & Rule Alerts
          </h3>
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

        <button
          onClick={toggleSound}
          title="Toggle audio alert chime"
          style={{
            background: soundEnabled ? '#10b98122' : '#1e293b',
            color: soundEnabled ? '#10b981' : '#94a3b8',
            border: `1px solid ${soundEnabled ? '#10b981' : '#334155'}`,
            borderRadius: '6px',
            padding: '4px 10px',
            fontSize: '0.75rem',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          {soundEnabled ? '🔔 Sound ON' : '🔕 Sound OFF'}
        </button>
      </div>

      {/* Filter Tabs & Action Buttons */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', gap: '6px' }}>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            onClick={() => setFilter('ALL')}
            style={{
              background: filter === 'ALL' ? '#38bdf822' : 'transparent',
              color: filter === 'ALL' ? '#38bdf8' : '#64748b',
              border: `1px solid ${filter === 'ALL' ? '#38bdf8' : 'transparent'}`,
              borderRadius: '6px',
              padding: '3px 8px',
              fontSize: '0.75rem',
              cursor: 'pointer',
            }}
          >
            All ({alerts.length})
          </button>
          <button
            onClick={() => setFilter('CRITICAL')}
            style={{
              background: filter === 'CRITICAL' ? '#ef444422' : 'transparent',
              color: filter === 'CRITICAL' ? '#ef4444' : '#64748b',
              border: `1px solid ${filter === 'CRITICAL' ? '#ef4444' : 'transparent'}`,
              borderRadius: '6px',
              padding: '3px 8px',
              fontSize: '0.75rem',
              cursor: 'pointer',
            }}
          >
            Critical ({criticalAlerts.length})
          </button>
        </div>

        <div style={{ display: 'flex', gap: '6px' }}>
          {alerts.length > 0 && (
            <button
              onClick={exportAlerts}
              title="Export alert history to JSON"
              style={{
                background: 'transparent',
                border: '1px solid #334155',
                color: '#38bdf8',
                borderRadius: '6px',
                padding: '3px 8px',
                fontSize: '0.72rem',
                cursor: 'pointer',
              }}
            >
              📥 Export
            </button>
          )}

          {alerts.length > 0 && (
            <button
              onClick={onClear}
              style={{
                background: 'transparent',
                border: '1px solid #334155',
                color: '#94a3b8',
                borderRadius: '6px',
                padding: '3px 8px',
                fontSize: '0.72rem',
                cursor: 'pointer',
              }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Alert Feed */}
      <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {filteredAlerts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '36px 12px', color: '#64748b', fontSize: '0.85rem' }}>
            ✅ No anomalies detected. System operating within normal thresholds.
          </div>
        ) : (
          filteredAlerts.map((alert) => (
            <div
              key={alert.id}
              style={{
                background: '#1b263b',
                borderLeft: '4px solid #ef4444',
                padding: '10px 14px',
                borderRadius: '6px',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem' }}>
                <strong style={{ color: '#fca5a5' }}>{alert.sensorId}</strong>
                <span style={{ color: '#94a3b8', fontSize: '0.7rem' }}>{alert.timestamp}</span>
              </div>
              <div style={{ fontSize: '0.82rem', color: '#e2e8f0', fontWeight: 700 }}>{alert.message}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '5px 10px', marginTop: 4 }}>
                <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>
                  Source <strong style={{ color: '#cbd5e1' }}>{alert.source || 'NexusFlow monitor'}</strong>
                </div>
                <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>
                  Category <strong style={{ color: '#cbd5e1' }}>{alert.category || 'CRITICAL EVENT'}</strong>
                </div>
                {alert.metric && (
                  <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>
                    Metric <strong style={{ color: '#cbd5e1' }}>{alert.metric}</strong>
                  </div>
                )}
                {alert.actualValue !== undefined && (
                  <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>
                    Actual <strong style={{ color: '#fca5a5' }}>{alert.actualValue}{alert.unit || '°C'}</strong>
                  </div>
                )}
                {alert.threshold !== undefined && (
                  <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>
                    Threshold <strong style={{ color: '#cbd5e1' }}>{alert.threshold}{alert.unit || '°C'}</strong>
                  </div>
                )}
                {alert.location && (
                  <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>
                    Location <strong style={{ color: '#cbd5e1' }}>{alert.location}</strong>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}