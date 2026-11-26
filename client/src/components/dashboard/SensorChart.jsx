/**
 * @module client/dashboard/SensorChart
 * @description Draws recent sensor readings as a line chart. It keeps only a manageable
 * history window so the graph stays fast and does not grow forever in browser memory.
 */
import React, { useState } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';

export default function SensorChart({ data }) {
  // Metric visibility toggles
  const [showTemp, setShowTemp] = useState(true);
  const [showVib, setShowVib] = useState(true);
  const [showPress, setShowPress] = useState(true);

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
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
      }}
    >
      {/* Chart Header & Interactive Metric Toggles */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#f8fafc', fontWeight: '600' }}>
            📈 Real-Time Multi-Metric Stream
          </h3>
          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
            Click pills below to toggle metrics on/off
          </span>
        </div>

        {/* Toggle Pills */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setShowTemp(!showTemp)}
            style={{
              background: showTemp ? '#38bdf822' : 'transparent',
              color: showTemp ? '#38bdf8' : '#64748b',
              border: `1px solid ${showTemp ? '#38bdf8' : '#334155'}`,
              borderRadius: '20px',
              padding: '4px 12px',
              fontSize: '0.75rem',
              fontWeight: '500',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            ● Temperature (°C)
          </button>

          <button
            onClick={() => setShowVib(!showVib)}
            style={{
              background: showVib ? '#34d39922' : 'transparent',
              color: showVib ? '#34d399' : '#64748b',
              border: `1px solid ${showVib ? '#34d399' : '#334155'}`,
              borderRadius: '20px',
              padding: '4px 12px',
              fontSize: '0.75rem',
              fontWeight: '500',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            ● Vibration (mm/s)
          </button>

          <button
            onClick={() => setShowPress(!showPress)}
            style={{
              background: showPress ? '#fbbf2422' : 'transparent',
              color: showPress ? '#fbbf24' : '#64748b',
              border: `1px solid ${showPress ? '#fbbf24' : '#334155'}`,
              borderRadius: '20px',
              padding: '4px 12px',
              fontSize: '0.75rem',
              fontWeight: '500',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            ● Pressure (PSI)
          </button>
        </div>
      </div>

      {/* Chart Container */}
      <div style={{ height: '270px', width: '100%' }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data}>
            <defs>
              <linearGradient id="tempGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.0} />
              </linearGradient>
              <linearGradient id="vibGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#34d399" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#34d399" stopOpacity={0.0} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="time" stroke="#64748b" tick={{ fontSize: 11 }} />
            <YAxis
              yAxisId="measurements"
              stroke="#64748b"
              tick={{ fontSize: 11 }}
              domain={[0, 115]}
              label={{ value: '°C / mm/s', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 10 }}
            />
            <YAxis
              yAxisId="pressure"
              orientation="right"
              stroke="#fbbf24"
              tick={{ fontSize: 11, fill: '#fbbf24' }}
              domain={[0, 80]}
              label={{ value: 'PSI', angle: 90, position: 'insideRight', fill: '#fbbf24', fontSize: 10 }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1b263b',
                borderColor: '#415a77',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '12px',
              }}
            />

            {showTemp && (
              <ReferenceLine
                yAxisId="measurements"
                y={85}
                stroke="#f43f5e"
                strokeDasharray="4 4"
                label={{ value: 'CRITICAL 85°C', fill: '#f43f5e', fontSize: 10, position: 'top' }}
              />
            )}

            {showTemp && (
              <Area
                yAxisId="measurements"
                type="monotone"
                dataKey="temperature"
                stroke="#38bdf8"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#tempGradient)"
                isAnimationActive={false}
              />
            )}

            {showVib && (
              <Area
                yAxisId="measurements"
                type="monotone"
                dataKey="vibration"
                stroke="#34d399"
                strokeWidth={1.5}
                fillOpacity={1}
                fill="url(#vibGradient)"
                isAnimationActive={false}
              />
            )}

            {showPress && (
              <Line
                yAxisId="pressure"
                type="monotone"
                dataKey="pressure"
                stroke="#fbbf24"
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}