import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { Client } from 'ssh2'
import path from 'path'
import fs from 'fs'
import os from 'os'

let mainWindow: BrowserWindow | null
const DATA_FILE = path.join(app.getPath('userData'), 'neonterm-sessions.json')

// --- Helper: Load/Save Sessions ---
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
    // Linux-specific stats command (lightweight)
    // 1. Load Avg (CPU proxy)
    // 2. Memory Usage (Used/Total)
    // 3. Disk Usage (Root partition)
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
        // Parse output
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
  
  // Handle Private Key (PEM) reading
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

    // Start Polling Stats
    startPolling(conn, event)
    
    // Start Shell
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
      
      // Start SFTP
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
    // Simple sort: folders first
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

// --- Session Management ---
ipcMain.handle('get-sessions', () => loadSessions())
ipcMain.handle('save-sessions', (_, data) => saveSessions(data))

// File Dialog for Private Key
ipcMain.handle('dialog-open-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile'],
    filters: [{ name: 'Key Files', extensions: ['pem', 'ppk', 'key', 'txt', '*'] }]
  })
  return result
})

// Session Import/Export
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
