import React, { useState } from 'react';
import TelemetryDashboard from './components/dashboard/TelemetryDashboard';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#07111f', overflow: 'hidden' }}>
      {/* Top Navigation Bar */}
      <div
        style={{
          height: '56px',
          background: '#0d1b2a',
          borderBottom: '1px solid #1e293b',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
          zIndex: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#38bdf8', letterSpacing: '0.5px' }}>
            ⚡ NexusFlow
          </span>
          <span style={{ fontSize: '0.75rem', background: '#1e293b', color: '#94a3b8', padding: '3px 8px', borderRadius: '4px' }}>
            v0.1.0-alpha
          </span>
        </div>

        {/* View Switcher Tabs */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setActiveTab('dashboard')}
            style={{
              background: activeTab === 'dashboard' ? '#1e293b' : 'transparent',
              color: activeTab === 'dashboard' ? '#38bdf8' : '#94a3b8',
              border: activeTab === 'dashboard' ? '1px solid #38bdf8' : '1px solid transparent',
              borderRadius: '6px',
              padding: '6px 14px',
              fontSize: '0.85rem',
              fontWeight: '500',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
          >
            📊 Live Telemetry Dashboard
          </button>
          <button
            onClick={() => setActiveTab('canvas')}
            style={{
              background: activeTab === 'canvas' ? '#1e293b' : 'transparent',
              color: activeTab === 'canvas' ? '#38bdf8' : '#94a3b8',
              border: activeTab === 'canvas' ? '1px solid #38bdf8' : '1px solid transparent',
              borderRadius: '6px',
              padding: '6px 14px',
              fontSize: '0.85rem',
              fontWeight: '500',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
          >
            🎨 Visual Rule Builder Canvas
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {activeTab === 'dashboard' ? (
          <TelemetryDashboard />
        ) : (
          <div
            style={{
              height: 'calc(100vh - 56px)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'radial-gradient(circle at 50% 50%, #0d1b2a 0%, #07111f 100%)',
              color: '#94a3b8',
              padding: '20px',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                background: '#0d1b2a',
                border: '1px solid #1e293b',
                borderRadius: '12px',
                padding: '36px 48px',
                maxWidth: '520px',
              }}
            >
              <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>🎨</div>
              <h2 style={{ margin: '0 0 8px 0', color: '#f8fafc', fontSize: '1.3rem' }}>
                Visual Rule Builder Canvas
              </h2>
              <p style={{ margin: '0 0 16px 0', fontSize: '0.9rem', color: '#64748b', lineHeight: '1.5' }}>
                Drag-and-drop node graph canvas for connecting sensor telemetry to math filters and action alerts.
              </p>
              <div
                style={{
                  display: 'inline-block',
                  background: '#38bdf815',
                  color: '#38bdf8',
                  border: '1px solid #38bdf844',
                  padding: '4px 12px',
                  borderRadius: '16px',
                  fontSize: '0.8rem',
                  fontWeight: '500',
                }}
              >
                Assigned to: Tanvi (Frontend Canvas Engineer)
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}