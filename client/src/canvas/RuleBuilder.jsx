/**
 * @module client/canvas/RuleBuilder
 * @description Builds visual rules by dragging nodes and drawing connections. The same
 * graph can be validated by the server, tested with sample telemetry, or activated
 * so it evaluates real sensor readings continuously.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, {
  addEdge,
  Background,
  Controls,
  MiniMap,
  useEdgesState,
  useNodesState,
} from 'reactflow';
import 'reactflow/dist/style.css';
import RuleNode from '../nodes/RuleNode';
import { deserializeGraph, serializeGraph } from '../serialization/graph';

const CANVAS_STORAGE_KEY = 'nexusflow.visual-rule-canvas';

const palette = [
  { type: 'source', label: 'Telemetry Source', description: 'Starts with an incoming sensor reading.', config: { field: 'temperature', machineId: 'all' } },
  { type: 'math', label: 'Scale Value', description: 'Changes a number, such as converting or multiplying it.', config: { field: 'temperature', factor: 1 } },
  { type: 'filter', label: 'Temperature Filter', description: 'Keeps only readings between the chosen minimum and maximum.', config: { field: 'temperature', minimum: 80, maximum: 150 } },
  { type: 'action', label: 'SMS / Webhook Alert', description: 'Creates an alert when the rule reaches this final node.', config: { field: 'temperature', threshold: 85, message: 'High temperature alert' } },
];

export default function RuleBuilder() {
  const idRef = useRef(1);
  const activeGraphIdRef = useRef(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [status, setStatus] = useState('');
  const [activeEdges, setActiveEdges] = useState(new Set());
  const [activeGraphId, setActiveGraphId] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [lastTest, setLastTest] = useState(null);
  const [step, setStep] = useState(1);
  const [testTemperature, setTestTemperature] = useState(92);
  const [liveMatches, setLiveMatches] = useState([]);
  const [liveLastReading, setLiveLastReading] = useState(null);
  const [ruleName, setRuleName] = useState('High temperature rule');
  const [activeRules, setActiveRules] = useState([]);
  const [canvasHydrated, setCanvasHydrated] = useState(false);
  const nodeTypes = useMemo(() => ({ rule: RuleNode }), []);

  useEffect(() => {
    try {
      const savedCanvas = JSON.parse(localStorage.getItem(CANVAS_STORAGE_KEY) || 'null');
      if (savedCanvas) {
        const restored = deserializeGraph(savedCanvas.graph);
        setNodes(restored.nodes);
        setEdges(restored.edges);
        setRuleName(savedCanvas.ruleName || 'High temperature rule');
        setStatus('Restored your saved canvas from this browser.');
      }
    } catch (error) {
      console.error('Could not restore the saved visual rule canvas:', error);
    } finally {
      setCanvasHydrated(true);
    }
  }, [setEdges, setNodes]);

  useEffect(() => {
    if (!canvasHydrated) return;
    localStorage.setItem(CANVAS_STORAGE_KEY, JSON.stringify({
      ruleName,
      graph: serializeGraph(nodes, edges),
    }));
  }, [canvasHydrated, edges, nodes, ruleName]);

  useEffect(() => {
    fetch('http://localhost:4000/api/graphs/active')
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('Could not load saved live rules')))
      .then((payload) => {
        setActiveRules((payload.rules || []).map((rule) => ({
          graphId: rule.graphId,
          name: rule.name,
          machineId: rule.machineId,
        })));
      })
      .catch((error) => console.error(error.message));
  }, []);

  useEffect(() => {
    if (!activeGraphId) {
      setLiveMatches([]);
      setLiveLastReading(null);
      return;
    }

    const socket = new WebSocket('ws://localhost:8080');
    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'alert') {
          setLiveMatches((current) => [
            message.alert,
            ...current.slice(0, 9),
          ]);
        }
        if (!message.type) {
          setLiveLastReading(message);
        }
      } catch {}
    };
    return () => socket.close();
  }, [activeGraphId]);

  const validateCanvasBeforeUse = () => {
    const sourceNodes = nodes.filter((node) => node.data.ruleType === 'source');
    const filterNodes = nodes.filter((node) => node.data.ruleType === 'filter');
    const actionNodes = nodes.filter((node) => node.data.ruleType === 'action');

    if (nodes.length === 0) return 'Add nodes from the Node Library, then connect them from left to right.';
    if (sourceNodes.length === 0) return 'Add one Telemetry Source. It is the starting point for incoming sensor data.';
    if (filterNodes.length === 0) return 'Add a Temperature Filter to choose which readings should continue.';
    if (actionNodes.length === 0) return 'Add an SMS / Webhook Alert so the rule has a final action.';

    const sourceConnected = edges.some((edge) => sourceNodes.some((node) => node.id === edge.source));
    if (!sourceConnected) return 'Connect the right dot on Telemetry Source to the left dot on Temperature Filter.';
    if (edges.length < 2) return 'Connect Temperature Filter to SMS / Webhook Alert using their dots.';
    return '';
  };

  useEffect(() => () => {
    if (!activeGraphIdRef.current) return;
    fetch(`http://localhost:4000/api/graphs/activate/${encodeURIComponent(activeGraphIdRef.current)}`, {
      method: 'DELETE',
      keepalive: true,
    }).catch((error) => {
      console.error('Failed to stop live rule when leaving the builder:', error);
    });
  }, []);

  const addNode = (item) => {
    // Give every canvas node a unique id and place new nodes in a predictable grid.
    const id = `${item.type}-${idRef.current++}`;
    setNodes((current) => [
      ...current,
      {
        id,
        type: 'rule',
        position: { x: 80 + (current.length % 3) * 220, y: 90 + Math.floor(current.length / 3) * 150 },
        data: { ruleType: item.type, label: item.label, config: { ...item.config } },
      },
    ]);
  };

  const onConnect = useCallback(
    (connection) => setEdges((current) => addEdge({ ...connection, animated: false }, current)),
    [setEdges]
  );

  const clearCanvas = () => {
    activeRules.forEach((rule) => deactivateGraph(rule.graphId));
    setNodes([]);
    setEdges([]);
    setActiveEdges(new Set());
    setSelectedItem(null);
    setLastTest(null);
    setStep(1);
    setStatus('Canvas cleared. Add a Source, a Filter, and an Alert.');
  };

  const deleteSelectedItem = async () => {
    if (!selectedItem) {
      setStatus('Click a node or connection line first, then use Delete.');
      return;
    }

    // A live graph may be using this canvas. Stop it before changing the canvas so
    // the running server never continues evaluating a graph that no longer exists here.
    if (activeGraphId) {
      await deactivateGraph();
    }

    if (selectedItem.type === 'node') {
      setNodes((current) => current.filter((node) => node.id !== selectedItem.id));
      setEdges((current) =>
        current.filter((edge) => edge.source !== selectedItem.id && edge.target !== selectedItem.id)
      );
      setStatus(`Deleted node "${selectedItem.label}" and any connections attached to it.`);
    } else {
      setEdges((current) => current.filter((edge) => edge.id !== selectedItem.id));
      setStatus('Deleted the selected connection.');
    }

    setSelectedItem(null);
  };

  const updateSelectedNodeConfig = (key, value) => {
    if (!selectedItem || selectedItem.type !== 'node') return;

    setNodes((current) => current.map((node) => {
      if (node.id !== selectedItem.id) return node;
      return {
        ...node,
        data: {
          ...node.data,
          config: {
            ...node.data.config,
            [key]: key === 'machineId' ? value : Number(value),
          },
        },
      };
    }));
  };

  useEffect(() => {
    const handleDeleteKey = (event) => {
      const targetTag = event.target?.tagName?.toLowerCase();
      if (targetTag === 'input' || targetTag === 'textarea') return;
      if (event.key !== 'Delete' && event.key !== 'Backspace') return;
      event.preventDefault();
      deleteSelectedItem();
    };

    window.addEventListener('keydown', handleDeleteKey);
    return () => window.removeEventListener('keydown', handleDeleteKey);
  });

  const loadExampleRule = async () => {
    for (const rule of activeRules) {
      await deactivateGraph(rule.graphId);
    }
    setStatus('Loading the example rule...');
    try {
      const response = await fetch('http://localhost:4000/api/graphs/sample');
      const graph = await response.json();
      if (!response.ok) throw new Error(graph.message || 'Could not load the example rule');

      const labelByType = Object.fromEntries(palette.map((item) => [item.type, item.label]));
      const example = deserializeGraph({
        ...graph,
        nodes: graph.nodes.map((node) => ({
          ...node,
          position: { x: 80 + graph.nodes.findIndex((item) => item.id === node.id) * 220, y: 130 },
          config: { ...node.config, label: labelByType[node.type] },
        })),
      });
      setNodes(example.nodes);
      setEdges(example.edges);
      setActiveEdges(new Set());
      setLastTest(null);
      setStep(1);
      setStatus('Example loaded: Source → Filter → Alert. Drag from a dot on the right to a dot on the left.');
    } catch (error) {
      setStatus(error.message);
    }
  };

  const compileGraph = async () => {
    const guidance = validateCanvasBeforeUse();
    if (guidance) {
      setStatus(guidance);
      return;
    }
    setStatus('Compiling...');
    setActiveEdges(new Set());
    try {
      // Serialization gives the server the same node and edge information shown in the canvas.
      const graph = serializeGraph(nodes, edges);
      const response = await fetch('http://localhost:4000/api/graphs/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(graph),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || 'Graph compilation failed');

      setActiveEdges(new Set(edges.map((edge) => edge.id)));
      setStep(2);
      setStatus(`Step 1 complete: the rule structure is valid. It has ${payload.compiled.nodeCount} nodes and ${payload.compiled.edgeCount} connections.`);
      window.setTimeout(() => setActiveEdges(new Set()), 2200);
    } catch (error) {
      setStatus(error.message);
    }
  };

  const executeGraph = async () => {
    const guidance = validateCanvasBeforeUse();
    if (guidance) {
      setStatus(guidance);
      return;
    }
    setStatus('Executing test telemetry...');
    try {
      // Sample values let a beginner test a rule without waiting for a simulator or real sensor.
      const graph = serializeGraph(nodes, edges);
      const response = await fetch('http://localhost:4000/api/graphs/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ graph, telemetry: { temperature: testTemperature, vibration: 6.2 } }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || 'Graph execution failed');
      setActiveEdges(new Set(edges.map((edge) => edge.id)));
      setStep(payload.result ? 3 : 2);
      setLastTest(payload.result ? {
        triggered: true,
        message: payload.result.message || 'High temperature alert',
        temperature: testTemperature,
      } : {
        triggered: false,
        message: `No alert: ${testTemperature}°C did not satisfy this rule.`,
        temperature: testTemperature,
      });
      setStatus(payload.result
        ? `Step 2 complete: ${testTemperature}°C triggered an alert. The rule would show “${payload.result.message || 'High temperature alert'}”.`
        : `Step 2 complete: ${testTemperature}°C did not trigger. Check the filter range or action threshold.`);
    } catch (error) {
      setStatus(error.message);
    }
  };

  const activateGraph = async () => {
    const guidance = validateCanvasBeforeUse();
    if (guidance) {
      setStatus(guidance);
      return;
    }
    setStatus('Activating live rule...');
    try {
      const graph = serializeGraph(nodes, edges);
      graph.id = `rule-${Date.now()}`;
      graph.name = ruleName.trim() || 'Untitled live rule';
      const response = await fetch('http://localhost:4000/api/graphs/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(graph),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || 'Rule activation failed');

      activeGraphIdRef.current = payload.graphId;
      setActiveGraphId(payload.graphId);
      const sourceNode = nodes.find((node) => node.data.ruleType === 'source');
      setActiveRules((current) => [
        ...current,
        {
          graphId: payload.graphId,
          name: graph.name,
          machineId: sourceNode?.data.config.machineId || 'all',
        },
      ]);
      setLiveMatches([]);
      setLiveLastReading(null);
      setActiveEdges(new Set(edges.map((edge) => edge.id)));
      setStep(3);
      setStatus('Step 3 active: this rule is listening to live telemetry. Keep this page open and watch for a red alert on the dashboard.');
    } catch (error) {
      setStatus(error.message);
    }
  };

  const deactivateGraph = async (graphId = activeGraphId) => {
    if (!graphId) return;
    setStatus('Stopping live rule...');
    try {
      const response = await fetch(
        `http://localhost:4000/api/graphs/activate/${encodeURIComponent(graphId)}`,
        { method: 'DELETE' }
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || 'Rule deactivation failed');

      setActiveRules((current) => current.filter((rule) => rule.graphId !== graphId));
      if (graphId === activeGraphId) {
        activeGraphIdRef.current = null;
        setActiveGraphId(null);
      }
      setActiveEdges(new Set());
      setStatus('Live rule stopped');
    } catch (error) {
      setStatus(error.message);
    }
  };

  const displayEdges = edges.map((edge) => ({
    ...edge,
    animated: activeEdges.has(edge.id),
    style: activeEdges.has(edge.id)
      ? { stroke: '#38bdf8', strokeWidth: 4, filter: 'drop-shadow(0 0 7px #38bdf8)' }
      : undefined,
  }));

  const selectedNode = selectedItem?.type === 'node'
    ? nodes.find((node) => node.id === selectedItem.id)
    : null;

  return (
    <div style={{ height: 'calc(100vh - 54px)', display: 'flex', background: '#07111f' }}>
      <aside style={{ width: 210, padding: 16, borderRight: '1px solid #1e293b', color: '#cbd5e1' }}>
        <h3 style={{ marginTop: 0 }}>Node Library</h3>
        <p style={{ fontSize: 12, lineHeight: 1.5, color: '#94a3b8' }}>
          Build left to right: add Source, Filter, and Alert. Drag from a node's right dot to the next node's left dot.
        </p>
        <button
          onClick={loadExampleRule}
          style={{ width: '100%', marginBottom: 8, padding: 10, border: '1px solid #38bdf8', borderRadius: 6, background: '#38bdf815', color: '#38bdf8', cursor: 'pointer', fontWeight: 700 }}
        >
          Load Example Rule
        </button>
        <button
          onClick={clearCanvas}
          style={{ width: '100%', marginBottom: 8, padding: 8, border: '1px solid #334155', borderRadius: 6, background: 'transparent', color: '#94a3b8', cursor: 'pointer' }}
        >
          Clear Canvas
        </button>
        {selectedItem && (
          <div
            style={{
              marginBottom: 8,
              padding: 10,
              border: '1px solid #ef4444',
              borderRadius: 6,
              background: '#ef444415',
            }}
          >
            <div style={{ marginBottom: 8, fontSize: 12, color: '#fecaca' }}>
              Selected {selectedItem.type}: <strong>{selectedItem.label}</strong>
            </div>
            <button
              onClick={deleteSelectedItem}
              style={{
                width: '100%',
                padding: '8px',
                border: 0,
                borderRadius: 6,
                background: '#ef4444',
                color: 'white',
                cursor: 'pointer',
                fontWeight: 700,
              }}
            >
              Delete Selected
            </button>
            {selectedNode?.data.ruleType === 'filter' && (
              <div style={{ marginTop: 10 }}>
                <label style={{ display: 'block', fontSize: 11, color: '#cbd5e1', marginBottom: 6 }}>
                  Minimum °C
                  <input
                    type="number"
                    value={selectedNode.data.config.minimum ?? 80}
                    onChange={(event) => updateSelectedNodeConfig('minimum', event.target.value)}
                    style={{ width: '100%', marginTop: 4, padding: 7, borderRadius: 5, border: '1px solid #334155', background: '#07111f', color: 'white' }}
                  />
                </label>
                <label style={{ display: 'block', fontSize: 11, color: '#cbd5e1' }}>
                  Maximum °C
                  <input
                    type="number"
                    value={selectedNode.data.config.maximum ?? 150}
                    onChange={(event) => updateSelectedNodeConfig('maximum', event.target.value)}
                    style={{ width: '100%', marginTop: 4, padding: 7, borderRadius: 5, border: '1px solid #334155', background: '#07111f', color: 'white' }}
                  />
                </label>
              </div>
            )}
            {selectedNode?.data.ruleType === 'action' && (
              <label style={{ display: 'block', marginTop: 10, fontSize: 11, color: '#cbd5e1' }}>
                Alert when temperature is at least
                <input
                  type="number"
                  value={selectedNode.data.config.threshold ?? 85}
                  onChange={(event) => updateSelectedNodeConfig('threshold', event.target.value)}
                  style={{ width: '100%', marginTop: 4, padding: 7, borderRadius: 5, border: '1px solid #334155', background: '#07111f', color: 'white' }}
                />
              </label>
            )}
            {selectedNode?.data.ruleType === 'source' && (
              <label style={{ display: 'block', marginTop: 10, fontSize: 11, color: '#cbd5e1' }}>
                Apply this rule to
                <select
                  value={selectedNode.data.config.machineId || 'all'}
                  onChange={(event) => updateSelectedNodeConfig('machineId', event.target.value)}
                  style={{ width: '100%', marginTop: 4, padding: 7, borderRadius: 5, border: '1px solid #334155', background: '#07111f', color: 'white' }}
                >
                  <option value="all">All machines</option>
                  <option value="turbine-01">turbine-01</option>
                  <option value="boiler-04">boiler-04</option>
                  <option value="pump-12">pump-12</option>
                  <option value="conveyor-09">conveyor-09</option>
                </select>
              </label>
            )}
          </div>
        )}
        {palette.map((item) => (
          <div key={item.type} style={{ marginBottom: 8 }}>
            <button
              onClick={() => addNode(item)}
              title={item.description}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: 6,
                border: '1px solid #334155',
                background: '#111c2e',
                color: '#e2e8f0',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              + {item.label}
            </button>
            <p style={{ margin: '4px 2px 0', fontSize: 11, lineHeight: 1.35, color: '#7f93aa' }}>
              {item.description}
            </p>
          </div>
        ))}
        <label style={{ display: 'block', marginTop: 12, fontSize: 11, color: '#94a3b8' }}>
          Rule name
          <input
            value={ruleName}
            onChange={(event) => setRuleName(event.target.value)}
            placeholder="Example: Boiler overheat alert"
            style={{ width: '100%', marginTop: 4, padding: 8, borderRadius: 6, border: '1px solid #334155', background: '#07111f', color: 'white' }}
          />
        </label>
        {activeRules.length > 0 && (
          <div style={{ marginTop: 10, padding: 10, border: '1px solid #10b981', borderRadius: 8, background: '#10b98110' }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#6ee7b7', marginBottom: 7 }}>
              {activeRules.length} live rule{activeRules.length === 1 ? '' : 's'} running
            </div>
            {activeRules.map((rule) => (
              <div key={rule.graphId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 6 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: '#e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {rule.name}
                  </div>
                  <div style={{ fontSize: 9, color: '#94a3b8' }}>
                    {rule.machineId === 'all' ? 'All machines' : rule.machineId}
                  </div>
                </div>
                <button
                  onClick={() => deactivateGraph(rule.graphId)}
                  title={`Stop ${rule.name}`}
                  style={{ border: '1px solid #ef4444', borderRadius: 5, background: 'transparent', color: '#fca5a5', padding: '4px 6px', cursor: 'pointer', fontSize: 10 }}
                >
                  Stop
                </button>
              </div>
            ))}
          </div>
        )}
        <div style={{ marginTop: 12, padding: '10px', border: '1px solid #334155', borderRadius: 8, background: '#0d1b2a' }}>
          <div style={{ marginBottom: 8, fontSize: 12, fontWeight: 700, color: '#e2e8f0' }}>
            3 simple steps
          </div>
          {[
            { number: 1, label: 'Check the rule', detail: 'Verifies that every node is connected.' },
            { number: 2, label: 'Try a temperature safely', detail: 'Enter a test value below. It does not change any live machine.' },
            { number: 3, label: 'Watch live readings', detail: 'Starts this rule against real incoming telemetry.' },
          ].map((item) => (
            <div
              key={item.number}
              style={{
                display: 'flex',
                gap: 8,
                marginBottom: 7,
                padding: 6,
                borderRadius: 6,
                background: step === item.number ? '#38bdf81a' : 'transparent',
                border: step === item.number ? '1px solid #38bdf866' : '1px solid transparent',
              }}
            >
              <div style={{
                width: 20,
                height: 20,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                background: step > item.number ? '#10b981' : step === item.number ? '#38bdf8' : '#334155',
                color: '#07111f',
                fontSize: 11,
                fontWeight: 800,
              }}>
                {step > item.number ? '✓' : item.number}
              </div>
              <div>
                <div style={{ fontSize: 12, color: '#e2e8f0', fontWeight: 700 }}>{item.label}</div>
                <div style={{ marginTop: 2, fontSize: 10, lineHeight: 1.35, color: '#94a3b8' }}>{item.detail}</div>
              </div>
            </div>
          ))}
        </div>
        <button onClick={compileGraph} style={{ width: '100%', marginTop: 12, padding: 10, border: 0, borderRadius: 6, background: '#38bdf8', color: '#07111f', cursor: 'pointer', fontWeight: 700 }}>
          1. Check My Rule
        </button>
        <label style={{ display: 'block', marginTop: 8, fontSize: 11, color: '#94a3b8' }}>
          Test temperature (°C)
          <input
            type="number"
            value={testTemperature}
            onChange={(event) => setTestTemperature(Number(event.target.value))}
            style={{ width: '100%', marginTop: 4, padding: 8, borderRadius: 6, border: '1px solid #334155', background: '#07111f', color: 'white' }}
          />
        </label>
        <button onClick={executeGraph} style={{ width: '100%', marginTop: 8, padding: 10, border: '1px solid #38bdf8', borderRadius: 6, background: 'transparent', color: '#38bdf8', cursor: 'pointer' }}>
          2. Test This Temperature
        </button>
        <button
          onClick={activateGraph}
          style={{ width: '100%', marginTop: 8, padding: 10, border: 0, borderRadius: 6, background: '#10b981', color: '#07111f', cursor: 'pointer', fontWeight: 700 }}
        >
          3. Start Live Rule
        </button>
        {lastTest && (
          <div style={{ marginTop: 10, padding: 10, borderRadius: 6, border: `1px solid ${lastTest.triggered ? '#f59e0b' : '#334155'}`, background: lastTest.triggered ? '#f59e0b15' : '#111c2e' }}>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>Last safe test</div>
            <div style={{ marginTop: 4, fontSize: 12, color: lastTest.triggered ? '#fbbf24' : '#e2e8f0', fontWeight: 700 }}>
              {lastTest.triggered ? 'Alert would fire' : 'No alert would fire'}
            </div>
            <div style={{ marginTop: 3, fontSize: 11, color: '#94a3b8' }}>{lastTest.message}</div>
          </div>
        )}
        {activeRules.length > 0 && (
          <div style={{ marginTop: 10, padding: 10, borderRadius: 6, border: '1px solid #10b981', background: '#10b98118' }}>
            <div style={{ fontSize: 12, color: '#6ee7b7', fontWeight: 800 }}>
              ● {activeRules.length} LIVE RULE{activeRules.length === 1 ? '' : 'S'} RUNNING
            </div>
            <div style={{ marginTop: 5, fontSize: 11, lineHeight: 1.45, color: '#94a3b8' }}>
              Incoming readings are being checked now. If temperature reaches the rule limit, open the Live Dashboard to see the alert.
            </div>
            {liveLastReading && (
              <div style={{ marginTop: 7, paddingTop: 7, borderTop: '1px solid #10b98144', fontSize: 11, color: '#cbd5e1' }}>
                Latest reading: {liveLastReading.sensorId || liveLastReading.deviceId || 'sensor'} —
                {' '}{liveLastReading.temperature}°C
              </div>
            )}
            <div style={{ marginTop: 7, fontSize: 12, color: liveMatches.length ? '#fbbf24' : '#94a3b8', fontWeight: 700 }}>
              {liveMatches.length
                ? `${liveMatches.length} live alert${liveMatches.length === 1 ? '' : 's'} triggered`
                : 'No live alerts yet'}
            </div>
            {liveMatches.slice(0, 3).map((match, index) => (
              <div key={`${match.timestamp || index}-${index}`} style={{ marginTop: 5, fontSize: 10, color: '#fecaca' }}>
                {match.message || 'High temperature alert'}
              </div>
            ))}
          </div>
        )}
        {status && <p style={{ marginTop: 12, fontSize: 12, color: '#94a3b8' }}>{status}</p>}
      </aside>
      <div style={{ flex: 1, height: '100%', minHeight: 600 }}>
        <ReactFlow
          nodes={nodes}
          edges={displayEdges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_, node) =>
            setSelectedItem({
              type: 'node',
              id: node.id,
              label: node.data.label,
            })
          }
          onEdgeClick={(_, edge) =>
            setSelectedItem({
              type: 'connection',
              id: edge.id,
              label: `${edge.source} → ${edge.target}`,
            })
          }
          onPaneClick={() => setSelectedItem(null)}
          fitView
        >
          <Background color="#334155" gap={16} />
          <Controls />
          <MiniMap
            nodeColor={(node) => ({ source: '#38bdf8', math: '#a78bfa', filter: '#f59e0b', action: '#fb7185' }[node.data.ruleType] || '#94a3b8')}
          />
        </ReactFlow>
      </div>
    </div>
  );
}
