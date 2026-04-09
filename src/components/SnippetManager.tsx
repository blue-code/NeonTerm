import React, { useState } from 'react';
import { Plus, Trash2, Terminal } from 'lucide-react';

const api = window.electronAPI;

export const SnippetManager = ({ onClose, onPaste }: any) => {
  const [snippets, setSnippets] = useState<any[]>([]);
  const [newSnippet, setNewSnippet] = useState({ name: '', cmd: '' });

  React.useEffect(() => {
    api.invoke('get-snippets').then(setSnippets).catch(() => {});
  }, []);

  const saveSnippet = () => {
    if (!newSnippet.name || !newSnippet.cmd) return;
    const updated = [...snippets, { id: Date.now(), ...newSnippet }];
    setSnippets(updated);
    api.invoke('save-snippets', updated);
    setNewSnippet({ name: '', cmd: '' });
  };

  const deleteSnippet = (id: number) => {
    const updated = snippets.filter(s => s.id !== id);
    setSnippets(updated);
    api.invoke('save-snippets', updated);
  };

  return (
    <div style={{
      position: 'absolute', right: 20, top: 50, width: 320,
      backgroundColor: '#101010', border: '1px solid #3d3a39',
      boxShadow: 'rgba(92, 88, 85, 0.2) 0px 0px 15px, rgba(0,0,0,0.7) 0px 20px 60px',
      color: '#f2f2f2', zIndex: 1000, borderRadius: 8, display: 'flex', flexDirection: 'column', maxHeight: 500
    }}>
      <div style={{ padding: '10px 12px', borderBottom: '1px solid #3d3a39', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong style={{ fontSize: '0.9em', fontWeight: 600, letterSpacing: '-0.2px' }}>Command Snippets</strong>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', padding: 2 }}>X</button>
      </div>

      {/* 목록 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 6 }}>
        {snippets.length === 0 && <div style={{ padding: 16, color: '#8b949e', textAlign: 'center', fontSize: '0.9em' }}>No snippets yet</div>}
        {snippets.map(s => (
          <div key={s.id} style={{ padding: '8px 6px', borderBottom: '1px solid rgba(61,58,57,0.4)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: '0.9em', color: '#f2f2f2' }}>{s.name}</div>
              <div style={{ color: '#8b949e', fontSize: '0.8em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: 'SFMono-Regular, Consolas, monospace' }}>{s.cmd}</div>
            </div>
            <button onClick={() => onPaste(s.cmd)} title="Paste to Terminal" style={{ background: 'none', border: 'none', color: '#00d992', cursor: 'pointer', padding: 2 }}>
              <Terminal size={14} />
            </button>
            <button onClick={() => deleteSnippet(s.id)} style={{ background: 'none', border: 'none', color: '#fb565b', cursor: 'pointer', opacity: 0.6, padding: 2 }}>
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>

      {/* 추가 */}
      <div style={{ padding: 10, borderTop: '1px solid #3d3a39', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <input
          placeholder="Name (e.g. Restart Nginx)"
          value={newSnippet.name}
          onChange={e => setNewSnippet({...newSnippet, name: e.target.value})}
          style={{ backgroundColor: '#050507', border: '1px solid #3d3a39', color: '#f2f2f2', padding: '6px 10px', borderRadius: 6, outline: 'none', fontSize: '0.85em' }}
        />
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            placeholder="Command"
            value={newSnippet.cmd}
            onChange={e => setNewSnippet({...newSnippet, cmd: e.target.value})}
            style={{ flex: 1, backgroundColor: '#050507', border: '1px solid #3d3a39', color: '#f2f2f2', padding: '6px 10px', borderRadius: 6, outline: 'none', fontSize: '0.85em', fontFamily: 'SFMono-Regular, Consolas, monospace' }}
          />
          <button onClick={saveSnippet} style={{
            background: '#101010', color: '#2fd6a1', border: '1px solid #3d3a39',
            padding: '0 12px', cursor: 'pointer', borderRadius: 6, transition: 'border-color 0.15s'
          }}>
            <Plus size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};
