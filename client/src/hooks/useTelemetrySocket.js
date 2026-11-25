/**
 * @module client/hooks/useTelemetrySocket
 * @description Maintains the WebSocket connection and exposes live telemetry state to React components.
 */
import { useState, useEffect, useRef } from 'react';

/**
 * Resilient WebSocket & Simulation Hook for NexusFlow Telemetry.
 * Ensures the live stream ticks and updates every second without getting stuck.
 */
export function useTelemetrySocket(url = 'ws://localhost:5000') {
  const [telemetryData, setTelemetryData] = useState([]);
  const [latestMetric, setLatestMetric] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState('SIMULATED');
  const [isPaused, setIsPaused] = useState(false);
  const [sensorSummary, setSensorSummary] = useState({});

  const wsRef = useRef(null);
  const isPausedRef = useRef(isPaused);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef(null);

  // Sync ref with pause state
  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  // Central ingestion function for both WebSocket and Simulated stream
  const ingest = (item) => {
    if (isPausedRef.current) return;

    const formatted = {
      ...item,
      time: item.timestamp
        ? new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    };

    setLatestMetric(formatted);

    // Keep sliding window of latest 20 points for chart
    setTelemetryData((prev) => [...prev.slice(-19), formatted]);

    // Update sensor card summary
    setSensorSummary((prev) => ({
      ...prev,
      [formatted.sensorId]: formatted,
    }));

    // Trigger alert if anomaly or high threshold
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
  };

  // 1. WebSocket connection manager
  useEffect(() => {
    let isCancelled = false;

    function tryConnect() {
      if (isCancelled) return;
      try {
        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = () => {
          if (isCancelled) return;
          setConnectionStatus('CONNECTED');
          reconnectAttemptsRef.current = 0;
        };

        ws.onmessage = (event) => {
          if (isCancelled) return;
          try {
            const data = JSON.parse(event.data);
            ingest(data);
          } catch {}
        };

        ws.onclose = () => {
          if (isCancelled) return;
          setConnectionStatus('SIMULATED');
          scheduleRetry();
        };

        ws.onerror = () => {
          if (ws) ws.close();
        };
      } catch {
        setConnectionStatus('SIMULATED');
        scheduleRetry();
      }
    }

    function scheduleRetry() {
      if (isCancelled) return;
      reconnectAttemptsRef.current += 1;
      const delay = Math.min(3000 * reconnectAttemptsRef.current, 15000);
      reconnectTimerRef.current = setTimeout(tryConnect, delay);
    }

    tryConnect();

    return () => {
      isCancelled = true;
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    };
  }, [url]);

  // 2. Stable simulation stream: emits every 1000ms whenever WebSocket is offline
  useEffect(() => {
    const SENSORS = [
      { id: 'turbine-01', temp: 74, press: 30, vib: 2.2, rpm: 2950 },
      { id: 'boiler-04', temp: 80, press: 45, vib: 1.8, rpm: 0 },
      { id: 'pump-12', temp: 66, press: 28, vib: 3.4, rpm: 1750 },
      { id: 'conveyor-09', temp: 58, press: 15, vib: 4.1, rpm: 850 },
    ];

    let index = 0;

    const interval = setInterval(() => {
      // If live WebSocket is connected, WebSocket handles the data
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        return;
      }

      const sensor = SENSORS[index % SENSORS.length];
      index++;

      const isAnomaly = Math.random() < 0.15;
      const temp = isAnomaly
        ? Number((Math.random() * 15 + 88).toFixed(1))
        : Number((sensor.temp + (Math.random() * 6 - 3)).toFixed(1));
      const vib = isAnomaly
        ? Number((Math.random() * 3 + 5.6).toFixed(2))
        : Number((sensor.vib + (Math.random() * 0.8 - 0.4)).toFixed(2));
      const press = Number((sensor.press + (Math.random() * 4 - 2)).toFixed(1));
      const rpm = sensor.rpm > 0 ? sensor.rpm + Math.floor(Math.random() * 60 - 30) : 0;

      ingest({
        sensorId: sensor.id,
        temperature: temp,
        pressure: press,
        vibration: vib,
        rpm: rpm,
        anomaly: isAnomaly,
        status: isAnomaly ? 'CRITICAL' : temp > 82 ? 'WARNING' : 'OPTIMAL',
        timestamp: new Date().toISOString(),
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const togglePause = () => setIsPaused((prev) => !prev);
  const clearAlerts = () => setAlerts([]);

  return {
    telemetryData,
    latestMetric,
    alerts,
    connectionStatus,
    isPaused,
    togglePause,
    sensorSummary,
    clearAlerts,
  };
}