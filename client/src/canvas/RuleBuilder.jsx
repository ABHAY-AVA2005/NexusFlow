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

const palette = [
  { type: 'source', label: 'Telemetry Source', description: 'Starts with an incoming sensor reading.', config: { field: 'temperature' } },
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
  const nodeTypes = useMemo(() => ({ rule: RuleNode }), []);

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
    if (activeGraphId) {
      deactivateGraph();
    }
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
    if (activeGraphId) {
      await deactivateGraph();
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
        body: JSON.stringify({ graph, telemetry: { temperature: 92, vibration: 6.2 } }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || 'Graph execution failed');
      setActiveEdges(new Set(edges.map((edge) => edge.id)));
      setStep(payload.result ? 3 : 2);
      setLastTest(payload.result ? {
        triggered: true,
        message: payload.result.message || 'High temperature alert',
        temperature: 92,
      } : {
        triggered: false,
        message: 'No alert: 92°C did not satisfy this rule.',
        temperature: 92,
      });
      setStatus(payload.result
        ? 'Step 2 complete: the test rule triggered. Its alert message is “High temperature alert.”'
        : 'Step 2 complete: the test reading did not trigger. The rule and filter settings are ready to adjust.');
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
      const response = await fetch('http://localhost:4000/api/graphs/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(serializeGraph(nodes, edges)),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || 'Rule activation failed');

      activeGraphIdRef.current = payload.graphId;
      setActiveGraphId(payload.graphId);
      setActiveEdges(new Set(edges.map((edge) => edge.id)));
      setStep(3);
      setStatus('Step 3 active: this rule is listening to live telemetry. Keep this page open and watch for a red alert on the dashboard.');
    } catch (error) {
      setStatus(error.message);
    }
  };

  const deactivateGraph = async () => {
    if (!activeGraphId) return;
    setStatus('Stopping live rule...');
    try {
      const response = await fetch(
        `http://localhost:4000/api/graphs/activate/${encodeURIComponent(activeGraphId)}`,
        { method: 'DELETE' }
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || 'Rule deactivation failed');

      activeGraphIdRef.current = null;
      setActiveGraphId(null);
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
        <div style={{ marginTop: 12, padding: '10px', border: '1px solid #334155', borderRadius: 8, background: '#0d1b2a' }}>
          <div style={{ marginBottom: 8, fontSize: 12, fontWeight: 700, color: '#e2e8f0' }}>
            3 simple steps
          </div>
          {[
            { number: 1, label: 'Check the rule', detail: 'Verifies that every node is connected.' },
            { number: 2, label: 'Try 92°C safely', detail: 'Uses sample data; no live machine changes.' },
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
        <button onClick={executeGraph} style={{ width: '100%', marginTop: 8, padding: 10, border: '1px solid #38bdf8', borderRadius: 6, background: 'transparent', color: '#38bdf8', cursor: 'pointer' }}>
          2. Test with 92°C
        </button>
        <button
          onClick={activeGraphId ? deactivateGraph : activateGraph}
          style={{ width: '100%', marginTop: 8, padding: 10, border: 0, borderRadius: 6, background: activeGraphId ? '#ef4444' : '#10b981', color: '#07111f', cursor: 'pointer', fontWeight: 700 }}
        >
          {activeGraphId ? '3. Stop Live Watching' : '3. Start Live Watching'}
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
        {activeGraphId && (
          <div style={{ marginTop: 10, padding: 10, borderRadius: 6, border: '1px solid #10b981', background: '#10b98118' }}>
            <div style={{ fontSize: 12, color: '#6ee7b7', fontWeight: 800 }}>● LIVE RULE IS RUNNING</div>
            <div style={{ marginTop: 5, fontSize: 11, lineHeight: 1.45, color: '#94a3b8' }}>
              Incoming readings are being checked now. If temperature reaches the rule limit, open the Live Dashboard to see the alert.
            </div>
          </div>
        )}
        {status && <p style={{ marginTop: 12, fontSize: 12, color: '#94a3b8' }}>{status}</p>}
      </aside>
      <div style={{ flex: 1 }}>
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
