import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';

export default function SensorChart({ data }) {
  // Metric & filter visibility toggles
  const [showTemp, setShowTemp] = useState(true);
  const [showSMA, setShowSMA] = useState(true); // 5-point Simple Moving Average
  const [showVib, setShowVib] = useState(true);
  const [showPress, setShowPress] = useState(false);

  // Compute 5-point Simple Moving Average & Alert Markers
  const enrichedData = useMemo(() => {
    return data.map((item, idx, arr) => {
      const windowSize = 5;
      const start = Math.max(0, idx - windowSize + 1);
      const windowSlice = arr.slice(start, idx + 1);
      const sma = Number(
        (windowSlice.reduce((sum, curr) => sum + curr.temperature, 0) / windowSlice.length).toFixed(1)
      );

      const isAnomalyPoint = item.anomaly || item.temperature > 85 || item.vibration > 5.5;

      return {
        ...item,
        movingAverage: sma,
        anomalyMarker: isAnomalyPoint ? item.temperature : null,
      };
    });
  }, [data]);

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
      {/* Chart Header & Interactive Filter Toggles */}
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
            📈 Telemetry Stream with Moving Average Filter
          </h3>
          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
            Real-time noise filtering and anomaly marker overlay
          </span>
        </div>

        {/* Filter Toggle Pills */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
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
            ● Raw Temp (°C)
          </button>

          <button
            onClick={() => setShowSMA(!showSMA)}
            style={{
              background: showSMA ? '#c084fc22' : 'transparent',
              color: showSMA ? '#c084fc' : '#64748b',
              border: `1px solid ${showSMA ? '#c084fc' : '#334155'}`,
              borderRadius: '20px',
              padding: '4px 12px',
              fontSize: '0.75rem',
              fontWeight: '500',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            ● Moving Avg (SMA-5)
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

      {/* Chart Canvas */}
      <div style={{ height: '270px', width: '100%' }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={enrichedData}>
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
            <YAxis stroke="#64748b" tick={{ fontSize: 11 }} domain={[0, 115]} />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1b263b',
                borderColor: '#415a77',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '12px',
              }}
            />

            {/* Critical Threshold Line */}
            <ReferenceLine
              y={85}
              stroke="#f43f5e"
              strokeDasharray="4 4"
              label={{ value: 'CRITICAL 85°C', fill: '#f43f5e', fontSize: 10, position: 'top' }}
            />

            {/* Raw Temperature Area */}
            {showTemp && (
              <Area
                type="monotone"
                dataKey="temperature"
                name="Raw Temperature"
                stroke="#38bdf8"
                strokeWidth={1.5}
                fillOpacity={1}
                fill="url(#tempGradient)"
                isAnimationActive={false}
              />
            )}

            {/* 5-Point Simple Moving Average Filter */}
            {showSMA && (
              <Line
                type="monotone"
                dataKey="movingAverage"
                name="Moving Average (SMA-5)"
                stroke="#c084fc"
                strokeWidth={2.5}
                strokeDasharray="4 2"
                dot={false}
                isAnimationActive={false}
              />
            )}

            {/* Anomaly Highlight Markers (Red Dots) */}
            <Line
              type="monotone"
              dataKey="anomalyMarker"
              name="Anomaly Spike"
              stroke="transparent"
              dot={{ r: 5, fill: '#ef4444', stroke: '#fff', strokeWidth: 1.5 }}
              isAnimationActive={false}
            />

            {/* Vibration Area */}
            {showVib && (
              <Area
                type="monotone"
                dataKey="vibration"
                name="Vibration"
                stroke="#34d399"
                strokeWidth={1.5}
                fillOpacity={1}
                fill="url(#vibGradient)"
                isAnimationActive={false}
              />
            )}

            {/* Pressure Line */}
            {showPress && (
              <Line
                type="monotone"
                dataKey="pressure"
                name="Pressure"
                stroke="#fbbf24"
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}