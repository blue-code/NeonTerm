import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { SessionManager } from './components/SessionManager'
import { ViCheatSheet } from './components/ViCheatSheet'
import { SnippetManager } from './components/SnippetManager'
import { Folder, File, ArrowUp, Upload, HelpCircle, HardDrive, Cpu, MemoryStick, ClipboardList, X, Plus, AlertTriangle } from 'lucide-react'
import 'xterm/css/xterm.css'

const api = window.electronAPI

interface TerminalSession {
  id: string
  name: string
  config: any
  connected: boolean
  files: any[]
  currentPath: string
  serverStats: any
  activeTab: 'sessions' | 'sftp'
}

interface Toast {
  id: number
  message: string
  type: 'error' | 'info'
}

export default function App() {
  const [terminals, setTerminals] = useState<TerminalSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)

  const termRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const termInstances = useRef<Record<string, Terminal>>({})
  const fitAddons = useRef<Record<string, FitAddon>>({})
  const resizeObservers = useRef<Record<string, ResizeObserver>>({})

  const [sessions, setSessions] = useState<{ groups: any[]; sessions: any[] }>({ groups: [], sessions: [] })
  const [showViHelp, setShowViHelp] = useState(false)
  const [showSnippets, setShowSnippets] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [loginForm, setLoginForm] = useState({
    host: '', username: '', password: '', port: '22',
    privateKey: '', passphrase: '', group: 'Default', name: 'New Session'
  })

  // 토스트 알림
  const showToast = useCallback((message: string, type: 'error' | 'info' = 'error') => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000)
  }, [])

  useEffect(() => {
    api.invoke('get-sessions').then(setSessions).catch(() => {
      showToast('세션 목록을 불러오지 못했습니다', 'error')
    })
  }, [])

  // IPC 이벤트 구독 — on()이 반환하는 해제 함수로 정리
  useEffect(() => {
    const offTermData = api.on('term-data', ({ sessionId, data }: any) => {
      termInstances.current[sessionId]?.write(data)
    })

    const offSshReady = api.on('ssh-ready', (sessionId: string) => {
      setTerminals(prev => prev.map(t =>
        t.id === sessionId ? { ...t, connected: true, activeTab: 'sftp' } : t
      ))
    })

    const offSshError = api.on('ssh-error', ({ sessionId, message }: any) => {
      showToast(`[${sessionId.slice(-4)}] ${message}`)
    })

    const offSshClosed = api.on('ssh-closed', (sessionId: string) => {
      setTerminals(prev => prev.map(t =>
        t.id === sessionId ? { ...t, connected: false } : t
      ))
      showToast('연결이 종료되었습니다', 'info')
    })

    const offSftpList = api.on('sftp-list', ({ sessionId, path, files }: any) => {
      setTerminals(prev => prev.map(t =>
        t.id === sessionId ? { ...t, files, currentPath: path } : t
      ))
    })

    const offServerStats = api.on('server-stats', ({ sessionId, stats }: any) => {
      setTerminals(prev => prev.map(t =>
        t.id === sessionId ? { ...t, serverStats: stats } : t
      ))
    })

    return () => {
      offTermData()
      offSshReady()
      offSshError()
      offSshClosed()
      offSftpList()
      offServerStats()
    }
  }, [showToast])

  const createNewTab = (config: any = null) => {
    const newId = Date.now().toString()
    const newSession: TerminalSession = {
      id: newId,
      name: config?.name || 'New Tab',
      config: config,
      connected: false,
      files: [],
      currentPath: '.',
      serverStats: null,
      activeTab: 'sessions'
    }

    setTerminals(prev => [...prev, newSession])
    setActiveSessionId(newId)

    if (config) {
      setTimeout(() => connect(newId, config), 100)
    }
  }

  const closeTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    api.send('disconnect-ssh', id)
    setTerminals(prev => {
      const filtered = prev.filter(t => t.id !== id)
      if (activeSessionId === id) {
        setActiveSessionId(filtered.length > 0 ? filtered[filtered.length - 1].id : null)
      }
      return filtered
    })
    // 터미널 및 옵저버 정리
    if (resizeObservers.current[id]) {
      resizeObservers.current[id].disconnect()
      delete resizeObservers.current[id]
    }
    if (termInstances.current[id]) {
      termInstances.current[id].dispose()
      delete termInstances.current[id]
    }
    delete fitAddons.current[id]
    delete termRefs.current[id]
  }

  const connect = (sessionId: string, config: any) => {
    if (!termInstances.current[sessionId] && termRefs.current[sessionId]) {
      const term = new Terminal({
        theme: { background: '#1e1e1e' },
        fontFamily: 'Consolas, monospace',
        fontSize: 14
      })
      const fitAddon = new FitAddon()
      term.loadAddon(fitAddon)
      term.open(termRefs.current[sessionId]!)
      fitAddon.fit()

      term.onData(data => api.send('term-input', { sessionId, data }))

      termInstances.current[sessionId] = term
      fitAddons.current[sessionId] = fitAddon

      const resizeObserver = new ResizeObserver(() => fitAddon.fit())
      resizeObserver.observe(termRefs.current[sessionId]!)
      resizeObservers.current[sessionId] = resizeObserver
    }

    api.send('connect-ssh', { sessionId, config })
  }

  // SFTP 경로 탐색 — 렌더러에서 절대 경로를 계산하여 전달
  const handleSftpNavigate = (sessionId: string, target: string) => {
    const session = terminals.find(t => t.id === sessionId)
    if (!session) return

    let targetPath: string
    if (target === '..') {
      const parts = session.currentPath.split('/')
      parts.pop()
      targetPath = parts.join('/') || '/'
    } else if (target.startsWith('/')) {
      targetPath = target
    } else {
      targetPath = session.currentPath === '/'
        ? '/' + target
        : session.currentPath + '/' + target
    }

    api.send('sftp-navigate', { sessionId, path: targetPath })
  }

  const handleFileDrop = (e: React.DragEvent, sessionId: string, remotePath: string) => {
    e.preventDefault()
    const filePaths = Array.from(e.dataTransfer.files).map(f => f.path)
    if (filePaths.length > 0) {
      api.send('sftp-upload', { sessionId, remotePath, localPaths: filePaths })
    }
  }

  const handleFileDragStart = (e: React.DragEvent, file: any, sessionId: string, remotePath: string) => {
    e.preventDefault()
    api.send('sftp-drag-start', { sessionId, remotePath, file })
  }

  const handleKeySelect = async () => {
    const result = await api.invoke('dialog-open-file')
    if (result && !result.canceled && result.filePaths.length > 0) {
      setLoginForm({ ...loginForm, privateKey: result.filePaths[0] })
    }
  }

  const saveSession = () => {
    const newSessions = { ...sessions }
    let group = newSessions.groups.find((g: any) => g.name === loginForm.group)
    if (!group) {
      group = { name: loginForm.group, sessions: [] }
      newSessions.groups.push(group as any)
    }

    group.sessions.push({
      id: Date.now(),
      ...loginForm
    })

    setSessions(newSessions)
    api.invoke('save-sessions', newSessions)
  }

  const deleteSession = (groupName: string, sessionId: number) => {
    const newSessions = JSON.parse(JSON.stringify(sessions))
    const group = newSessions.groups.find((g: any) => g.name === groupName)
    if (group) {
      group.sessions = group.sessions.filter((s: any) => s.id !== sessionId)
      if (group.sessions.length === 0) {
        newSessions.groups = newSessions.groups.filter((g: any) => g.name !== groupName)
      }
    }
    setSessions(newSessions)
    api.invoke('save-sessions', newSessions)
  }

  const handleImport = async () => {
    const data = await api.invoke('import-sessions')
    if (data) {
      setSessions(data)
      showToast('세션을 가져왔습니다', 'info')
    }
  }

  const handleExport = async () => {
    const result = await api.invoke('export-sessions', sessions)
    if (result) showToast('세션을 내보냈습니다', 'info')
  }

  const pasteSnippet = (cmd: string) => {
    if (activeSessionId && termInstances.current[activeSessionId]) {
      api.send('term-input', { sessionId: activeSessionId, data: cmd + '\n' })
      termInstances.current[activeSessionId].focus()
    }
  }

  const activeSession = terminals.find(t => t.id === activeSessionId)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: '#1e1e1e', color: '#ccc' }}>

      {/* 토스트 알림 */}
      {toasts.length > 0 && (
        <div style={{ position: 'fixed', top: 10, right: 10, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {toasts.map(t => (
            <div key={t.id} style={{
              padding: '10px 16px', borderRadius: 6, maxWidth: 400, fontSize: '0.85em',
              backgroundColor: t.type === 'error' ? '#5a1d1d' : '#1d3a5a',
              border: `1px solid ${t.type === 'error' ? '#f44336' : '#4ec9b0'}`,
              color: '#fff', display: 'flex', alignItems: 'center', gap: 8,
              boxShadow: '0 4px 12px rgba(0,0,0,0.4)'
            }}>
              <AlertTriangle size={14} color={t.type === 'error' ? '#f44336' : '#4ec9b0'} />
              {t.message}
            </div>
          ))}
        </div>
      )}

      {/* 탭 바 */}
      <div style={{ height: 35, backgroundColor: '#252526', display: 'flex', alignItems: 'center', overflowX: 'auto', borderBottom: '1px solid #1e1e1e' }}>
        {terminals.map(t => (
          <div
            key={t.id}
            onClick={() => setActiveSessionId(t.id)}
            style={{
              padding: '0 10px', height: '100%', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', minWidth: 120, maxWidth: 200,
              backgroundColor: activeSessionId === t.id ? '#1e1e1e' : '#2d2d2d',
              borderRight: '1px solid #1e1e1e',
              color: activeSessionId === t.id ? '#fff' : '#888'
            }}
          >
            <span style={{ fontSize: '0.85em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {!t.connected && t.config ? '(끊김) ' : ''}{t.name}
            </span>
            <X size={14} onClick={(e) => closeTab(t.id, e)} style={{ opacity: 0.6 }} />
          </div>
        ))}
        <button onClick={() => createNewTab()} style={{ height: '100%', width: 35, background: 'none', border: 'none', color: '#ccc', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Plus size={16} />
        </button>
      </div>

      {/* 메인 콘텐츠 */}
      {activeSessionId && activeSession ? (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

          {/* 좌측 사이드바 */}
          <div style={{ width: 280, borderRight: '1px solid #333', display: 'flex', flexDirection: 'column', backgroundColor: '#252526' }}>
            {/* 사이드바 탭 헤더 */}
            <div style={{ display: 'flex', borderBottom: '1px solid #333' }}>
              <div
                onClick={() => setTerminals(prev => prev.map(t => t.id === activeSessionId ? { ...t, activeTab: 'sessions' } : t))}
                style={{
                  flex: 1, padding: 10, cursor: 'pointer', textAlign: 'center',
                  backgroundColor: activeSession.activeTab === 'sessions' ? '#1e1e1e' : 'transparent',
                  borderBottom: activeSession.activeTab === 'sessions' ? '2px solid #4ec9b0' : 'none',
                  fontWeight: activeSession.activeTab === 'sessions' ? 'bold' : 'normal',
                  fontSize: '0.9em'
                }}
              >
                Sessions
              </div>
              <div
                onClick={() => activeSession.connected && setTerminals(prev => prev.map(t => t.id === activeSessionId ? { ...t, activeTab: 'sftp' } : t))}
                style={{
                  flex: 1, padding: 10, cursor: activeSession.connected ? 'pointer' : 'default', textAlign: 'center',
                  backgroundColor: activeSession.activeTab === 'sftp' ? '#1e1e1e' : 'transparent',
                  borderBottom: activeSession.activeTab === 'sftp' ? '2px solid #dcb67a' : 'none',
                  fontWeight: activeSession.activeTab === 'sftp' ? 'bold' : 'normal',
                  opacity: activeSession.connected ? 1 : 0.5,
                  fontSize: '0.9em'
                }}
              >
                SFTP
              </div>
            </div>

            {/* 사이드바 콘텐츠 */}
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {activeSession.activeTab === 'sessions' ? (
                <SessionManager
                  sessions={sessions}
                  onConnect={(s: any) => {
                    if (!activeSession.connected && activeSession.name === 'New Tab') {
                      setTerminals(prev => prev.map(t => t.id === activeSessionId ? { ...t, name: s.name, config: s } : t))
                      connect(activeSessionId, s)
                    } else {
                      createNewTab(s)
                    }
                  }}
                  onSave={() => {}}
                  onDelete={deleteSession}
                  onImport={handleImport}
                  onExport={handleExport}
                />
              ) : (
                <div
                  style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
                  onDragOver={e => e.preventDefault()}
                  onDrop={(e) => handleFileDrop(e, activeSessionId, activeSession.currentPath)}
                >
                  <div style={{ padding: 10, borderBottom: '1px solid #333', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span title={activeSession.currentPath} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 200, fontSize: '0.85em' }}>
                      {activeSession.currentPath}
                    </span>
                    <div title="Drag files here">
                      <Upload size={14} />
                    </div>
                  </div>
                  <div style={{ padding: 5, borderBottom: '1px solid #333', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.9em' }} onClick={() => handleSftpNavigate(activeSessionId, '..')}>
                    <ArrowUp size={14} /> <span>Up Directory</span>
                  </div>
                  <div style={{ flex: 1, overflowY: 'auto' }}>
                    {activeSession.files.map((f: any, i: number) => (
                      <div
                        key={i}
                        draggable
                        onDragStart={(e) => handleFileDragStart(e, f, activeSessionId, activeSession.currentPath)}
                        onDoubleClick={() => f.attrs.mode & 0o40000 && handleSftpNavigate(activeSessionId, f.filename)}
                        style={{ padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.9em' }}
                      >
                        {f.attrs.mode & 0o40000 ? <Folder size={14} color="#dcb67a" /> : <File size={14} color="#ccc" />}
                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.filename}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 우측 메인 영역 */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>

            {/* 툴바 */}
            <div style={{ height: 40, borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', padding: '0 10px', gap: 10 }}>
              {activeSession.connected && <div style={{ color: '#4ec9b0', fontSize: '0.9em' }}>Connected: {activeSession.config?.host}</div>}
              {!activeSession.connected && activeSession.config && <div style={{ color: '#f44336', fontSize: '0.9em' }}>Disconnected</div>}
              <div style={{ flex: 1 }} />
              <button onClick={() => setShowSnippets(!showSnippets)} title="Snippets" style={{ background: 'none', border: 'none', color: '#ccc', cursor: 'pointer' }}>
                <ClipboardList size={18} />
              </button>
              <button onClick={() => setShowViHelp(!showViHelp)} title="Vi Cheat Sheet" style={{ background: 'none', border: 'none', color: '#ccc', cursor: 'pointer' }}>
                <HelpCircle size={18} />
              </button>
            </div>

            {/* 터미널 컨테이너 */}
            <div style={{ flex: 1, position: 'relative', display: activeSession.connected || activeSession.config ? 'flex' : 'none', flexDirection: 'column' }}>
              <div
                ref={el => { if (el) termRefs.current[activeSessionId] = el }}
                style={{ flex: 1, width: '100%', overflow: 'hidden' }}
              />

              {/* 서버 통계 */}
              {activeSession.serverStats && (
                <div style={{
                  height: 30, borderTop: '1px solid #333', backgroundColor: '#252526',
                  display: 'flex', alignItems: 'center', padding: '0 15px', gap: 20, fontSize: '0.85em', color: '#fff'
                }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }} title="CPU Load Average">
                    <Cpu size={14} color="#4ec9b0" /> {activeSession.serverStats.cpu || '-'}
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }} title="Memory Usage">
                    <MemoryStick size={14} color="#dcb67a" /> {activeSession.serverStats.mem || '-'}
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }} title="Disk Usage (Root)">
                    <HardDrive size={14} color="#569cd6" /> {activeSession.serverStats.disk || '-'}
                  </div>
                </div>
              )}

              {showViHelp && <ViCheatSheet onClose={() => setShowViHelp(false)} />}
              {showSnippets && <SnippetManager onClose={() => setShowSnippets(false)} onPaste={pasteSnippet} />}
            </div>

            {/* 로그인 폼 (미연결 시) */}
            {!activeSession.connected && (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: 300, padding: 20, backgroundColor: '#252526', borderRadius: 8 }}>
                  <h3>New Connection</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <input placeholder="Name" value={loginForm.name} onChange={e => setLoginForm({ ...loginForm, name: e.target.value })} />
                    <div style={{ display: 'flex', gap: 10 }}>
                      <input placeholder="Host" style={{ flex: 1 }} value={loginForm.host} onChange={e => setLoginForm({ ...loginForm, host: e.target.value })} />
                      <input placeholder="Port" style={{ width: 60 }} value={loginForm.port} onChange={e => setLoginForm({ ...loginForm, port: e.target.value })} />
                    </div>
                    <input placeholder="User" value={loginForm.username} onChange={e => setLoginForm({ ...loginForm, username: e.target.value })} />
                    <input placeholder="Password" type="password" value={loginForm.password} onChange={e => setLoginForm({ ...loginForm, password: e.target.value })} />

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      <div style={{ display: 'flex', gap: 5 }}>
                        <input
                          placeholder="Private Key Path (Optional)"
                          value={loginForm.privateKey}
                          onChange={e => setLoginForm({ ...loginForm, privateKey: e.target.value })}
                          style={{ flex: 1, fontSize: '0.8em' }}
                        />
                        <button onClick={handleKeySelect} style={{ padding: '0 8px' }}>...</button>
                      </div>
                      {loginForm.privateKey && (
                        <input
                          placeholder="Key Passphrase (if encrypted)"
                          type="password"
                          value={loginForm.passphrase}
                          onChange={e => setLoginForm({ ...loginForm, passphrase: e.target.value })}
                          style={{ fontSize: '0.8em' }}
                        />
                      )}
                    </div>

                    <input placeholder="Group" value={loginForm.group} onChange={e => setLoginForm({ ...loginForm, group: e.target.value })} />

                    <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                      <button onClick={() => connect(activeSessionId, loginForm)} style={{ flex: 1, padding: 8, cursor: 'pointer' }}>Connect</button>
                      <button onClick={saveSession} style={{ flex: 1, padding: 8, cursor: 'pointer' }}>Save</button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555', flexDirection: 'column', gap: 20 }}>
          <div>No Open Tabs</div>
          <button onClick={() => createNewTab()} style={{ padding: '10px 20px', cursor: 'pointer' }}>Create New Tab</button>
        </div>
      )}
    </div>
  )
}
