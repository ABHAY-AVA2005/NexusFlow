/**
 * @module client/dashboard/MetricsCard
 * @description Renders a compact live sensor metric card with warning indicators.
 */
import React, { useRef, useEffect } from 'react';

export default function MetricsCard({ sensorId, data }) {
  const peakTempRef = useRef(data?.temperature || 70);

  // Update session peak value
  useEffect(() => {
    if (data?.temperature && data.temperature > peakTempRef.current) {
      peakTempRef.current = data.temperature;
    }
  }, [data?.temperature]);

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
        borderRadius: '12px',
        padding: '18px',
        color: '#e0e1dd',
        boxShadow: isCritical ? '0 0 16px rgba(239, 68, 68, 0.3)' : '0 4px 12px rgba(0,0,0,0.2)',
        transition: 'all 0.3s ease',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
        <div>
          <h4 style={{ margin: 0, fontSize: '1.1rem', color: '#93c5fd', fontWeight: '600' }}>{sensorId}</h4>
          <span style={{ fontSize: '0.7rem', color: '#64748b' }}>Industrial Telemetry Node</span>
        </div>
        <span
          style={{
            background: `${statusColor}22`,
            color: statusColor,
            border: `1px solid ${statusColor}66`,
            padding: '3px 10px',
            borderRadius: '14px',
            fontSize: '0.75rem',
            fontWeight: 'bold',
          }}
        >
          {statusText}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div>
          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Temperature</span>
          <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: data.temperature > 85 ? '#ef4444' : '#f8fafc' }}>
            {data.temperature}°C
          </div>
          <span style={{ fontSize: '0.65rem', color: '#64748b' }}>
            Peak: <strong style={{ color: peakTempRef.current > 85 ? '#f87171' : '#94a3b8' }}>{peakTempRef.current}°C</strong>
          </span>
        </div>

        <div>
          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Pressure</span>
          <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#f8fafc' }}>
            {data.pressure} PSI
          </div>
          <span style={{ fontSize: '0.65rem', color: '#64748b' }}>Nominal: 30 PSI</span>
        </div>

        <div>
          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Vibration</span>
          <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: data.vibration > 5.5 ? '#ef4444' : '#f8fafc' }}>
            {data.vibration} mm/s
          </div>
          <span style={{ fontSize: '0.65rem', color: '#64748b' }}>Limit: 5.5 mm/s</span>
        </div>

        <div>
          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Rotational Speed</span>
          <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#f8fafc' }}>
            {data.rpm} RPM
          </div>
          <span style={{ fontSize: '0.65rem', color: '#64748b' }}>Target: 3000 RPM</span>
        </div>
      </div>

      <div style={{ marginTop: '14px', paddingTop: '8px', borderTop: '1px solid #1e293b', fontSize: '0.7rem', color: '#64748b', display: 'flex', justifyContent: 'space-between' }}>
        <span>Status: {isCritical ? '⚠️ Anomaly Alert' : 'Normal Operation'}</span>
        <span>{data.time || 'Live'}</span>
      </div>
    </div>
  );
}