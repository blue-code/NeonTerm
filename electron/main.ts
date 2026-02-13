import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { Client } from 'ssh2'
import path from 'path'
import fs from 'fs'
import os from 'os'

let mainWindow: BrowserWindow | null
const DATA_FILE = path.join(app.getPath('userData'), 'neonterm-sessions.json')
const SNIPPET_FILE = path.join(app.getPath('userData'), 'neonterm-snippets.json')

// --- Helper: Load/Save Data ---
function loadSessions() {
  if (!fs.existsSync(DATA_FILE)) return { groups: [], sessions: [] }
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'))
  } catch {
    return { groups: [], sessions: [] }
  }
}

function saveSessions(data: any) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2))
}

function loadSnippets() {
  if (!fs.existsSync(SNIPPET_FILE)) return []
  try { return JSON.parse(fs.readFileSync(SNIPPET_FILE, 'utf-8')) } catch { return [] }
}

function saveSnippets(data: any) {
  fs.writeFileSync(SNIPPET_FILE, JSON.stringify(data, null, 2))
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false // Allow local file access for drag-and-drop
    },
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(createWindow)

// --- SSH & SFTP Logic ---
const connections: Record<string, Client> = {}
let activeSftp: any = null
let currentPath = '.'
let statsInterval: NodeJS.Timeout | null = null

function startPolling(conn: Client, event: any) {
  if (statsInterval) clearInterval(statsInterval)
  
  const fetchStats = () => {
    const cmd = `
      echo "LOAD:$(cat /proc/loadavg | awk '{print $1}')"
      free -m | awk 'NR==2{printf "MEM:%s/%sMB %.1f%%", $3, $2, $3*100/$2}'
      df -h / | awk 'NR==2{printf "DISK:%s/%s (%s)", $3, $2, $5}'
    `
    
    conn.exec(cmd, (err, stream) => {
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
        event.reply('server-stats', stats)
      })
    })
  }

  fetchStats() // Initial fetch
  statsInterval = setInterval(fetchStats, 5000) // Poll every 5s
}

ipcMain.on('connect-ssh', (event, config) => {
  const conn = new Client()
  
  try {
    if (config.privateKey) {
      config.privateKey = fs.readFileSync(config.privateKey)
    }
  } catch (err: any) {
    event.reply('ssh-error', 'Key Load Error: ' + err.message)
    return
  }

  conn.on('ready', () => {
    event.reply('ssh-ready')
    startPolling(conn, event)
    
    conn.shell((err, stream) => {
      if (err) return event.reply('ssh-error', err.message)
      
      connections['main'] = conn
      
      stream.on('close', () => {
        event.reply('ssh-closed')
        if (statsInterval) clearInterval(statsInterval)
        conn.end()
      }).on('data', (data: any) => {
        event.reply('term-data', data.toString())
      })

      ipcMain.on('term-input', (_, data) => {
        stream.write(data)
      })
      
      conn.sftp((err, sftp) => {
        if (err) return
        activeSftp = sftp
        refreshSftp(event)
      })
    })
  }).on('error', (err) => {
    event.reply('ssh-error', err.message)
  }).connect(config)
})

function refreshSftp(event: any) {
  if (!activeSftp) return
  activeSftp.readdir(currentPath, (err: any, list: any[]) => {
    if (err) return
    const sorted = list.sort((a, b) => {
      const aDir = a.attrs.mode & 0o40000 ? 1 : 0
      const bDir = b.attrs.mode & 0o40000 ? 1 : 0
      return bDir - aDir
    })
    event.reply('sftp-list', { path: currentPath, files: sorted })
  })
}

ipcMain.on('sftp-navigate', (event, dir) => {
  if (dir === '..') {
    currentPath = path.dirname(currentPath)
  } else {
    currentPath = path.join(currentPath, dir).replace(/\\/g, '/')
  }
  refreshSftp(event)
})

ipcMain.on('sftp-upload', (event, localPaths) => {
  if (!activeSftp) return
  localPaths.forEach((localPath: string) => {
    const filename = path.basename(localPath)
    const remotePath = path.join(currentPath, filename).replace(/\\/g, '/')
    activeSftp.fastPut(localPath, remotePath, (err: any) => {
      if (err) console.error("Upload failed", err)
      else refreshSftp(event)
    })
  })
})

function downloadDir(sftp: any, src: string, dest: string, cb: () => void) {
  fs.mkdirSync(dest, { recursive: true })
  
  sftp.readdir(src, (err: any, list: any[]) => {
    if (err) return cb()
    
    let pending = list.length
    if (!pending) return cb()
    
    list.forEach((item: any) => {
      const srcPath = path.posix.join(src, item.filename)
      const destPath = path.join(dest, item.filename)
      
      if (item.attrs.mode & 0o40000) { // Directory
        downloadDir(sftp, srcPath, destPath, () => {
          if (!--pending) cb()
        })
      } else { // File
        sftp.fastGet(srcPath, destPath, (err: any) => {
          if (!--pending) cb()
        })
      }
    })
  })
}

ipcMain.on('sftp-drag-start', (event, file) => {
  const tempPath = path.join(os.tmpdir(), file.filename)
  const remotePath = path.posix.join(currentPath, file.filename)
  
  // Quick download to temp for drag-out
  // Note: Large folders/files might lag UI. Better to use async download indication.
  // For basic support, we download small files synchronously or fast.
  if (file.attrs.mode & 0o40000) {
     // Skip folder drag for now in simple impl, or zip it
     return 
  }

  activeSftp.fastGet(remotePath, tempPath, (err: any) => {
    if (!err) {
      event.sender.startDrag({
        file: tempPath,
        icon: '' // default icon
      })
    }
  })
})

// --- Session Management ---
ipcMain.handle('get-sessions', () => loadSessions())
ipcMain.handle('save-sessions', (_, data) => saveSessions(data))

// --- Snippet Management ---
ipcMain.handle('get-snippets', () => loadSnippets())
ipcMain.handle('save-snippets', (_, data) => saveSnippets(data))

// File Dialog
ipcMain.handle('dialog-open-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile'],
    filters: [{ name: 'Key Files', extensions: ['pem', 'ppk', 'key', 'txt', '*'] }]
  })
  return result
})

// Import/Export
ipcMain.handle('import-sessions', async () => {
  const { filePaths } = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile'],
    filters: [{ name: 'JSON Files', extensions: ['json'] }]
  })
  if (filePaths.length > 0) {
    const data = JSON.parse(fs.readFileSync(filePaths[0], 'utf-8'))
    saveSessions(data)
    return data
  }
  return null
})

ipcMain.handle('export-sessions', async (_, data) => {
  const { filePath } = await dialog.showSaveDialog(mainWindow!, {
    defaultPath: 'neonterm-sessions.json',
    filters: [{ name: 'JSON Files', extensions: ['json'] }]
  })
  if (filePath) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2))
    return true
  }
  return false
})
