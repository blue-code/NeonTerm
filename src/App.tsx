// ... imports
import { Folder, File, ArrowUp, Upload, HelpCircle, Server, HardDrive, Cpu, MemoryStick, ClipboardList, List, Grid } from 'lucide-react'

// ...

export default function App() {
  // ... (existing state)
  const [activeTab, setActiveTab] = useState<'sessions' | 'sftp'>('sessions')

  // ... (existing effects and connect logic)

  const connect = (config: any) => {
    ipcRenderer.send('connect-ssh', config)
    ipcRenderer.once('ssh-ready', () => {
      setConnected(true)
      setShowLogin(false)
      setActiveTab('sftp') // Switch to SFTP tab on connect
    })
  }

  // ... (existing handlers)

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
                  <span>{currentPath}</span>
                  <Upload size={14} title="Drag files here" />
                </div>
                <div style={{ padding: 5, borderBottom: '1px solid #333', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }} onClick={() => ipcRenderer.send('sftp-navigate', '..')}>
                  <ArrowUp size={14} /> <span>Up Directory</span>
                </div>
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  {files.map((f: any, i: number) => (
                    <div 
                      key={i} 
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
// ... (rest of Main Area code: Toolbar, Terminal, Stats)
