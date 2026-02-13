import React, { useState } from 'react';
import { X } from 'lucide-react';

export const ViCheatSheet = ({ onClose }: any) => {
  const commands = [
    { cat: 'Modes', cmd: 'i', desc: 'Insert mode' },
    { cat: 'Modes', cmd: 'Esc', desc: 'Normal mode' },
    { cat: 'Save/Quit', cmd: ':w', desc: 'Save' },
    { cat: 'Save/Quit', cmd: ':q!', desc: 'Quit without saving' },
    { cat: 'Save/Quit', cmd: ':wq', desc: 'Save & Quit' },
    { cat: 'Navigation', cmd: 'h j k l', desc: 'Left, Down, Up, Right' },
    { cat: 'Navigation', cmd: 'gg', desc: 'Go to top' },
    { cat: 'Navigation', cmd: 'G', desc: 'Go to bottom' },
    { cat: 'Editing', cmd: 'dd', desc: 'Delete line' },
    { cat: 'Editing', cmd: 'u', desc: 'Undo' },
    { cat: 'Search', cmd: '/pattern', desc: 'Search forward' },
  ];

  return (
    <div style={{
      position: 'absolute', right: 20, top: 50, width: 250, 
      backgroundColor: '#252526', border: '1px solid #444', 
      boxShadow: '0 4px 6px rgba(0,0,0,0.3)', color: '#fff', 
      zIndex: 1000, borderRadius: 4
    }}>
      <div style={{ padding: 10, borderBottom: '1px solid #444', display: 'flex', justifyContent: 'space-between' }}>
        <strong>Vi Cheat Sheet</strong>
        <X size={16} onClick={onClose} style={{ cursor: 'pointer' }} />
      </div>
      <div style={{ padding: 10, maxHeight: 400, overflowY: 'auto' }}>
        {commands.map((c, i) => (
          <div key={i} style={{ marginBottom: 8, fontSize: '0.9em' }}>
            <div style={{ color: '#4ec9b0', fontWeight: 'bold' }}>{c.cmd}</div>
            <div style={{ color: '#ccc' }}>{c.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
};
