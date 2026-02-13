import React, { useEffect, useRef, useState } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { SessionManager } from './components/SessionManager'
import { ViCheatSheet } from './components/ViCheatSheet'
import { SnippetManager } from './components/SnippetManager'
import { Folder, File, ArrowUp, Upload, HelpCircle, Server, HardDrive, Cpu, MemoryStick, ClipboardList, List, Grid } from 'lucide-react'
import 'xterm/css/xterm.css'

const { ipcRenderer } = window.require('electron')

export default function App() {
  const termRef = useRef<HTMLDivElement>(null)
  const termInstance = useRef<Terminal | null>(null)
  const fitAddon = useRef<FitAddon | null>(null)
  
  const [files, setFiles] = useState<any[]>([])
  const [currentPath, setCurrentPath] = useState('.')
  const [connected, setConnected] = useState(false)
  const [sessions, setSessions] = useState({ groups: [], sessions: [] })
  const [showViHelp, setShowViHelp] = useState(false)
  const [showSnippets, setShowSnippets] = useState(false)
  const [serverStats, setServerStats] = useState<any>(null)
  const [activeTab, setActiveTab] = useState<'sessions' | 'sftp'>('sessions')

  // Login Form
  const [loginForm, setLoginForm] = useState({ 
    host: '', username: '', password: '', port: '22', 
    privateKey: '', passphrase: '', group: 'Default', name: 'New Session' 
  })
  const [showLogin, setShowLogin] = useState(true)

  useEffect(() => {
    // Load sessions on start
    ipcRenderer.invoke('get-sessions').then(setSessions)
    
    ipcRenderer.on('sftp-list', (_, { path, files }) => {
      setFiles(files)
      setCurrentPath(path)
    })

    ipcRenderer.on('server-stats', (_, stats) => {
      setServerStats(stats)
    })
    
    return () => { 
      ipcRenderer.removeAllListeners('sftp-list')
      ipcRenderer.removeAllListeners('server-stats')
    }
  }, [])

  useEffect(() => {
    if (!connected || !termRef.current) return

    const term = new Terminal({
      theme: { background: '#1e1e1e' },
      fontFamily: 'Consolas, monospace',
      fontSize: 14
    })
    termInstance.current = term
    fitAddon.current = new FitAddon()
    term.loadAddon(fitAddon.current)
    term.open(termRef.current)
    fitAddon.current.fit()

    term.onData(data => ipcRenderer.send('term-input', data))
    ipcRenderer.on('term-data', (_, data) => term.write(data))
    
    const resizeObserver = new ResizeObserver(() => fitAddon.current?.fit())
    resizeObserver.observe(termRef.current)

    return () => {
      term.dispose()
      resizeObserver.disconnect()
      ipcRenderer.removeAllListeners('term-data')
    }
  }, [connected])

  const connect = (config: any) => {
    ipcRenderer.send('connect-ssh', config)
    ipcRenderer.once('ssh-ready', () => {
      setConnected(true)
      setShowLogin(false)
      setActiveTab('sftp')
    })
  }

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const filePaths = Array.from(e.dataTransfer.files).map(f => f.path)
    if (filePaths.length > 0) {
      ipcRenderer.send('sftp-upload', filePaths)
    }
  }

  const handleFileDragStart = (e: React.DragEvent, file: any) => {
    e.preventDefault()
    ipcRenderer.send('sftp-drag-start', file)
  }

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
      newSessions.groups.push(group as any)
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
    if (termInstance.current) {
      ipcRenderer.send('term-input', cmd + '\n')
      termInstance.current.focus()
    }
  }

  return (
    <div style={{ display: 'flex', height: '100vh', backgroundColor: '#1e1e1e', color: '#ccc' }}>
      
      {/* Left Sidebar (Tabs) */}
      <div style={{ width: 280, borderRight: '1px solid #333', display: 'flex', flexDirection: 'column', backgroundColor: '#252526' }}>
        
        {/* Tab Header */}
        <div style={{ display: 'flex', borderBottom: '1px solid #333' }}>
          <div 
            onClick={() => setActiveTab('sessions')}
            style={{ 
              flex: 1, padding: 10, cursor: 'pointer', textAlign: 'center', 
              backgroundColor: activeTab === 'sessions' ? '#1e1e1e' : 'transparent',
              borderBottom: activeTab === 'sessions' ? '2px solid #4ec9b0' : 'none',
              fontWeight: activeTab === 'sessions' ? 'bold' : 'normal'
            }}
          >
            Sessions
          </div>
          <div 
            onClick={() => connected && setActiveTab('sftp')}
            style={{ 
              flex: 1, padding: 10, cursor: connected ? 'pointer' : 'default', textAlign: 'center',
              backgroundColor: activeTab === 'sftp' ? '#1e1e1e' : 'transparent',
              borderBottom: activeTab === 'sftp' ? '2px solid #dcb67a' : 'none',
              fontWeight: activeTab === 'sftp' ? 'bold' : 'normal',
              opacity: connected ? 1 : 0.5
            }}
          >
            SFTP
          </div>
        </div>

        {/* Tab Content */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {activeTab === 'sessions' ? (
            <SessionManager 
              sessions={sessions} 
              onConnect={(s: any) => connect(s)}
              onSave={() => setShowLogin(true)}
              onDelete={() => {}} 
              onImport={handleImport}
              onExport={handleExport}
            />
          ) : (
            connected && (
              <div 
                style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
                onDragOver={e => e.preventDefault()}
                onDrop={handleFileDrop}
              >
                <div style={{ padding: 10, borderBottom: '1px solid #333', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span title={currentPath} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 200 }}>{currentPath}</span>
                  <Upload size={14} title="Drag files here" />
                </div>
                <div style={{ padding: 5, borderBottom: '1px solid #333', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }} onClick={() => ipcRenderer.send('sftp-navigate', '..')}>
                  <ArrowUp size={14} /> <span>Up Directory</span>
                </div>
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  {files.map((f: any, i: number) => (
                    <div 
                      key={i} 
                      draggable
                      onDragStart={(e) => handleFileDragStart(e, f)}
                      onDoubleClick={() => f.attrs.mode & 0o40000 && ipcRenderer.send('sftp-navigate', f.filename)}
                      style={{ padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.9em' }}
                    >
                      {f.attrs.mode & 0o40000 ? <Folder size={14} color="#dcb67a" /> : <File size={14} color="#ccc" />}
                      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.filename}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          )}
        </div>
      </div>

      {/* Main Area (Terminal) */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: '#1e1e1e' }}>
        
        {/* Toolbar */}
        <div style={{ height: 40, borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', padding: '0 10px', gap: 10 }}>
          {connected && <div style={{ color: '#4ec9b0' }}>Connected: {currentPath}</div>}
          <div style={{ flex: 1 }} />
          <button onClick={() => setShowSnippets(!showSnippets)} title="Snippets" style={{ background: 'none', border: 'none', color: '#ccc', cursor: 'pointer' }}>
            <ClipboardList size={18} />
          </button>
          <button onClick={() => setShowViHelp(!showViHelp)} title="Vi Cheat Sheet" style={{ background: 'none', border: 'none', color: '#ccc', cursor: 'pointer' }}>
            <HelpCircle size={18} />
          </button>
        </div>

        {/* Workspace */}
        <div style={{ flex: 1, display: 'flex' }}>
          
          {/* Terminal */}
          {connected ? (
            <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column' }}>
               <div ref={termRef} style={{ flex: 1, width: '100%' }} />
               
               {/* Server Stats Footer */}
               {serverStats && (
                 <div style={{ 
                   height: 30, borderTop: '1px solid #333', backgroundColor: '#252526', 
                   display: 'flex', alignItems: 'center', padding: '0 15px', gap: 20, fontSize: '0.85em', color: '#fff'
                 }}>
                   <div style={{ display: 'flex', gap: 6, alignItems: 'center' }} title="CPU Load Average">
                     <Cpu size={14} color="#4ec9b0" /> {serverStats.cpu || '-'}
                   </div>
                   <div style={{ display: 'flex', gap: 6, alignItems: 'center' }} title="Memory Usage">
                     <MemoryStick size={14} color="#dcb67a" /> {serverStats.mem || '-'}
                   </div>
                   <div style={{ display: 'flex', gap: 6, alignItems: 'center' }} title="Disk Usage (Root)">
                     <HardDrive size={14} color="#569cd6" /> {serverStats.disk || '-'}
                   </div>
                 </div>
               )}

               {showViHelp && <ViCheatSheet onClose={() => setShowViHelp(false)} />}
               {showSnippets && <SnippetManager onClose={() => setShowSnippets(false)} onPaste={pasteSnippet} />}
            </div>
          ) : (
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
                  
                  {/* PEM Key Input */}
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
                    <button onClick={() => connect(loginForm)} style={{ flex: 1, padding: 8, cursor: 'pointer' }}>Connect</button>
                    <button onClick={saveSession} style={{ flex: 1, padding: 8, cursor: 'pointer' }}>Save</button>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
