/**
 * @module client/nodes/RuleNode
 * @description Renders a visual rule graph node and its typed input/output handles.
 */
import React, { memo } from 'react';
import { Handle, Position } from 'reactflow';

const colors = {
  source: '#38bdf8',
  math: '#a78bfa',
  filter: '#f59e0b',
  action: '#fb7185',
};

function RuleNode({ data }) {
  const color = colors[data.ruleType] || '#94a3b8';

  return (
    <div style={{
      minWidth: 168,
      padding: '10px 12px',
      borderRadius: 8,
      border: `1px solid ${color}`,
      background: '#111c2e',
      color: '#e5eef8',
      boxShadow: `0 0 12px ${color}33`,
    }}>
      {data.ruleType !== 'source' && <Handle type="target" position={Position.Left} />}
      <div style={{ color, fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>
        {data.ruleType}
      </div>
      <strong style={{ display: 'block', marginTop: 4, fontSize: 13 }}>{data.label}</strong>
      {data.ruleType !== 'action' && <Handle type="source" position={Position.Right} />}
    </div>
  );
}

export default memo(RuleNode);
