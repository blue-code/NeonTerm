import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { SessionManager } from './components/SessionManager'
import { ViCheatSheet } from './components/ViCheatSheet'
import { SnippetManager } from './components/SnippetManager'
import {
  Folder, File, ArrowUp, Upload, HelpCircle, HardDrive, Cpu, MemoryStick,
  ClipboardList, X, Plus, AlertTriangle, RefreshCw, FolderPlus, Trash2,
  Download, PenLine, Copy
} from 'lucide-react'
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

interface ContextMenu {
  x: number
  y: number
  type: 'terminal' | 'sftp-file' | 'sftp-empty'
  target?: any  // SFTP 파일 항목
}

interface DeleteConfirm {
  file: any
  sessionId: string
  currentPath: string
}

export default function App() {
  const [terminals, setTerminals] = useState<TerminalSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)

  const termRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const termInstances = useRef<Record<string, Terminal>>({})
  const fitAddons = useRef<Record<string, FitAddon>>({})
  const resizeObservers = useRef<Record<string, ResizeObserver>>({})

  const [sessions, setSessions] = useState<{ groups: any[]; sessions: any[]; recentSessions: any[] }>({ groups: [], sessions: [], recentSessions: [] })
  const [showViHelp, setShowViHelp] = useState(false)
  const [showSnippets, setShowSnippets] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [loginForm, setLoginForm] = useState({
    host: '', username: '', password: '', port: '22',
    privateKey: '', passphrase: '', group: 'Default', name: 'New Session'
  })
  const [editingSession, setEditingSession] = useState<{ groupName: string; id: number } | null>(null)

  // 컨텍스트 메뉴 상태
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null)

  // 삭제 확인 모달
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirm | null>(null)

  // 이름 변경 인라인 상태
  const [renamingFile, setRenamingFile] = useState<{ file: any; newName: string } | null>(null)

  // 새 폴더 입력 상태
  const [newFolderName, setNewFolderName] = useState<string | null>(null)

  // SFTP 내부 드래그 상태
  const dragSftpSrc = useRef<{ path: string; filename: string; isDir: boolean; sessionId: string } | null>(null)
  const [dragOverDir, setDragOverDir] = useState<string | null>(null)

  // 토스트 알림
  const showToast = useCallback((message: string, type: 'error' | 'info' = 'error') => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000)
  }, [])

  useEffect(() => {
    api.invoke('get-sessions').then((data: any) => {
      setSessions({ groups: [], sessions: [], recentSessions: [], ...data })
    }).catch(() => {
      showToast('세션 목록을 불러오지 못했습니다', 'error')
    })
  }, [showToast])

  // IPC 이벤트 구독
  useEffect(() => {
    const offTermData = api.on('term-data', ({ sessionId, data }: any) => {
      termInstances.current[sessionId]?.write(data)
    })

    const offSshReady = api.on('ssh-ready', (sessionId: string) => {
      setTerminals(prev => prev.map(t =>
        t.id === sessionId ? { ...t, connected: true, activeTab: 'sftp' } : t
      ))
      // 연결 성공 후 세션 목록 갱신 (recentSessions 반영)
      api.invoke('get-sessions').then((data: any) => {
        setSessions({ groups: [], sessions: [], recentSessions: [], ...data })
      }).catch(() => {})
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

    const offSftpProgress = api.on('sftp-progress', ({ sessionId, completed, total, name }: any) => {
      showToast(`업로드 중: ${name} (${completed}/${total})`, 'info')
    })

    const offSftpDownloadDone = api.on('sftp-download-done', ({ sessionId }: any) => {
      showToast('다운로드 완료', 'info')
    })

    return () => {
      offTermData(); offSshReady(); offSshError(); offSshClosed()
      offSftpList(); offServerStats(); offSftpProgress(); offSftpDownloadDone()
    }
  }, [showToast])

  // 탭 전환 시 터미널 크기 재조정
  useEffect(() => {
    if (activeSessionId && fitAddons.current[activeSessionId]) {
      setTimeout(() => {
        fitAddons.current[activeSessionId]?.fit()
        const term = termInstances.current[activeSessionId]
        if (term) api.send('term-resize', { sessionId: activeSessionId, cols: term.cols, rows: term.rows })
      }, 0)
    }
  }, [activeSessionId])

  // 컨텍스트 메뉴 외부 클릭 닫힘
  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    window.addEventListener('click', close)
    window.addEventListener('contextmenu', close)
    return () => { window.removeEventListener('click', close); window.removeEventListener('contextmenu', close) }
  }, [contextMenu])

  // 키보드 단축키 (capture phase)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 탭 관련 단축키
      if (e.ctrlKey && e.shiftKey && e.key === 'T') { e.preventDefault(); createNewTab() }
      if (e.ctrlKey && e.shiftKey && e.key === 'W') {
        e.preventDefault()
        if (activeSessionId) closeTabById(activeSessionId)
      }
      if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault()
        if (terminals.length < 2) return
        const idx = terminals.findIndex(t => t.id === activeSessionId)
        const next = e.shiftKey ? (idx - 1 + terminals.length) % terminals.length : (idx + 1) % terminals.length
        setActiveSessionId(terminals[next].id)
      }

      // 터미널 클립보드 — 리눅스 표준: Ctrl+Shift+C / Ctrl+Shift+V
      if (e.ctrlKey && e.shiftKey && e.key === 'C') {
        const term = activeSessionId ? termInstances.current[activeSessionId] : null
        if (term) {
          const sel = term.getSelection()
          if (sel) { e.preventDefault(); navigator.clipboard.writeText(sel) }
        }
      }
      if (e.ctrlKey && e.shiftKey && e.key === 'V') {
        e.preventDefault()
        if (activeSessionId) {
          navigator.clipboard.readText().then(text => {
            if (text) api.send('term-input', { sessionId: activeSessionId, data: text })
          })
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  })

  const closeTabById = (id: string) => {
    api.send('disconnect-ssh', id)
    setTerminals(prev => {
      const filtered = prev.filter(t => t.id !== id)
      if (activeSessionId === id) {
        setActiveSessionId(filtered.length > 0 ? filtered[filtered.length - 1].id : null)
      }
      return filtered
    })
    if (resizeObservers.current[id]) { resizeObservers.current[id].disconnect(); delete resizeObservers.current[id] }
    if (termInstances.current[id]) { termInstances.current[id].dispose(); delete termInstances.current[id] }
    delete fitAddons.current[id]
    delete termRefs.current[id]
  }

  const createNewTab = (config: any = null) => {
    const newId = Date.now().toString()
    const newSession: TerminalSession = {
      id: newId, name: config?.name || 'New Tab', config,
      connected: false, files: [], currentPath: '.', serverStats: null, activeTab: 'sessions'
    }
    setTerminals(prev => [...prev, newSession])
    setActiveSessionId(newId)
    if (config) setTimeout(() => connect(newId, config), 100)
  }

  const closeTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    closeTabById(id)
  }

  const validateConfig = (config: any): string | null => {
    if (!config.host?.trim()) return 'Host를 입력하세요'
    if (!config.username?.trim()) return 'Username을 입력하세요'
    const port = parseInt(config.port, 10)
    if (isNaN(port) || port < 1 || port > 65535) return 'Port는 1~65535 범위여야 합니다'
    if (!config.password && !config.privateKey) return 'Password 또는 Private Key를 입력하세요'
    return null
  }

  const reconnect = (sessionId: string) => {
    const session = terminals.find(t => t.id === sessionId)
    if (!session?.config) return
    setTerminals(prev => prev.map(t =>
      t.id === sessionId ? { ...t, connected: false, files: [], serverStats: null } : t
    ))
    api.send('connect-ssh', { sessionId, config: session.config })
  }

  const connect = (sessionId: string, config: any) => {
    if (!termInstances.current[sessionId] && termRefs.current[sessionId]) {
      const term = new Terminal({
        theme: {
          background: '#050507', foreground: '#f2f2f2', cursor: '#00d992',
          cursorAccent: '#050507', selectionBackground: 'rgba(0, 217, 146, 0.25)',
          black: '#3d3a39', brightBlack: '#8b949e', green: '#00d992', brightGreen: '#2fd6a1',
          blue: '#818cf8', brightBlue: '#4cb3d4', red: '#fb565b', brightRed: '#fd9c9f',
          yellow: '#ffba00', brightYellow: '#ffdd80', magenta: '#818cf8', brightMagenta: '#b8b3b0',
          cyan: '#4cb3d4', brightCyan: '#00d992', white: '#f2f2f2', brightWhite: '#ffffff'
        },
        fontFamily: 'SFMono-Regular, Consolas, Liberation Mono, Menlo, monospace',
        fontSize: 14, cursorBlink: true
      })
      const fitAddon = new FitAddon()
      term.loadAddon(fitAddon)
      term.open(termRefs.current[sessionId]!)
      fitAddon.fit()
      term.onData(data => api.send('term-input', { sessionId, data }))
      termInstances.current[sessionId] = term
      fitAddons.current[sessionId] = fitAddon
      api.send('term-resize', { sessionId, cols: term.cols, rows: term.rows })
      const ro = new ResizeObserver(() => {
        fitAddon.fit()
        api.send('term-resize', { sessionId, cols: term.cols, rows: term.rows })
      })
      ro.observe(termRefs.current[sessionId]!)
      resizeObservers.current[sessionId] = ro
    }
    api.send('connect-ssh', { sessionId, config })
  }

  const handleSftpNavigate = (sessionId: string, target: string) => {
    const session = terminals.find(t => t.id === sessionId)
    if (!session) return
    let targetPath: string
    if (target === '..') {
      if (session.currentPath === '/') return
      const parts = session.currentPath.split('/')
      parts.pop()
      targetPath = parts.join('/') || '/'
    } else if (target.startsWith('/')) {
      targetPath = target
    } else {
      targetPath = session.currentPath === '/' ? '/' + target : session.currentPath + '/' + target
    }
    api.send('sftp-navigate', { sessionId, path: targetPath })
  }

  // ───── SFTP 드래그 업로드 (로컬 → 원격) ─────
  const handleFileDrop = (e: React.DragEvent, sessionId: string, remotePath: string) => {
    e.preventDefault()
    setDragOverDir(null)

    // SFTP 내부 이동인지 먼저 확인
    if (dragSftpSrc.current && dragSftpSrc.current.sessionId === sessionId) {
      const src = dragSftpSrc.current
      const destPath = remotePath === '/' ? `/${src.filename}` : `${remotePath}/${src.filename}`
      if (src.path !== destPath) {
        api.send('sftp-move', { sessionId, srcPath: src.path, destPath, currentPath: remotePath })
      }
      dragSftpSrc.current = null
      return
    }

    // 로컬 파일 드롭
    const filePaths = Array.from(e.dataTransfer.files).map((f: any) => f.path)
    if (filePaths.length > 0) {
      api.send('sftp-upload', { sessionId, remotePath, localPaths: filePaths })
    }
  }

  // ───── SFTP 파일 항목 드래그 시작 (원격 → 로컬 OR 내부 이동) ─────
  const handleSftpDragStart = (e: React.DragEvent, file: any, sessionId: string, currentPath: string) => {
    const isDir = !!(file.attrs.mode & 0o40000)
    const filePath = currentPath === '/' ? `/${file.filename}` : `${currentPath}/${file.filename}`

    // 내부 이동용 데이터 기록
    dragSftpSrc.current = { path: filePath, filename: file.filename, isDir, sessionId }

    // 외부로 드래그(다운로드)는 파일일 때만 startDrag 처리
    if (!isDir) {
      e.dataTransfer.effectAllowed = 'copy'
      api.send('sftp-drag-start', { sessionId, remotePath: currentPath, file })
    } else {
      e.dataTransfer.effectAllowed = 'move'
    }
  }

  const handleKeySelect = async () => {
    const result = await api.invoke('dialog-open-file')
    if (result && !result.canceled && result.filePaths.length > 0) {
      setLoginForm({ ...loginForm, privateKey: result.filePaths[0] })
    }
  }

  const saveSession = () => {
    const newSessions = JSON.parse(JSON.stringify(sessions))
    const isEditing = editingSession !== null
    if (isEditing && editingSession) {
      const oldGroup = newSessions.groups.find((g: any) => g.name === editingSession.groupName)
      if (oldGroup) {
        oldGroup.sessions = oldGroup.sessions.filter((s: any) => s.id !== editingSession.id)
        if (oldGroup.sessions.length === 0) newSessions.groups = newSessions.groups.filter((g: any) => g.name !== editingSession.groupName)
      }
    }
    let group = newSessions.groups.find((g: any) => g.name === loginForm.group)
    if (!group) { group = { name: loginForm.group, sessions: [] }; newSessions.groups.push(group) }
    group.sessions.push({ id: isEditing ? editingSession!.id : Date.now(), ...loginForm })
    setSessions(newSessions)
    api.invoke('save-sessions', newSessions)
    showToast(isEditing ? '세션을 수정했습니다' : '세션을 저장했습니다', 'info')
    setEditingSession(null)
  }

  const editSession = (groupName: string, sess: any) => {
    setEditingSession({ groupName, id: sess.id })
    setLoginForm({
      host: sess.host || '', username: sess.username || '', password: sess.password || '',
      port: sess.port || '22', privateKey: sess.privateKey || '', passphrase: sess.passphrase || '',
      group: sess.group || groupName, name: sess.name || ''
    })
    if (activeSessionId) {
      setTerminals(prev => prev.map(t => t.id === activeSessionId ? { ...t, activeTab: 'sessions' } : t))
    }
  }

  const deleteSession = (groupName: string, sessionId: number) => {
    const newSessions = JSON.parse(JSON.stringify(sessions))
    const group = newSessions.groups.find((g: any) => g.name === groupName)
    if (group) {
      group.sessions = group.sessions.filter((s: any) => s.id !== sessionId)
      if (group.sessions.length === 0) newSessions.groups = newSessions.groups.filter((g: any) => g.name !== groupName)
    }
    setSessions(newSessions)
    api.invoke('save-sessions', newSessions)
  }

  const handleImport = async () => {
    const data = await api.invoke('import-sessions')
    if (data) { setSessions({ groups: [], sessions: [], recentSessions: [], ...data }); showToast('세션을 가져왔습니다', 'info') }
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

  // ───── SFTP 삭제 실행 ─────
  const executeSftpDelete = (file: any, sessionId: string, currentPath: string) => {
    const isDir = !!(file.attrs.mode & 0o40000)
    const targetPath = currentPath === '/' ? `/${file.filename}` : `${currentPath}/${file.filename}`
    api.send('sftp-delete', { sessionId, targetPath, isDir, currentPath })
    setDeleteConfirm(null)
  }

  // ───── SFTP 이름 변경 실행 ─────
  const executeSftpRename = (sessionId: string, currentPath: string, oldName: string, newName: string) => {
    if (!newName.trim() || newName === oldName) { setRenamingFile(null); return }
    const oldPath = currentPath === '/' ? `/${oldName}` : `${currentPath}/${oldName}`
    const newPath = currentPath === '/' ? `/${newName}` : `${currentPath}/${newName}`
    api.send('sftp-rename', { sessionId, oldPath, newPath, currentPath })
    setRenamingFile(null)
  }

  // ───── SFTP 새 폴더 만들기 ─────
  const executeCreateFolder = (sessionId: string, currentPath: string, folderName: string) => {
    if (!folderName.trim()) { setNewFolderName(null); return }
    const dirPath = currentPath === '/' ? `/${folderName}` : `${currentPath}/${folderName}`
    api.send('sftp-mkdir', { sessionId, dirPath, currentPath })
    setNewFolderName(null)
  }

  // ───── 터미널 우클릭 메뉴 ─────
  const handleTerminalContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, type: 'terminal' })
  }

  // ───── SFTP 우클릭 메뉴 ─────
  const handleSftpContextMenu = (e: React.MouseEvent, file?: any) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, type: file ? 'sftp-file' : 'sftp-empty', target: file })
  }

  const activeSession = terminals.find(t => t.id === activeSessionId)

  // ───── 컨텍스트 메뉴 렌더 ─────
  const renderContextMenu = () => {
    if (!contextMenu) return null

    const menuStyle: React.CSSProperties = {
      position: 'fixed', top: contextMenu.y, left: contextMenu.x, zIndex: 99999,
      backgroundColor: '#131318', border: '1px solid #2a2830', borderRadius: 6,
      boxShadow: '0 8px 32px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04)',
      minWidth: 170, overflow: 'hidden', fontSize: '0.875em'
    }
    const itemStyle: React.CSSProperties = {
      padding: '8px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 9,
      color: '#d4d0cc', transition: 'background 0.1s', userSelect: 'none'
    }
    const hoverStyle = (e: React.MouseEvent<HTMLDivElement>, enter: boolean) => {
      e.currentTarget.style.backgroundColor = enter ? '#1e1c26' : 'transparent'
    }
    const dividerStyle: React.CSSProperties = {
      height: 1, backgroundColor: '#2a2830', margin: '3px 0'
    }

    if (contextMenu.type === 'terminal') {
      return (
        <div style={menuStyle} onClick={e => e.stopPropagation()}>
          <div style={itemStyle}
            onMouseEnter={e => hoverStyle(e, true)} onMouseLeave={e => hoverStyle(e, false)}
            onClick={() => {
              if (!activeSessionId) return
              const term = termInstances.current[activeSessionId]
              const sel = term?.getSelection()
              if (sel) navigator.clipboard.writeText(sel)
              setContextMenu(null)
            }}>
            <Copy size={14} color="#818cf8" /> 복사 <span style={{ marginLeft: 'auto', color: '#4a4845', fontSize: '0.8em' }}>Ctrl+Shift+C</span>
          </div>
          <div style={itemStyle}
            onMouseEnter={e => hoverStyle(e, true)} onMouseLeave={e => hoverStyle(e, false)}
            onClick={() => {
              if (!activeSessionId) return
              navigator.clipboard.readText().then(text => {
                if (text) api.send('term-input', { sessionId: activeSessionId, data: text })
              })
              setContextMenu(null)
            }}>
            <Upload size={14} color="#00d992" /> 붙여넣기 <span style={{ marginLeft: 'auto', color: '#4a4845', fontSize: '0.8em' }}>Ctrl+Shift+V</span>
          </div>
          <div style={dividerStyle} />
          <div style={itemStyle}
            onMouseEnter={e => hoverStyle(e, true)} onMouseLeave={e => hoverStyle(e, false)}
            onClick={() => {
              if (!activeSessionId) return
              api.send('term-input', { sessionId: activeSessionId, data: 'clear\n' })
              setContextMenu(null)
            }}>
            <RefreshCw size={14} color="#4cb3d4" /> 화면 지우기
          </div>
        </div>
      )
    }

    if (contextMenu.type === 'sftp-empty' && activeSession) {
      return (
        <div style={menuStyle} onClick={e => e.stopPropagation()}>
          <div style={itemStyle}
            onMouseEnter={e => hoverStyle(e, true)} onMouseLeave={e => hoverStyle(e, false)}
            onClick={() => {
              setNewFolderName('새 폴더')
              setContextMenu(null)
            }}>
            <FolderPlus size={14} color="#818cf8" /> 새 폴더 만들기
          </div>
          <div style={itemStyle}
            onMouseEnter={e => hoverStyle(e, true)} onMouseLeave={e => hoverStyle(e, false)}
            onClick={() => {
              api.send('sftp-navigate', { sessionId: activeSessionId, path: activeSession.currentPath })
              setContextMenu(null)
            }}>
            <RefreshCw size={14} color="#4cb3d4" /> 새로고침
          </div>
          <div style={dividerStyle} />
          <div style={{ ...itemStyle, color: '#8b949e', fontSize: '0.8em' }}>
            <Folder size={13} /> {activeSession.currentPath}
          </div>
        </div>
      )
    }

    if (contextMenu.type === 'sftp-file' && activeSession && contextMenu.target) {
      const file = contextMenu.target
      const isDir = !!(file.attrs.mode & 0o40000)
      const filePath = activeSession.currentPath === '/'
        ? `/${file.filename}` : `${activeSession.currentPath}/${file.filename}`

      return (
        <div style={menuStyle} onClick={e => e.stopPropagation()}>
          <div style={itemStyle}
            onMouseEnter={e => hoverStyle(e, true)} onMouseLeave={e => hoverStyle(e, false)}
            onClick={() => {
              api.invoke('sftp-download-dialog', { sessionId: activeSessionId, remotePath: activeSession.currentPath, file })
              setContextMenu(null)
            }}>
            <Download size={14} color="#00d992" /> 다운로드
          </div>
          <div style={dividerStyle} />
          <div style={itemStyle}
            onMouseEnter={e => hoverStyle(e, true)} onMouseLeave={e => hoverStyle(e, false)}
            onClick={() => {
              setRenamingFile({ file, newName: file.filename })
              setContextMenu(null)
            }}>
            <PenLine size={14} color="#818cf8" /> 이름 변경
          </div>
          <div style={itemStyle}
            onMouseEnter={e => hoverStyle(e, true)} onMouseLeave={e => hoverStyle(e, false)}
            onClick={() => {
              navigator.clipboard.writeText(filePath)
              showToast('경로가 복사되었습니다', 'info')
              setContextMenu(null)
            }}>
            <Copy size={14} color="#4cb3d4" /> 경로 복사
          </div>
          {!isDir && (
            <>
              <div style={dividerStyle} />
              <div style={itemStyle}
                onMouseEnter={e => hoverStyle(e, true)} onMouseLeave={e => hoverStyle(e, false)}
                onClick={() => {
                  setNewFolderName('새 폴더')
                  setContextMenu(null)
                }}>
                <FolderPlus size={14} color="#818cf8" /> 새 폴더 만들기
              </div>
            </>
          )}
          <div style={dividerStyle} />
          <div
            style={{ ...itemStyle, color: '#fb565b' }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#1e1018' }} onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
            onClick={() => {
              setDeleteConfirm({ file, sessionId: activeSessionId!, currentPath: activeSession.currentPath })
              setContextMenu(null)
            }}>
            <Trash2 size={14} /> 삭제
          </div>
        </div>
      )
    }

    return null
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', backgroundColor: '#050507', color: '#f2f2f2', fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' }}>

      {/* 토스트 알림 */}
      {toasts.length > 0 && (
        <div style={{ position: 'fixed', top: 12, right: 12, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {toasts.map(t => (
            <div key={t.id} style={{
              padding: '10px 16px', borderRadius: 6, maxWidth: 400, fontSize: '0.85em',
              backgroundColor: '#101010', border: `1px solid ${t.type === 'error' ? '#fb565b' : '#00d992'}`,
              color: '#f2f2f2', display: 'flex', alignItems: 'center', gap: 8,
              boxShadow: t.type === 'error' ? '0 0 12px rgba(251,86,91,0.3), rgba(0,0,0,0.7) 0px 8px 24px' : '0 0 12px rgba(0,217,146,0.3), rgba(0,0,0,0.7) 0px 8px 24px'
            }}>
              <AlertTriangle size={14} color={t.type === 'error' ? '#fb565b' : '#00d992'} />
              {t.message}
            </div>
          ))}
        </div>
      )}

      {/* 컨텍스트 메뉴 */}
      {renderContextMenu()}

      {/* 삭제 확인 모달 */}
      {deleteConfirm && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9998, backgroundColor: 'rgba(0,0,0,0.65)',
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div style={{
            backgroundColor: '#131318', border: '1px solid #2a2830', borderRadius: 10,
            padding: '28px 32px', maxWidth: 360, boxShadow: '0 20px 60px rgba(0,0,0,0.8)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <AlertTriangle size={20} color="#fb565b" />
              <span style={{ fontWeight: 600, fontSize: '1.05em' }}>삭제 확인</span>
            </div>
            <p style={{ color: '#b8b3b0', fontSize: '0.9em', lineHeight: 1.6, margin: '0 0 20px 0' }}>
              <strong style={{ color: '#f2f2f2' }}>"{deleteConfirm.file.filename}"</strong>을(를) 삭제하시겠습니까?<br />
              <span style={{ color: '#fb565b', fontSize: '0.88em' }}>이 작업은 되돌릴 수 없습니다.</span>
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setDeleteConfirm(null)}
                style={{ flex: 1, padding: '9px 0', backgroundColor: 'transparent', border: '1px solid #3d3a39', color: '#b8b3b0', borderRadius: 6, cursor: 'pointer', fontSize: '0.9em' }}>
                취소
              </button>
              <button onClick={() => executeSftpDelete(deleteConfirm.file, deleteConfirm.sessionId, deleteConfirm.currentPath)}
                style={{ flex: 1, padding: '9px 0', backgroundColor: '#2a0a0c', border: '1px solid #fb565b', color: '#fb565b', borderRadius: 6, cursor: 'pointer', fontSize: '0.9em', fontWeight: 600 }}>
                삭제
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 탭 바 */}
      <div style={{ height: 38, backgroundColor: '#101010', display: 'flex', alignItems: 'center', overflowX: 'auto', borderBottom: '1px solid #3d3a39' }}>
        {terminals.map(t => (
          <div key={t.id} onClick={() => setActiveSessionId(t.id)}
            style={{
              padding: '0 14px', height: '100%', display: 'flex', alignItems: 'center', gap: 8,
              cursor: 'pointer', minWidth: 120, maxWidth: 200,
              backgroundColor: activeSessionId === t.id ? '#050507' : '#101010',
              borderRight: '1px solid #3d3a39',
              borderBottom: activeSessionId === t.id ? '2px solid #00d992' : '2px solid transparent',
              color: activeSessionId === t.id ? '#f2f2f2' : '#8b949e', transition: 'all 0.15s ease'
            }}>
            {activeSessionId === t.id && (
              <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#00d992', boxShadow: '0 0 6px #00d992', flexShrink: 0 }} />
            )}
            <span style={{ fontSize: '0.85em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {!t.connected && t.config ? '(끊김) ' : ''}{t.name}
            </span>
            <X size={14} onClick={(e) => closeTab(t.id, e)} style={{ opacity: 0.5, flexShrink: 0 }} />
          </div>
        ))}
        <button onClick={() => createNewTab()}
          style={{ height: '100%', width: 38, background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Plus size={16} />
        </button>
      </div>

      {/* 메인 콘텐츠 */}
      {activeSessionId && activeSession ? (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

          {/* 좌측 사이드바 */}
          <div style={{ width: 280, borderRight: '1px solid #3d3a39', display: 'flex', flexDirection: 'column', backgroundColor: '#101010' }}>
            {/* 사이드바 탭 헤더 */}
            <div style={{ display: 'flex', borderBottom: '1px solid #3d3a39' }}>
              <div onClick={() => setTerminals(prev => prev.map(t => t.id === activeSessionId ? { ...t, activeTab: 'sessions' } : t))}
                style={{
                  flex: 1, padding: 10, cursor: 'pointer', textAlign: 'center',
                  backgroundColor: activeSession.activeTab === 'sessions' ? '#050507' : 'transparent',
                  borderBottom: activeSession.activeTab === 'sessions' ? '2px solid #00d992' : '2px solid transparent',
                  fontWeight: activeSession.activeTab === 'sessions' ? 600 : 400, fontSize: '0.9em',
                  color: activeSession.activeTab === 'sessions' ? '#f2f2f2' : '#8b949e', transition: 'all 0.15s ease'
                }}>Sessions</div>
              <div onClick={() => activeSession.connected && setTerminals(prev => prev.map(t => t.id === activeSessionId ? { ...t, activeTab: 'sftp' } : t))}
                style={{
                  flex: 1, padding: 10, cursor: activeSession.connected ? 'pointer' : 'default', textAlign: 'center',
                  backgroundColor: activeSession.activeTab === 'sftp' ? '#050507' : 'transparent',
                  borderBottom: activeSession.activeTab === 'sftp' ? '2px solid #818cf8' : '2px solid transparent',
                  fontWeight: activeSession.activeTab === 'sftp' ? 600 : 400,
                  opacity: activeSession.connected ? 1 : 0.5, fontSize: '0.9em',
                  color: activeSession.activeTab === 'sftp' ? '#f2f2f2' : '#8b949e', transition: 'all 0.15s ease'
                }}>SFTP</div>
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
                  onEdit={editSession}
                  onImport={handleImport}
                  onExport={handleExport}
                />
              ) : (
                // ───── SFTP 패널 ─────
                <div
                  style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
                  onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }}
                  onDrop={(e) => handleFileDrop(e, activeSessionId, activeSession.currentPath)}
                  onContextMenu={e => handleSftpContextMenu(e)}
                >
                  {/* SFTP 헤더 */}
                  <div style={{ padding: '8px 10px', borderBottom: '1px solid #3d3a39', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span title={activeSession.currentPath}
                      style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 190, fontSize: '0.82em', color: '#818cf8', fontWeight: 600 }}>
                      {activeSession.currentPath}
                    </span>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <button title="새 폴더" onClick={() => setNewFolderName('새 폴더')}
                        style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', padding: 2, display: 'flex' }}>
                        <FolderPlus size={14} />
                      </button>
                      <button title="새로고침" onClick={() => api.send('sftp-navigate', { sessionId: activeSessionId, path: activeSession.currentPath })}
                        style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', padding: 2, display: 'flex' }}>
                        <RefreshCw size={14} />
                      </button>
                      <div title="여기에 파일을 드래그하여 업로드" style={{ color: '#4cb3d4', display: 'flex', padding: 2 }}>
                        <Upload size={14} />
                      </div>
                    </div>
                  </div>

                  {/* 상위 디렉토리 */}
                  <div style={{ padding: '6px 10px', borderBottom: '1px solid #3d3a39', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.9em', color: '#b8b3b0' }}
                    onClick={() => handleSftpNavigate(activeSessionId, '..')}>
                    <ArrowUp size={14} /> <span>상위 디렉토리</span>
                  </div>

                  {/* 새 폴더 입력 */}
                  {newFolderName !== null && (
                    <div style={{ padding: '5px 10px', borderBottom: '1px solid #3d3a39', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Folder size={14} color="#818cf8" />
                      <input
                        autoFocus
                        value={newFolderName}
                        onChange={e => setNewFolderName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') executeCreateFolder(activeSessionId, activeSession.currentPath, newFolderName)
                          if (e.key === 'Escape') setNewFolderName(null)
                        }}
                        onBlur={() => executeCreateFolder(activeSessionId, activeSession.currentPath, newFolderName)}
                        style={{
                          flex: 1, backgroundColor: '#0a0a0f', border: '1px solid #818cf8',
                          color: '#f2f2f2', padding: '3px 8px', borderRadius: 4, fontSize: '0.88em', outline: 'none'
                        }}
                      />
                    </div>
                  )}

                  {/* 파일 목록 */}
                  <div style={{ flex: 1, overflowY: 'auto' }}>
                    {activeSession.files.map((f: any, i: number) => {
                      const isDir = !!(f.attrs.mode & 0o40000)
                      const isRenaming = renamingFile?.file.filename === f.filename
                      const isDragTarget = dragOverDir === f.filename && isDir

                      return (
                        <div
                          key={i}
                          draggable
                          onDragStart={e => handleSftpDragStart(e, f, activeSessionId, activeSession.currentPath)}
                          onDragEnd={() => { dragSftpSrc.current = null; setDragOverDir(null) }}
                          onDragOver={e => {
                            if (isDir) {
                              e.preventDefault()
                              e.stopPropagation()
                              e.dataTransfer.dropEffect = 'move'
                              setDragOverDir(f.filename)
                            }
                          }}
                          onDragLeave={() => setDragOverDir(null)}
                          onDrop={e => {
                            if (isDir) {
                              e.preventDefault()
                              e.stopPropagation()
                              const destDir = activeSession.currentPath === '/' ? `/${f.filename}` : `${activeSession.currentPath}/${f.filename}`
                              handleFileDrop(e, activeSessionId, destDir)
                            }
                          }}
                          onDoubleClick={() => isDir && handleSftpNavigate(activeSessionId, f.filename)}
                          onContextMenu={e => handleSftpContextMenu(e, f)}
                          style={{
                            padding: '5px 10px', display: 'flex', alignItems: 'center', gap: 8,
                            cursor: 'pointer', fontSize: '0.88em',
                            borderBottom: '1px solid rgba(61,58,57,0.3)',
                            backgroundColor: isDragTarget ? 'rgba(129,140,248,0.15)' : 'transparent',
                            outline: isDragTarget ? '1px solid #818cf8' : 'none',
                            transition: 'background 0.1s'
                          }}
                          onMouseEnter={e => { if (!isDragTarget) e.currentTarget.style.backgroundColor = '#0d0d12' }}
                          onMouseLeave={e => { if (!isDragTarget) e.currentTarget.style.backgroundColor = 'transparent' }}
                        >
                          {isDir ? <Folder size={14} color="#818cf8" style={{ flexShrink: 0 }} /> : <File size={14} color="#b8b3b0" style={{ flexShrink: 0 }} />}

                          {isRenaming ? (
                            <input
                              autoFocus
                              value={renamingFile!.newName}
                              onChange={e => setRenamingFile({ ...renamingFile!, newName: e.target.value })}
                              onKeyDown={e => {
                                if (e.key === 'Enter') executeSftpRename(activeSessionId, activeSession.currentPath, f.filename, renamingFile!.newName)
                                if (e.key === 'Escape') setRenamingFile(null)
                              }}
                              onBlur={() => executeSftpRename(activeSessionId, activeSession.currentPath, f.filename, renamingFile!.newName)}
                              onClick={e => e.stopPropagation()}
                              style={{
                                flex: 1, backgroundColor: '#0a0a0f', border: '1px solid #818cf8',
                                color: '#f2f2f2', padding: '2px 6px', borderRadius: 4, fontSize: '0.9em', outline: 'none'
                              }}
                            />
                          ) : (
                            <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#f2f2f2' }}>
                              {f.filename}
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 우측 메인 영역 */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* 툴바 */}
            <div style={{ height: 40, borderBottom: '1px solid #3d3a39', display: 'flex', alignItems: 'center', padding: '0 14px', gap: 12, backgroundColor: '#101010' }}>
              {activeSession.connected && (
                <div style={{ color: '#00d992', fontSize: '0.9em', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#00d992', boxShadow: '0 0 8px #00d992' }} />
                  {activeSession.config?.host}
                </div>
              )}
              {!activeSession.connected && activeSession.config && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: '#fb565b', fontSize: '0.9em', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#fb565b' }} />
                    Disconnected
                  </span>
                  <button onClick={() => reconnect(activeSessionId)}
                    style={{ background: 'transparent', border: '1px solid #3d3a39', borderRadius: 6, color: '#2fd6a1', cursor: 'pointer', padding: '3px 10px', fontSize: '0.8em', display: 'flex', alignItems: 'center', gap: 4, transition: 'border-color 0.15s' }}>
                    <RefreshCw size={12} /> Reconnect
                  </button>
                </div>
              )}
              <div style={{ flex: 1 }} />
              <button onClick={() => setShowSnippets(!showSnippets)} title="Snippets" style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', padding: 4 }}>
                <ClipboardList size={18} />
              </button>
              <button onClick={() => setShowViHelp(!showViHelp)} title="Vi Cheat Sheet" style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', padding: 4 }}>
                <HelpCircle size={18} />
              </button>
            </div>

            {/* 터미널 컨테이너 */}
            <div
              style={{ flex: 1, position: 'relative', display: activeSession.connected || activeSession.config ? 'flex' : 'none', flexDirection: 'column' }}
              onContextMenu={handleTerminalContextMenu}
            >
              <div style={{ flex: 1, position: 'relative' }}>
                {terminals.map(t => (
                  <div key={t.id} ref={el => { if (el) termRefs.current[t.id] = el }}
                    style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: t.id === activeSessionId ? 'block' : 'none' }} />
                ))}
              </div>

              {/* 서버 통계 */}
              {activeSession.serverStats && (
                <div style={{ height: 32, borderTop: '1px solid #3d3a39', backgroundColor: '#101010', display: 'flex', alignItems: 'center', padding: '0 15px', gap: 24, fontSize: '0.85em', color: '#f2f2f2' }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }} title="CPU Load Average">
                    <Cpu size={14} color="#00d992" /> <span style={{ color: '#b8b3b0' }}>{activeSession.serverStats.cpu || '-'}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }} title="Memory Usage">
                    <MemoryStick size={14} color="#818cf8" /> <span style={{ color: '#b8b3b0' }}>{activeSession.serverStats.mem || '-'}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }} title="Disk Usage (Root)">
                    <HardDrive size={14} color="#4cb3d4" /> <span style={{ color: '#b8b3b0' }}>{activeSession.serverStats.disk || '-'}</span>
                  </div>
                </div>
              )}

              {showViHelp && <ViCheatSheet onClose={() => setShowViHelp(false)} />}
              {showSnippets && <SnippetManager onClose={() => setShowSnippets(false)} onPaste={pasteSnippet} />}
            </div>

            {/* 로그인 폼 (미연결 시) */}
            {!activeSession.connected && (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#050507', overflow: 'hidden' }}>
                <div style={{ width: 340, padding: 24, backgroundColor: '#101010', borderRadius: 8, border: '1px solid #3d3a39', boxShadow: 'rgba(92,88,85,0.2) 0px 0px 15px, rgba(0,0,0,0.7) 0px 20px 60px' }}>
                  <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1em', fontWeight: 600, color: '#f2f2f2', letterSpacing: '-0.3px' }}>New Connection</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <input placeholder="Name" value={loginForm.name} onChange={e => setLoginForm({ ...loginForm, name: e.target.value })}
                      style={{ backgroundColor: '#050507', border: '1px solid #3d3a39', color: '#f2f2f2', padding: '8px 12px', borderRadius: 6, outline: 'none', fontSize: '0.9em' }} />
                    <div style={{ display: 'flex', gap: 10 }}>
                      <input placeholder="Host" value={loginForm.host} onChange={e => setLoginForm({ ...loginForm, host: e.target.value })}
                        style={{ flex: 1, backgroundColor: '#050507', border: '1px solid #3d3a39', color: '#f2f2f2', padding: '8px 12px', borderRadius: 6, outline: 'none', fontSize: '0.9em' }} />
                      <input placeholder="Port" value={loginForm.port} onChange={e => setLoginForm({ ...loginForm, port: e.target.value })}
                        style={{ width: 60, backgroundColor: '#050507', border: '1px solid #3d3a39', color: '#f2f2f2', padding: '8px 12px', borderRadius: 6, outline: 'none', fontSize: '0.9em', textAlign: 'center' }} />
                    </div>
                    <input placeholder="User" value={loginForm.username} onChange={e => setLoginForm({ ...loginForm, username: e.target.value })}
                      style={{ backgroundColor: '#050507', border: '1px solid #3d3a39', color: '#f2f2f2', padding: '8px 12px', borderRadius: 6, outline: 'none', fontSize: '0.9em' }} />
                    <input placeholder="Password" type="password" value={loginForm.password} onChange={e => setLoginForm({ ...loginForm, password: e.target.value })}
                      style={{ backgroundColor: '#050507', border: '1px solid #3d3a39', color: '#f2f2f2', padding: '8px 12px', borderRadius: 6, outline: 'none', fontSize: '0.9em' }} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <input placeholder="Private Key Path (Optional)" value={loginForm.privateKey}
                          onChange={e => setLoginForm({ ...loginForm, privateKey: e.target.value })}
                          style={{ flex: 1, backgroundColor: '#050507', border: '1px solid #3d3a39', color: '#f2f2f2', padding: '8px 12px', borderRadius: 6, outline: 'none', fontSize: '0.8em' }} />
                        <button onClick={handleKeySelect}
                          style={{ padding: '0 10px', backgroundColor: 'transparent', border: '1px solid #3d3a39', color: '#b8b3b0', borderRadius: 6, cursor: 'pointer' }}>...</button>
                      </div>
                      {loginForm.privateKey && (
                        <input placeholder="Key Passphrase (if encrypted)" type="password" value={loginForm.passphrase}
                          onChange={e => setLoginForm({ ...loginForm, passphrase: e.target.value })}
                          style={{ backgroundColor: '#050507', border: '1px solid #3d3a39', color: '#f2f2f2', padding: '8px 12px', borderRadius: 6, outline: 'none', fontSize: '0.8em' }} />
                      )}
                    </div>
                    <input placeholder="Group" value={loginForm.group} onChange={e => setLoginForm({ ...loginForm, group: e.target.value })}
                      style={{ backgroundColor: '#050507', border: '1px solid #3d3a39', color: '#f2f2f2', padding: '8px 12px', borderRadius: 6, outline: 'none', fontSize: '0.9em' }} />
                    <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                      <button onClick={() => {
                        const err = validateConfig(loginForm)
                        if (err) { showToast(err); return }
                        connect(activeSessionId, loginForm)
                      }} style={{ flex: 1, padding: '10px 16px', cursor: 'pointer', backgroundColor: '#101010', color: '#2fd6a1', border: '1px solid #3d3a39', borderRadius: 6, fontWeight: 600, fontSize: '0.9em', transition: 'border-color 0.15s' }}>
                        Connect
                      </button>
                      <button onClick={saveSession}
                        style={{ flex: 1, padding: '10px 16px', cursor: 'pointer', backgroundColor: 'transparent', color: '#f2f2f2', border: '1px solid #3d3a39', borderRadius: 6, fontWeight: 500, fontSize: '0.9em', transition: 'border-color 0.15s' }}>
                        {editingSession ? 'Update' : 'Save'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8b949e', flexDirection: 'column', gap: 24 }}>
          <div style={{ fontSize: '1.1em', fontWeight: 400, letterSpacing: '-0.3px' }}>No Open Tabs</div>
          <button onClick={() => createNewTab()}
            style={{ padding: '12px 24px', cursor: 'pointer', backgroundColor: '#101010', color: '#2fd6a1', border: '1px solid #3d3a39', borderRadius: 6, fontWeight: 600, fontSize: '0.95em', boxShadow: '0 0 12px rgba(0,217,146,0.1)', transition: 'border-color 0.15s, box-shadow 0.15s' }}>
            Create New Tab
          </button>
        </div>
      )}
    </div>
  )
}
