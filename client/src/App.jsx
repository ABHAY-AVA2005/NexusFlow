import React, { useMemo } from 'react';
import ReactFlow, { Background, Controls } from 'reactflow';
import 'reactflow/dist/style.css';

const initialNodes = [];
const initialEdges = [];

export default function App() {
  const canvasStyle = useMemo(
    () => ({
      width: '100%',
      height: '100vh',
      background: '#07111f',
    }),
    []
  );

  return (
    <div style={canvasStyle}>
      <ReactFlow nodes={initialNodes} edges={initialEdges} fitView>
        <Background color="#4a6fa5" gap={16} size={1} />
        <Controls />
      </ReactFlow>
    </div>
  );
}
