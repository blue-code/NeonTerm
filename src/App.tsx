import React, { useEffect, useRef, useState } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { SessionManager } from './components/SessionManager'
import { ViCheatSheet } from './components/ViCheatSheet'
import { SnippetManager } from './components/SnippetManager'
import { Folder, File, ArrowUp, Upload, HelpCircle, Server, HardDrive, Cpu, MemoryStick, ClipboardList, List, Grid, X, Plus } from 'lucide-react'
import 'xterm/css/xterm.css'

const { ipcRenderer } = window.require('electron')

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

export default function App() {
  const [terminals, setTerminals] = useState<TerminalSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  
  // Refs for multiple terminals
  const termRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const termInstances = useRef<Record<string, Terminal>>({})
  const fitAddons = useRef<Record<string, FitAddon>>({})

  // Global State (Sessions list, Snippets)
  const [sessions, setSessions] = useState({ groups: [], sessions: [] })
  const [showViHelp, setShowViHelp] = useState(false)
  const [showSnippets, setShowSnippets] = useState(false)
  const [showLogin, setShowLogin] = useState(true)
  const [loginForm, setLoginForm] = useState({ 
    host: '', username: '', password: '', port: '22', 
    privateKey: '', passphrase: '', group: 'Default', name: 'New Session' 
  })

  useEffect(() => {
    ipcRenderer.invoke('get-sessions').then(setSessions)
  }, [])

  // Handle SSH Events per session
  useEffect(() => {
    const handleTermData = (_: any, { sessionId, data }: any) => {
      termInstances.current[sessionId]?.write(data)
    }

    const handleSshReady = (_: any, sessionId: string) => {
      setTerminals(prev => prev.map(t => t.id === sessionId ? { ...t, connected: true, activeTab: 'sftp' } : t))
    }

    const handleSftpList = (_: any, { sessionId, path, files }: any) => {
      setTerminals(prev => prev.map(t => t.id === sessionId ? { ...t, files, currentPath: path } : t))
    }

    const handleServerStats = (_: any, { sessionId, stats }: any) => {
      setTerminals(prev => prev.map(t => t.id === sessionId ? { ...t, serverStats: stats } : t))
    }

    ipcRenderer.on('term-data', handleTermData)
    ipcRenderer.on('ssh-ready', handleSshReady)
    ipcRenderer.on('sftp-list', handleSftpList)
    ipcRenderer.on('server-stats', handleServerStats)

    return () => {
      ipcRenderer.removeListener('term-data', handleTermData)
      ipcRenderer.removeListener('ssh-ready', handleSshReady)
      ipcRenderer.removeListener('sftp-list', handleSftpList)
      ipcRenderer.removeListener('server-stats', handleServerStats)
    }
  }, [])

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
    ipcRenderer.send('disconnect-ssh', id)
    setTerminals(prev => {
      const filtered = prev.filter(t => t.id !== id)
      if (activeSessionId === id) {
        setActiveSessionId(filtered.length > 0 ? filtered[filtered.length - 1].id : null)
      }
      return filtered
    })
    // Cleanup refs
    delete termInstances.current[id]
    delete fitAddons.current[id]
    delete termRefs.current[id]
  }

  const connect = (sessionId: string, config: any) => {
    // Initialize Terminal UI for this session if not exists
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
      
      term.onData(data => ipcRenderer.send('term-input', { sessionId, data }))
      
      termInstances.current[sessionId] = term
      fitAddons.current[sessionId] = fitAddon
      
      // Handle Resize
      const resizeObserver = new ResizeObserver(() => fitAddon.fit())
      resizeObserver.observe(termRefs.current[sessionId]!)
    }

    ipcRenderer.send('connect-ssh', { sessionId, config })
  }

  // SFTP Handlers
  const handleSftpNavigate = (sessionId: string, dir: string) => {
    // We need to request main process to navigate. 
    // Note: The main process tracks current path, or we send ".."
    ipcRenderer.send('sftp-navigate', { sessionId, dir })
  }

  const handleFileDrop = (e: React.DragEvent, sessionId: string, remotePath: string) => {
    e.preventDefault()
    const filePaths = Array.from(e.dataTransfer.files).map(f => f.path)
    if (filePaths.length > 0) {
      ipcRenderer.send('sftp-upload', { sessionId, remotePath, localPaths: filePaths })
    }
  }

  const handleFileDragStart = (e: React.DragEvent, file: any, sessionId: string, remotePath: string) => {
    e.preventDefault()
    ipcRenderer.send('sftp-drag-start', { sessionId, remotePath, file })
  }

  // Global handlers
  const handleKeySelect = async () => {
    const result = await ipcRenderer.invoke('dialog-open-file')
    if (result && !result.canceled && result.filePaths.length > 0) {
      setLoginForm({ ...loginForm, privateKey: result.filePaths[0] })
    }
  }

  const saveSession = () => {
    const newSessions = { ...sessions }
    let group = newSessions.groups.find((g: any) => g.name === loginForm.group)
    if (!group) {
      group = { name: loginForm.group, sessions: [] }
      newSessions.groups.push(group as any) // Type assertion if needed
    }
    
    group.sessions.push({
      id: Date.now(),
      ...loginForm
    })
    
    setSessions(newSessions)
    ipcRenderer.invoke('save-sessions', newSessions)
  }

  const handleImport = async () => {
    const data = await ipcRenderer.invoke('import-sessions')
    if (data) setSessions(data)
  }

  const handleExport = async () => {
    await ipcRenderer.invoke('export-sessions', sessions)
  }

  const pasteSnippet = (cmd: string) => {
    if (activeSessionId && termInstances.current[activeSessionId]) {
      ipcRenderer.send('term-input', { sessionId: activeSessionId, data: cmd + '\n' })
      termInstances.current[activeSessionId].focus()
    }
  }

  // Active Session Helper
  const activeSession = terminals.find(t => t.id === activeSessionId)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: '#1e1e1e', color: '#ccc' }}>
      
      {/* Top Tab Bar */}
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
            <span style={{ fontSize: '0.85em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</span>
            <X size={14} onClick={(e) => closeTab(t.id, e)} style={{ opacity: 0.6 }} />
          </div>
        ))}
        <button onClick={() => createNewTab()} style={{ height: '100%', width: 35, background: 'none', border: 'none', color: '#ccc', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Plus size={16} />
        </button>
      </div>

      {/* Main Content Area */}
      {activeSessionId && activeSession ? (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          
          {/* Left Sidebar (Per Session) */}
          <div style={{ width: 280, borderRight: '1px solid #333', display: 'flex', flexDirection: 'column', backgroundColor: '#252526' }}>
             {/* Tab Header (Sessions/SFTP) */}
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

             {/* Sidebar Content */}
             <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
               {activeSession.activeTab === 'sessions' ? (
                 <SessionManager 
                   sessions={sessions} 
                   onConnect={(s: any) => {
                     // If current tab is empty/new, use it. Else create new tab.
                     if (!activeSession.connected && activeSession.name === 'New Tab') {
                        setTerminals(prev => prev.map(t => t.id === activeSessionId ? { ...t, name: s.name, config: s } : t))
                        connect(activeSessionId, s)
                     } else {
                        createNewTab(s)
                     }
                   }}
                   onSave={() => setShowLogin(true)}
                   onDelete={() => {}} 
                   onImport={handleImport}
                   onExport={handleExport}
                 />
               ) : (
                 /* SFTP View for activeSession */
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

          {/* Right Main Area */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
             
             {/* Toolbar */}
             <div style={{ height: 40, borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', padding: '0 10px', gap: 10 }}>
                {activeSession.connected && <div style={{ color: '#4ec9b0', fontSize: '0.9em' }}>Connected: {activeSession.config?.host}</div>}
                <div style={{ flex: 1 }} />
                <button onClick={() => setShowSnippets(!showSnippets)} title="Snippets" style={{ background: 'none', border: 'none', color: '#ccc', cursor: 'pointer' }}>
                  <ClipboardList size={18} />
                </button>
                <button onClick={() => setShowViHelp(!showViHelp)} title="Vi Cheat Sheet" style={{ background: 'none', border: 'none', color: '#ccc', cursor: 'pointer' }}>
                  <HelpCircle size={18} />
                </button>
             </div>

             {/* Terminal Container */}
             <div style={{ flex: 1, position: 'relative', display: activeSession.connected ? 'flex' : 'none', flexDirection: 'column' }}>
                <div 
                  ref={el => {
                    if (el) {
                      termRefs.current[activeSessionId] = el
                      // If re-rendering and not connected visually but logically connected, ensure term is open
                      // This is handled by 'connect' usually.
                    }
                  }} 
                  style={{ flex: 1, width: '100%', overflow: 'hidden' }} 
                />
                
                {/* Server Stats Footer */}
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

             {/* Login Form (if not connected) */}
             {!activeSession.connected && (
               <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ width: 300, padding: 20, backgroundColor: '#252526', borderRadius: 8 }}>
                    <h3>New Connection</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <input placeholder="Name" value={loginForm.name} onChange={e => setLoginForm({...loginForm, name: e.target.value})} />
                      <div style={{ display: 'flex', gap: 10 }}>
                        <input placeholder="Host" style={{ flex: 1 }} value={loginForm.host} onChange={e => setLoginForm({...loginForm, host: e.target.value})} />
                        <input placeholder="Port" style={{ width: 60 }} value={loginForm.port} onChange={e => setLoginForm({...loginForm, port: e.target.value})} />
                      </div>
                      <input placeholder="User" value={loginForm.username} onChange={e => setLoginForm({...loginForm, username: e.target.value})} />
                      <input placeholder="Password" type="password" value={loginForm.password} onChange={e => setLoginForm({...loginForm, password: e.target.value})} />
                      
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        <div style={{ display: 'flex', gap: 5 }}>
                          <input 
                            placeholder="Private Key Path (Optional)" 
                            value={loginForm.privateKey} 
                            onChange={e => setLoginForm({...loginForm, privateKey: e.target.value})} 
                            style={{ flex: 1, fontSize: '0.8em' }}
                          />
                          <button onClick={handleKeySelect} style={{ padding: '0 8px' }}>...</button>
                        </div>
                        {loginForm.privateKey && (
                          <input 
                            placeholder="Key Passphrase (if encrypted)" 
                            type="password"
                            value={loginForm.passphrase} 
                            onChange={e => setLoginForm({...loginForm, passphrase: e.target.value})} 
                            style={{ fontSize: '0.8em' }}
                          />
                        )}
                      </div>

                      <input placeholder="Group" value={loginForm.group} onChange={e => setLoginForm({...loginForm, group: e.target.value})} />
                      
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
