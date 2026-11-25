import React, { useEffect, useState } from 'react';

export default function AlertToast({ alert, onDismiss }) {
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    if (!alert) return;

    setProgress(100);
    const duration = 6000; // 6 seconds auto-dismiss
    const interval = 50;
    const step = (interval / duration) * 100;

    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev <= step) {
          clearInterval(timer);
          onDismiss();
          return 0;
        }
        return prev - step;
      });
    }, interval);

    return () => clearInterval(timer);
  }, [alert, onDismiss]);

  if (!alert) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        zIndex: 9999,
        background: '#1b263b',
        border: '1px solid #ef4444',
        borderRadius: '10px',
        padding: '16px 20px',
        color: '#fff',
        boxShadow: '0 8px 30px rgba(239, 68, 68, 0.45)',
        minWidth: '320px',
        maxWidth: '420px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        animation: 'slideIn 0.3s ease-out',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '1.2rem' }}>⚠️</span>
          <strong style={{ color: '#f87171', fontSize: '0.9rem', letterSpacing: '0.5px' }}>
            CRITICAL THRESHOLD BREACH
          </strong>
        </div>
        <button
          onClick={onDismiss}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#94a3b8',
            fontSize: '1rem',
            cursor: 'pointer',
            padding: '0 4px',
          }}
        >
          ✕
        </button>
      </div>

      <div style={{ fontSize: '0.85rem', color: '#f1f5f9' }}>{alert.message}</div>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#94a3b8' }}>
        <span>Node: <strong style={{ color: '#38bdf8' }}>{alert.sensorId}</strong></span>
        <span>{alert.timestamp}</span>
      </div>

      {/* Progress countdown bar */}
      <div style={{ width: '100%', height: '3px', background: '#334155', borderRadius: '2px', overflow: 'hidden', marginTop: '4px' }}>
        <div
          style={{
            height: '100%',
            width: `${progress}%`,
            background: '#ef4444',
            transition: 'width 50ms linear',
          }}
        />
      </div>
    </div>
  );
}