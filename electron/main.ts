import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { Client } from 'ssh2'
import path from 'path'
import fs from 'fs'
import os from 'os'

let mainWindow: BrowserWindow | null
const DATA_FILE = path.join(app.getPath('userData'), 'neonterm-sessions.json')
const SNIPPET_FILE = path.join(app.getPath('userData'), 'neonterm-snippets.json')

// ... (Helper Load/Save functions) ...
function loadSessions() {
  if (!fs.existsSync(DATA_FILE)) return { groups: [], sessions: [] }
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')) } catch { return { groups: [], sessions: [] } }
}
function saveSessions(data: any) { fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2)) }
function loadSnippets() {
  if (!fs.existsSync(SNIPPET_FILE)) return []
  try { return JSON.parse(fs.readFileSync(SNIPPET_FILE, 'utf-8')) } catch { return [] }
}
function saveSnippets(data: any) { fs.writeFileSync(SNIPPET_FILE, JSON.stringify(data, null, 2)) }

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false
    },
  })
  if (process.env.VITE_DEV_SERVER_URL) mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  else mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
}

app.whenReady().then(createWindow)

// Multi-Session Manager
const connections: Record<string, { conn: Client, sftp?: any, statsInterval?: NodeJS.Timeout }> = {}

ipcMain.on('connect-ssh', (event, { sessionId, config }) => {
  const conn = new Client()
  
  try {
    if (config.privateKey) config.privateKey = fs.readFileSync(config.privateKey)
  } catch (err: any) {
    event.reply('ssh-error', { sessionId, message: 'Key Load Error: ' + err.message })
    return
  }

  // Initialize session state
  connections[sessionId] = { conn }

  conn.on('ready', () => {
    event.reply('ssh-ready', sessionId)
    startPolling(sessionId, event)
    
    conn.shell((err, stream) => {
      if (err) return event.reply('ssh-error', { sessionId, message: err.message })
      
      stream.on('close', () => {
        event.reply('ssh-closed', sessionId)
        cleanupSession(sessionId)
      }).on('data', (data: any) => {
        event.reply('term-data', { sessionId, data: data.toString() })
      })

      ipcMain.on('term-input', (_, { sessionId: targetId, data }) => {
        if (targetId === sessionId) stream.write(data)
      })
      
      conn.sftp((err, sftp) => {
        if (err) return
        if (connections[sessionId]) connections[sessionId].sftp = sftp
        refreshSftp(sessionId, '.', event)
      })
    })
  }).on('error', (err) => {
    event.reply('ssh-error', { sessionId, message: err.message })
  }).connect(config)
})

ipcMain.on('disconnect-ssh', (_, sessionId) => {
  if (connections[sessionId]) {
    connections[sessionId].conn.end()
    cleanupSession(sessionId)
  }
})

function cleanupSession(sessionId: string) {
  if (connections[sessionId]) {
    if (connections[sessionId].statsInterval) clearInterval(connections[sessionId].statsInterval!)
    delete connections[sessionId]
  }
}

function startPolling(sessionId: string, event: any) {
  const session = connections[sessionId]
  if (!session) return

  const fetchStats = () => {
    // Check if connection is still active
    // Note: 'exec' creates a new channel. If shell is active, connection is active.
    const cmd = `echo "LOAD:$(cat /proc/loadavg | awk '{print $1}')"; free -m | awk 'NR==2{printf "MEM:%s/%sMB %.1f%%", $3, $2, $3*100/$2}'; df -h / | awk 'NR==2{printf "DISK:%s/%s (%s)", $3, $2, $5}'`
    
    session.conn.exec(cmd, (err, stream) => {
      if (err) return
      let output = ''
      stream.on('data', (data: any) => { output += data.toString() })
      stream.on('close', () => {
        const stats: any = {}
        output.split('\n').forEach(line => {
          if (line.startsWith('LOAD:')) stats.cpu = `Load: ${line.substring(5)}`
          if (line.startsWith('MEM:')) stats.mem = line.substring(4)
          if (line.startsWith('DISK:')) stats.disk = line.substring(5)
        })
        event.reply('server-stats', { sessionId, stats })
      })
    })
  }

  fetchStats()
  session.statsInterval = setInterval(fetchStats, 5000)
}

function refreshSftp(sessionId: string, currentPath: string, event: any) {
  const session = connections[sessionId]
  if (!session || !session.sftp) return
  
  session.sftp.readdir(currentPath, (err: any, list: any[]) => {
    if (err) return
    const sorted = list.sort((a, b) => (b.attrs.mode & 0o40000) - (a.attrs.mode & 0o40000))
    event.reply('sftp-list', { sessionId, path: currentPath, files: sorted })
  })
}

ipcMain.on('sftp-navigate', (event, { sessionId, dir }) => {
  // Need to track current path per session in renderer, send full path or relative
  // For simplicity, let's assume renderer sends target path or we track it here.
  // Better: Renderer sends "target path" or ".."
  // Let's rely on renderer sending relative path and handle resolving there or here.
  // Wait, `sftp-list` event updates renderer's path state.
  // We need to know 'currentPath' of session here? Or just resolve from input.
  
  // Actually, to support ".." properly without tracking state in Main, 
  // Renderer should send the FULL target path.
  // Update: Let's assume 'dir' is the full path if absolute, or relative.
  // But wait, the previous implementation tracked 'currentPath' globally.
  // We need per-session path tracking in Main? Or pass it from Renderer.
  
  // Let's pass the 'currentPath' from Renderer in the request for statelessness.
  // Modify IPC to accept: { sessionId, currentPath, target }
  // BUT the App.tsx modification didn't include path tracking logic change in IPC call.
  // Let's fix App.tsx to send full path or handle path resolution in Renderer.
  
  // For now, let's allow 'sftp-navigate' to take a full path.
  // If 'dir' is '..', we need the current path.
  // Let's change IPC signature in Main to be stateless: (event, { sessionId, path })
})

// Correct implementation:
ipcMain.on('sftp-list-request', (event, { sessionId, path: targetPath }) => {
  refreshSftp(sessionId, targetPath, event)
})

// ... (Upload/Download also need sessionId) ...
ipcMain.on('sftp-upload', (event, { sessionId, remotePath, localPaths }) => {
  const session = connections[sessionId]
  if (!session || !session.sftp) return
  
  localPaths.forEach((localPath: string) => {
    const filename = path.basename(localPath)
    const dest = path.posix.join(remotePath, filename)
    session.sftp.fastPut(localPath, dest, (err: any) => {
      if (!err) refreshSftp(sessionId, remotePath, event)
    })
  })
})

ipcMain.on('sftp-drag-start', (event, { sessionId, remotePath, file }) => {
  const session = connections[sessionId]
  if (!session || !session.sftp) return
  
  const tempPath = path.join(os.tmpdir(), file.filename)
  const src = path.posix.join(remotePath, file.filename)
  
  session.sftp.fastGet(src, tempPath, (err: any) => {
    if (!err) event.sender.startDrag({ file: tempPath, icon: '' })
  })
})

// ... (Session/Snippet/File Dialog IPCs remain same)
ipcMain.handle('get-sessions', () => loadSessions())
ipcMain.handle('save-sessions', (_, data) => saveSessions(data))
ipcMain.handle('get-snippets', () => loadSnippets())
ipcMain.handle('save-snippets', (_, data) => saveSnippets(data))
ipcMain.handle('dialog-open-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, { properties: ['openFile'], filters: [{ name: 'Key', extensions: ['pem', 'ppk', 'key', 'txt', '*'] }] })
  return result
})
ipcMain.handle('import-sessions', async () => { /*...*/ })
ipcMain.handle('export-sessions', async (_, data) => { /*...*/ })
