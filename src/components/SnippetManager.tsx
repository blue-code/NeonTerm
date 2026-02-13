import React, { useState } from 'react';
import { Plus, Trash2, Terminal } from 'lucide-react';

const { ipcRenderer } = window.require('electron');

export const SnippetManager = ({ onClose, onPaste }: any) => {
  const [snippets, setSnippets] = useState<any[]>([]);
  const [newSnippet, setNewSnippet] = useState({ name: '', cmd: '' });

  React.useEffect(() => {
    ipcRenderer.invoke('get-snippets').then(setSnippets);
  }, []);

  const saveSnippet = () => {
    if (!newSnippet.name || !newSnippet.cmd) return;
    const updated = [...snippets, { id: Date.now(), ...newSnippet }];
    setSnippets(updated);
    ipcRenderer.invoke('save-snippets', updated);
    setNewSnippet({ name: '', cmd: '' });
  };

  const deleteSnippet = (id: number) => {
    const updated = snippets.filter(s => s.id !== id);
    setSnippets(updated);
    ipcRenderer.invoke('save-snippets', updated);
  };

  return (
    <div style={{
      position: 'absolute', right: 20, top: 50, width: 300, 
      backgroundColor: '#252526', border: '1px solid #444', 
      boxShadow: '0 4px 6px rgba(0,0,0,0.3)', color: '#fff', 
      zIndex: 1000, borderRadius: 4, display: 'flex', flexDirection: 'column', maxHeight: 500
    }}>
      <div style={{ padding: 10, borderBottom: '1px solid #444', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong>Command Snippets</strong>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>X</button>
      </div>
      
      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 5 }}>
        {snippets.length === 0 && <div style={{ padding: 10, color: '#888', textAlign: 'center' }}>No snippets yet</div>}
        {snippets.map(s => (
          <div key={s.id} style={{ padding: '8px', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 'bold', fontSize: '0.9em' }}>{s.name}</div>
              <div style={{ color: '#888', fontSize: '0.8em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.cmd}</div>
            </div>
            <button onClick={() => onPaste(s.cmd)} title="Paste to Terminal" style={{ background: 'none', border: 'none', color: '#4ec9b0', cursor: 'pointer' }}>
              <Terminal size={14} />
            </button>
            <button onClick={() => deleteSnippet(s.id)} style={{ background: 'none', border: 'none', color: '#f44336', cursor: 'pointer' }}>
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>

      {/* Add New */}
      <div style={{ padding: 10, borderTop: '1px solid #444', display: 'flex', flexDirection: 'column', gap: 5 }}>
        <input 
          placeholder="Name (e.g. Restart Nginx)" 
          value={newSnippet.name} 
          onChange={e => setNewSnippet({...newSnippet, name: e.target.value})}
          style={{ backgroundColor: '#333', border: 'none', color: '#fff', padding: 5 }} 
        />
        <div style={{ display: 'flex', gap: 5 }}>
          <input 
            placeholder="Command" 
            value={newSnippet.cmd} 
            onChange={e => setNewSnippet({...newSnippet, cmd: e.target.value})}
            style={{ flex: 1, backgroundColor: '#333', border: 'none', color: '#fff', padding: 5 }} 
          />
          <button onClick={saveSnippet} style={{ background: '#0e639c', color: '#fff', border: 'none', padding: '0 10px', cursor: 'pointer' }}>
            <Plus size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};
