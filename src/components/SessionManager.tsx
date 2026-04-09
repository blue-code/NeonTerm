import React from 'react';
import { Folder, Monitor, Trash2, Edit, ChevronRight, ChevronDown, Plus, Download, Upload } from 'lucide-react';

export const SessionManager = ({ sessions, onConnect, onSave, onDelete, onEdit, onImport, onExport }: any) => {
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});

  const toggleGroup = (group: string) => {
    setExpanded(prev => ({ ...prev, [group]: !prev[group] }));
  };

  return (
    <div style={{ width: 250, borderRight: '1px solid #3d3a39', backgroundColor: '#050507', color: '#f2f2f2', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '10px 12px', borderBottom: '1px solid #3d3a39', fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '0.9em', letterSpacing: '0.3px' }}>Sessions</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onImport} title="Import (JSON)" style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', padding: 2 }}>
            <Upload size={15} />
          </button>
          <button onClick={onExport} title="Export (JSON)" style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', padding: 2 }}>
            <Download size={15} />
          </button>
          <button onClick={() => onSave('new')} title="Add Session" style={{ background: 'none', border: 'none', color: '#00d992', cursor: 'pointer', padding: 2 }}>
            <Plus size={15} />
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {sessions.groups?.map((group: any) => (
          <div key={group.name}>
            <div
              onClick={() => toggleGroup(group.name)}
              style={{ padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, backgroundColor: '#101010', borderBottom: '1px solid rgba(61,58,57,0.4)' }}
            >
              {expanded[group.name] ? <ChevronDown size={14} color="#8b949e" /> : <ChevronRight size={14} color="#8b949e" />}
              <Folder size={14} color="#818cf8" />
              <span style={{ color: '#f2f2f2', fontWeight: 500, fontSize: '0.9em' }}>{group.name}</span>
            </div>

            {expanded[group.name] && (
              <div style={{ paddingLeft: 10 }}>
                {group.sessions.map((sess: any) => (
                  <div
                    key={sess.id}
                    onDoubleClick={() => onConnect(sess)}
                    style={{ padding: '6px 10px 6px 25px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9em', borderBottom: '1px solid rgba(61,58,57,0.2)' }}
                    className="session-item"
                  >
                    <Monitor size={14} color="#00d992" />
                    <span style={{ flex: 1, color: '#b8b3b0' }}>{sess.name}</span>
                    <span onClick={() => onEdit(group.name, sess)} style={{ opacity: 0.4, cursor: 'pointer', display: 'flex', color: '#8b949e' }}><Edit size={12} /></span>
                    <span onClick={() => onDelete(group.name, sess.id)} style={{ opacity: 0.4, cursor: 'pointer', display: 'flex', color: '#fb565b' }}><Trash2 size={12} /></span>
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
