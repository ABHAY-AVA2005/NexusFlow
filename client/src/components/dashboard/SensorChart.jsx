import React from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';

export default function SensorChart({ data }) {
  return (
    <div
      style={{
        background: '#0d1b2a',
        borderRadius: '10px',
        padding: '16px',
        border: '1px solid #1e293b',
        color: '#e0e1dd',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1rem', color: '#93c5fd' }}>Live Telemetry Stream</h3>
          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Real-time sliding window (latest readings)</span>
        </div>
        <div style={{ display: 'flex', gap: '14px', fontSize: '0.75rem' }}>
          <span style={{ color: '#38bdf8' }}>● Temperature (°C)</span>
          <span style={{ color: '#f43f5e' }}>● Critical Threshold (85°C)</span>
          <span style={{ color: '#34d399' }}>● Vibration (mm/s)</span>
        </div>
      </div>

      <div style={{ height: '260px', width: '100%' }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="time" stroke="#64748b" tick={{ fontSize: 11 }} />
            <YAxis yAxisId="temperature" stroke="#64748b" tick={{ fontSize: 11 }} domain={[40, 110]} />
            <YAxis yAxisId="vibration" orientation="right" stroke="#64748b" tick={{ fontSize: 11 }} domain={[0, 10]} />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1b263b',
                borderColor: '#415a77',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '12px',
              }}
            />
            <ReferenceLine yAxisId="temperature" y={85} stroke="#f43f5e" strokeDasharray="4 4" label={{ value: 'MAX 85°C', fill: '#f43f5e', fontSize: 10 }} />
            <Line
              type="monotone"
              dataKey="temperature"
              yAxisId="temperature"
              stroke="#38bdf8"
              strokeWidth={2}
              dot={{ r: 3, fill: '#38bdf8' }}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="vibration"
              yAxisId="vibration"
              stroke="#34d399"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
