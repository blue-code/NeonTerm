import React from 'react';
import { Folder, Monitor, Trash2, Edit, ChevronRight, ChevronDown, Plus, Download, Upload, Clock, Zap } from 'lucide-react';

// 접속 시각을 "N분 전", "N시간 전", "어제" 형태로 변환
function timeAgo(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return '방금 전';
  if (min < 60) return `${min}분 전`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}시간 전`;
  const day = Math.floor(hour / 24);
  if (day === 1) return '어제';
  return `${day}일 전`;
}

export const SessionManager = ({ sessions, onConnect, onSave, onDelete, onEdit, onImport, onExport }: any) => {
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});
  const [showRecent, setShowRecent] = React.useState(true);

  const toggleGroup = (group: string) => {
    setExpanded(prev => ({ ...prev, [group]: !prev[group] }));
  };

  const recentSessions: any[] = sessions.recentSessions || [];

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

        {/* 최근 접속 섹션 */}
        {recentSessions.length > 0 && (
          <div>
            <div
              onClick={() => setShowRecent(prev => !prev)}
              style={{
                padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                backgroundColor: '#0d0d10', borderBottom: '1px solid rgba(61,58,57,0.4)',
                userSelect: 'none'
              }}
            >
              {showRecent ? <ChevronDown size={14} color="#8b949e" /> : <ChevronRight size={14} color="#8b949e" />}
              <Clock size={13} color="#ffba00" />
              <span style={{ color: '#ffba00', fontWeight: 600, fontSize: '0.85em', letterSpacing: '0.3px' }}>최근 접속</span>
            </div>

            {showRecent && (
              <div>
                {recentSessions.slice(0, 5).map((sess: any, i: number) => (
                  <div
                    key={i}
                    onClick={() => onConnect(sess)}
                    title={`${sess.username}@${sess.host}:${sess.port || 22} — 클릭하여 연결`}
                    style={{
                      padding: '7px 10px 7px 28px', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 8,
                      fontSize: '0.88em', borderBottom: '1px solid rgba(61,58,57,0.2)',
                      transition: 'background 0.12s'
                    }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#131318')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <Zap size={13} color="#ffba00" style={{ flexShrink: 0 }} />
                    <span style={{ flex: 1, color: '#e8e4e0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {sess.name || `${sess.username}@${sess.host}`}
                    </span>
                    <span style={{ color: '#4a4845', fontSize: '0.78em', flexShrink: 0 }}>
                      {sess.lastConnected ? timeAgo(sess.lastConnected) : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 저장된 세션 그룹 */}
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
                    onClick={() => onConnect(sess)}
                    style={{ padding: '6px 10px 6px 25px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9em', borderBottom: '1px solid rgba(61,58,57,0.2)' }}
                    className="session-item"
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#131318')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <Monitor size={14} color="#00d992" />
                    <span style={{ flex: 1, color: '#b8b3b0' }}>{sess.name}</span>
                    <span onClick={e => { e.stopPropagation(); onEdit(group.name, sess) }} style={{ opacity: 0.4, cursor: 'pointer', display: 'flex', color: '#8b949e' }}><Edit size={12} /></span>
                    <span onClick={e => { e.stopPropagation(); onDelete(group.name, sess.id) }} style={{ opacity: 0.4, cursor: 'pointer', display: 'flex', color: '#fb565b' }}><Trash2 size={12} /></span>
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
