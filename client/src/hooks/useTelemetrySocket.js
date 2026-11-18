import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Enhanced WebSocket hook for real-time IoT telemetry streaming.
 * Features:
 * - Exponential backoff auto-reconnection (1s, 2s, 4s, up to 10s max)
 * - Detailed connection states: 'CONNECTED', 'CONNECTING', 'RECONNECTING', 'SIMULATED'
 * - Stream Pause / Resume controls
 * - Manual reconnect trigger
 */
export function useTelemetrySocket(url = 'ws://localhost:5000') {
  const [telemetryData, setTelemetryData] = useState([]);
  const [latestMetric, setLatestMetric] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState('CONNECTING');
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [sensorSummary, setSensorSummary] = useState({});

  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const fallbackIntervalRef = useRef(null);
  const isPausedRef = useRef(isPaused);

  // Keep ref in sync for event callbacks
  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  const handleIncomingTelemetry = useCallback((item) => {
    if (isPausedRef.current) return;

    const formatted = {
      ...item,
      time: item.timestamp ? new Date(item.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString(),
    };

    setLatestMetric(formatted);

    // Sliding window of latest 25 readings
    setTelemetryData((prev) => {
      const next = [...prev, formatted];
      return next.slice(-25);
    });

    setSensorSummary((prev) => ({
      ...prev,
      [formatted.sensorId]: formatted,
    }));

    if (formatted.anomaly || formatted.temperature > 85 || formatted.vibration > 5.5) {
      setAlerts((prev) => [
        {
          id: Date.now() + Math.random(),
          timestamp: formatted.time,
          sensorId: formatted.sensorId,
          message: `Threshold breached on ${formatted.sensorId}: Temp ${formatted.temperature}°C, Vib ${formatted.vibration}mm/s`,
          severity: 'HIGH',
        },
        ...prev.slice(0, 19),
      ]);
    }
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      setConnectionStatus(reconnectAttempts > 0 ? 'RECONNECTING' : 'CONNECTING');
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnectionStatus('CONNECTED');
        setReconnectAttempts(0);
        if (fallbackIntervalRef.current) {
          clearInterval(fallbackIntervalRef.current);
          fallbackIntervalRef.current = null;
        }
      };

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          handleIncomingTelemetry(payload);
        } catch (e) {
          console.error('Invalid WS payload:', e);
        }
      };

      ws.onclose = () => {
        setConnectionStatus('SIMULATED');
        scheduleReconnect();
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch {
      setConnectionStatus('SIMULATED');
      scheduleReconnect();
    }
  }, [url, reconnectAttempts, handleIncomingTelemetry]);

  // Exponential backoff: min 1.5s, doubles up to max 12s
  const scheduleReconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);

    const delay = Math.min(1500 * Math.pow(1.8, reconnectAttempts), 12000);
    setReconnectAttempts((prev) => prev + 1);

    reconnectTimeoutRef.current = setTimeout(() => {
      connect();
    }, delay);
  }, [reconnectAttempts, connect]);

  // Start connection and maintain fallback simulation when backend is offline
  useEffect(() => {
    connect();

    // Start fallback simulated telemetry stream
    fallbackIntervalRef.current = setInterval(() => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        const sensors = ['turbine-01', 'boiler-04', 'pump-12', 'conveyor-09'];
        const chosen = sensors[Math.floor(Math.random() * sensors.length)];
        const isAnomaly = Math.random() < 0.12;

        const mockItem = {
          timestamp: new Date().toISOString(),
          sensorId: chosen,
          temperature: Number((Math.random() * (isAnomaly ? 20 : 10) + (isAnomaly ? 88 : 70)).toFixed(1)),
          pressure: Number((Math.random() * 15 + 28).toFixed(1)),
          vibration: Number((Math.random() * (isAnomaly ? 4 : 2) + (isAnomaly ? 5.5 : 1.8)).toFixed(2)),
          rpm: Math.floor(Math.random() * 500 + 2800),
          anomaly: isAnomaly,
          status: isAnomaly ? 'CRITICAL' : 'NORMAL',
        };

        handleIncomingTelemetry(mockItem);
      }
    }, 1200);

    return () => {
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (fallbackIntervalRef.current) clearInterval(fallbackIntervalRef.current);
    };
  }, [connect, handleIncomingTelemetry]);

  const togglePause = () => setIsPaused((prev) => !prev);
  const clearAlerts = () => setAlerts([]);
  const manualReconnect = () => {
    setReconnectAttempts(0);
    connect();
  };

  return {
    telemetryData,
    latestMetric,
    alerts,
    connectionStatus,
    isConnected: connectionStatus === 'CONNECTED',
    reconnectAttempts,
    isPaused,
    togglePause,
    manualReconnect,
    sensorSummary,
    clearAlerts,
  };
}