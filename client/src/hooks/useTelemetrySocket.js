import { useState, useEffect, useRef } from 'react';

/**
 * Custom WebSocket hook for streaming real-time IoT telemetry & alerts.
 * Fallbacks to internal simulated stream if backend WebSocket is offline.
 */
export function useTelemetrySocket(url = 'ws://localhost:8080') {
  const [telemetryData, setTelemetryData] = useState([]);
  const [latestMetric, setLatestMetric] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [sensorSummary, setSensorSummary] = useState({});
  const wsRef = useRef(null);

  useEffect(() => {
    let ws;
    let fallbackInterval;

    try {
      ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        console.log('⚡ Connected to NexusFlow Telemetry WebSocket');
      };

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === 'alert') {
            setAlerts((prev) => [
              {
                id: `${Date.now()}-${Math.random()}`,
                timestamp: payload.alert.timestamp ? new Date(payload.alert.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString(),
                sensorId: payload.alert.telemetry?.sensorId || payload.alert.telemetry?.deviceId || 'rule-engine',
                message: payload.alert.message || 'Rule threshold exceeded',
                severity: payload.alert.severity || 'HIGH',
              },
              ...prev.slice(0, 19),
            ]);
            return;
          }
          handleIncomingTelemetry(payload);
        } catch (e) {
          console.error('Invalid WS payload:', e);
        }
      };

      ws.onerror = () => {
        setIsConnected(false);
      };

      ws.onclose = () => {
        setIsConnected(false);
      };
    } catch {
      setIsConnected(false);
    }

    // Local simulated stream fallback when WS backend is not yet started
    fallbackInterval = setInterval(() => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        const sensors = ['turbine-01', 'boiler-04', 'pump-12', 'conveyor-09'];
        const chosen = sensors[Math.floor(Math.random() * sensors.length)];
        const isAnomaly = Math.random() < 0.12;

        const mockItem = {
          timestamp: new Date().toLocaleTimeString(),
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
      if (ws) ws.close();
      if (fallbackInterval) clearInterval(fallbackInterval);
    };
  }, [url]);

  function handleIncomingTelemetry(item) {
    const sensorId = item.sensorId || item.deviceId || item.metadata?.deviceId;
    const formatted = {
      ...item,
      sensorId,
      time: item.timestamp ? new Date(item.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString(),
    };

    setLatestMetric(formatted);

    // Keep sliding window of latest 25 readings
    setTelemetryData((prev) => {
      const next = [...prev, formatted];
      return next.slice(-25);
    });

    // Update sensor state summary
    setSensorSummary((prev) => ({
      ...prev,
      [formatted.sensorId]: formatted,
    }));

    // Trigger alert if anomaly flagged
    if (formatted.anomaly || formatted.temperature > 85 || formatted.vibration > 5.5) {
      setAlerts((prev) => [
        {
          id: Date.now(),
          timestamp: formatted.time,
          sensorId: formatted.sensorId,
          message: `Threshold breached on ${formatted.sensorId}: Temp ${formatted.temperature}°C, Vib ${formatted.vibration}mm/s`,
          severity: 'HIGH',
        },
        ...prev.slice(0, 19), // keep last 20 alerts
      ]);
    }
  }

  const clearAlerts = () => setAlerts([]);

  return {
    telemetryData,
    latestMetric,
    alerts,
    isConnected,
    sensorSummary,
    clearAlerts,
  };
}
