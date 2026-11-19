import React, { useState } from 'react';
import TelemetryDashboard from './components/dashboard/TelemetryDashboard';
import RuleBuilder from './canvas/RuleBuilder';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#07111f', overflow: 'hidden' }}>
      <div
        style={{
          height: '54px',
          background: '#0d1b2a',
          borderBottom: '1px solid #1e293b',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 20px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#38bdf8' }}>NexusFlow</span>
          <span style={{ fontSize: '0.75rem', background: '#1e293b', color: '#94a3b8', padding: '2px 8px', borderRadius: '4px' }}>
            v0.1.0-alpha
          </span>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setActiveTab('dashboard')}
            style={{
              background: activeTab === 'dashboard' ? '#1e293b' : 'transparent',
              color: activeTab === 'dashboard' ? '#38bdf8' : '#94a3b8',
              border: activeTab === 'dashboard' ? '1px solid #38bdf8' : '1px solid transparent',
              borderRadius: '6px',
              padding: '6px 14px',
              cursor: 'pointer',
            }}
          >
            Live Telemetry Dashboard
          </button>
          <button
            onClick={() => setActiveTab('canvas')}
            style={{
              background: activeTab === 'canvas' ? '#1e293b' : 'transparent',
              color: activeTab === 'canvas' ? '#38bdf8' : '#94a3b8',
              border: activeTab === 'canvas' ? '1px solid #38bdf8' : '1px solid transparent',
              borderRadius: '6px',
              padding: '6px 14px',
              cursor: 'pointer',
            }}
          >
            Visual Rule Builder
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {activeTab === 'dashboard' ? <TelemetryDashboard /> : <RuleBuilder />}
      </div>
    </div>
  );
}
