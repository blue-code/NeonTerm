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
      position: 'absolute', right: 20, top: 50, width: 260,
      backgroundColor: '#101010', border: '1px solid #3d3a39',
      boxShadow: 'rgba(92, 88, 85, 0.2) 0px 0px 15px, rgba(0,0,0,0.7) 0px 20px 60px',
      color: '#f2f2f2', zIndex: 1000, borderRadius: 8
    }}>
      <div style={{ padding: '10px 12px', borderBottom: '1px solid #3d3a39', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong style={{ fontSize: '0.9em', fontWeight: 600, letterSpacing: '-0.2px' }}>Vi Cheat Sheet</strong>
        <X size={16} onClick={onClose} style={{ cursor: 'pointer', color: '#8b949e' }} />
      </div>
      <div style={{ padding: 12, maxHeight: 400, overflowY: 'auto' }}>
        {commands.map((c, i) => (
          <div key={i} style={{ marginBottom: 10, fontSize: '0.9em' }}>
            <div style={{ color: '#00d992', fontWeight: 600, fontFamily: 'SFMono-Regular, Consolas, monospace', fontSize: '0.95em' }}>{c.cmd}</div>
            <div style={{ color: '#b8b3b0', marginTop: 1 }}>{c.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
};
