import React, { useState } from 'react';
import { postMessageToPlugin } from '../../figma';

const NodeForm: React.FC = () => {
  const [name, setName] = useState('');

  const handleAdd = () => {
    postMessageToPlugin({ type: 'add-node', node: { name: name.trim() || undefined } });
    setName('');
  };

  return (
    <div className="grid">
      <input className="input" placeholder="Junction name (optional)" value={name} onChange={e => setName(e.target.value)} />
      <button className="button button--primary" onClick={handleAdd}>Add Junction</button>
    </div>
  );
};

export default NodeForm;
