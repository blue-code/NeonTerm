import React from 'react';
import { Folder, Monitor, Trash2, Edit, ChevronRight, ChevronDown, Plus, Download, Upload } from 'lucide-react';

export const SessionManager = ({ sessions, onConnect, onSave, onDelete, onImport, onExport }: any) => {
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});

  const toggleGroup = (group: string) => {
    setExpanded(prev => ({ ...prev, [group]: !prev[group] }));
  };

  return (
    <div style={{ width: 250, borderRight: '1px solid #333', backgroundColor: '#1e1e1e', color: '#fff', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: 10, borderBottom: '1px solid #333', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Sessions</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onImport} title="Import (JSON)" style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', opacity: 0.8 }}>
            <Upload size={16} />
          </button>
          <button onClick={onExport} title="Export (JSON)" style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', opacity: 0.8 }}>
            <Download size={16} />
          </button>
          <button onClick={() => onSave('new')} title="Add Session" style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>
            <Plus size={16} />
          </button>
        </div>
      </div>
      
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {sessions.groups?.map((group: any) => (
          <div key={group.name}>
            <div 
              onClick={() => toggleGroup(group.name)}
              style={{ padding: '8px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, backgroundColor: '#252526' }}
            >
              {expanded[group.name] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <Folder size={14} color="#dcb67a" />
              <span>{group.name}</span>
            </div>
            
            {expanded[group.name] && (
              <div style={{ paddingLeft: 10 }}>
                {group.sessions.map((sess: any) => (
                  <div 
                    key={sess.id}
                    onDoubleClick={() => onConnect(sess)}
                    style={{ padding: '5px 10px 5px 25px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9em' }}
                    className="session-item"
                  >
                    <Monitor size={14} color="#4ec9b0" />
                    <span style={{ flex: 1 }}>{sess.name}</span>
                    <Trash2 size={12} onClick={() => onDelete(group.name, sess.id)} style={{ opacity: 0.5 }} />
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
