import React, { useCallback, useMemo, useRef, useState } from 'react';
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
import { serializeGraph } from '../serialization/graph';

const palette = [
  { type: 'source', label: 'Telemetry Source', config: { field: 'temperature' } },
  { type: 'math', label: 'Scale Value', config: { field: 'temperature', factor: 1 } },
  { type: 'filter', label: 'Temperature Filter', config: { field: 'temperature', minimum: 80, maximum: 150 } },
  { type: 'action', label: 'SMS / Webhook Alert', config: { field: 'temperature', threshold: 85, message: 'High temperature alert' } },
];

export default function RuleBuilder() {
  const idRef = useRef(1);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [status, setStatus] = useState('');
  const [activeEdges, setActiveEdges] = useState(new Set());
  const nodeTypes = useMemo(() => ({ rule: RuleNode }), []);

  const addNode = (item) => {
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

  const compileGraph = async () => {
    setStatus('Compiling...');
    setActiveEdges(new Set());
    try {
      const graph = serializeGraph(nodes, edges);
      const response = await fetch('http://localhost:4000/api/graphs/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(graph),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || 'Graph compilation failed');

      setActiveEdges(new Set(edges.map((edge) => edge.id)));
      setStatus(`Compiled ${payload.compiled.nodeCount} nodes and ${payload.compiled.edgeCount} edges`);
      window.setTimeout(() => setActiveEdges(new Set()), 2200);
    } catch (error) {
      setStatus(error.message);
    }
  };

  const executeGraph = async () => {
    setStatus('Executing test telemetry...');
    try {
      const graph = serializeGraph(nodes, edges);
      const response = await fetch('http://localhost:4000/api/graphs/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ graph, telemetry: { temperature: 92, vibration: 6.2 } }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || 'Graph execution failed');
      setActiveEdges(new Set(edges.map((edge) => edge.id)));
      setStatus(payload.result ? `Execution result: ${payload.result.message || 'triggered'}` : 'No result: telemetry did not pass the graph');
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
        {palette.map((item) => (
          <button
            key={item.type}
            onClick={() => addNode(item)}
            style={{
              width: '100%',
              marginBottom: 8,
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
        ))}
        <button onClick={compileGraph} style={{ width: '100%', marginTop: 12, padding: 10, border: 0, borderRadius: 6, background: '#38bdf8', color: '#07111f', cursor: 'pointer', fontWeight: 700 }}>
          Compile Graph
        </button>
        <button onClick={executeGraph} style={{ width: '100%', marginTop: 8, padding: 10, border: '1px solid #38bdf8', borderRadius: 6, background: 'transparent', color: '#38bdf8', cursor: 'pointer' }}>
          Test Execution
        </button>
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
