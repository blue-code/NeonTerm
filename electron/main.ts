import { app, BrowserWindow, ipcMain, dialog, safeStorage } from 'electron'
import { Client } from 'ssh2'
import path from 'path'
import fs from 'fs'
import os from 'os'

let mainWindow: BrowserWindow | null
const DATA_FILE = path.join(app.getPath('userData'), 'neonterm-sessions.json')
const SNIPPET_FILE = path.join(app.getPath('userData'), 'neonterm-snippets.json')

// 드래그 다운로드 임시 파일 추적 (앱 종료 시 정리)
const tempFiles: string[] = []

// --- 비밀번호 암호화/복호화 (OS 레벨 보안 저장소 사용) ---
function encryptValue(value: string): string {
  if (!value) return value
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(value).toString('base64')
  }
  return value
}

function decryptValue(value: string): string {
  if (!value) return value
  if (safeStorage.isEncryptionAvailable()) {
    try {
      return safeStorage.decryptString(Buffer.from(value, 'base64'))
    } catch {
      // 복호화 실패 → 평문(마이그레이션 전 데이터)으로 간주
      return value
    }
  }
  return value
}

function encryptSessionData(data: any): any {
  const clone = JSON.parse(JSON.stringify(data))
  clone.groups?.forEach((g: any) => {
    g.sessions?.forEach((s: any) => {
      if (s.password) s.password = encryptValue(s.password)
      if (s.passphrase) s.passphrase = encryptValue(s.passphrase)
    })
  })
  // recentSessions도 암호화
  clone.recentSessions?.forEach((s: any) => {
    if (s.password) s.password = encryptValue(s.password)
    if (s.passphrase) s.passphrase = encryptValue(s.passphrase)
  })
  clone._encrypted = true
  return clone
}

function decryptSessionData(data: any): any {
  if (!data._encrypted) return data
  const clone = JSON.parse(JSON.stringify(data))
  clone.groups?.forEach((g: any) => {
    g.sessions?.forEach((s: any) => {
      if (s.password) s.password = decryptValue(s.password)
      if (s.passphrase) s.passphrase = decryptValue(s.passphrase)
    })
  })
  clone.recentSessions?.forEach((s: any) => {
    if (s.password) s.password = decryptValue(s.password)
    if (s.passphrase) s.passphrase = decryptValue(s.passphrase)
  })
  delete clone._encrypted
  return clone
}

// --- 세션/스니펫 로드/저장 ---
function loadSessions() {
  if (!fs.existsSync(DATA_FILE)) return { groups: [], sessions: [], recentSessions: [] }
  try {
    const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'))
    const decrypted = decryptSessionData(raw)
    if (!decrypted.recentSessions) decrypted.recentSessions = []
    return decrypted
  } catch { return { groups: [], sessions: [], recentSessions: [] } }
}

function saveSessions(data: any) {
  const encrypted = encryptSessionData(data)
  fs.writeFileSync(DATA_FILE, JSON.stringify(encrypted, null, 2))
}

// 최근 접속 기록 갱신 — 연결 성공 시 호출
function updateRecentSession(sessionConfig: any) {
  const data = loadSessions()
  const recent = data.recentSessions || []

  // 같은 host+username+port 이면 기존 항목 제거 후 맨 앞에 추가
  const filtered = recent.filter(
    (r: any) => !(r.host === sessionConfig.host && r.username === sessionConfig.username && r.port === sessionConfig.port)
  )
  filtered.unshift({ ...sessionConfig, lastConnected: new Date().toISOString() })

  // 최대 10개 유지
  data.recentSessions = filtered.slice(0, 10)
  saveSessions(data)
}

function loadSnippets() {
  if (!fs.existsSync(SNIPPET_FILE)) return []
  try { return JSON.parse(fs.readFileSync(SNIPPET_FILE, 'utf-8')) } catch { return [] }
}

function saveSnippets(data: any) {
  fs.writeFileSync(SNIPPET_FILE, JSON.stringify(data, null, 2))
}

// --- 윈도우 생성 ---
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true
    },
  })
  if (process.env.VITE_DEV_SERVER_URL) mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  else mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
}

app.whenReady().then(createWindow)

// macOS: 모든 창이 닫혀도 앱 유지, Dock 클릭 시 창 복원
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

// 앱 종료 시 모든 SSH 연결 종료 및 임시 파일 정리
app.on('will-quit', () => {
  Object.keys(connections).forEach(id => {
    try { connections[id].conn.end() } catch { /* 이미 종료됨 */ }
    cleanupSession(id)
  })
  tempFiles.forEach(f => {
    try { fs.unlinkSync(f) } catch { /* 이미 삭제됐거나 접근 불가 */ }
  })
})

// --- 다중 세션 관리 ---
interface SessionState {
  conn: Client
  sftp?: any
  stream?: any
  statsInterval?: NodeJS.Timeout
}

const connections: Record<string, SessionState> = {}

// term-input 리스너를 최상위에서 한 번만 등록 (누수 방지)
ipcMain.on('term-input', (_, { sessionId, data }) => {
  const session = connections[sessionId]
  if (session?.stream) session.stream.write(data)
})

// PTY 크기 동기화 — 렌더러에서 xterm 크기 변경 시 원격 셸에 반영
ipcMain.on('term-resize', (_, { sessionId, cols, rows }) => {
  const session = connections[sessionId]
  if (session?.stream) {
    try { session.stream.setWindow(rows, cols, rows * 16, cols * 8) } catch { /* 스트림 종료 상태 */ }
  }
})

// SSH 연결
ipcMain.on('connect-ssh', (event, { sessionId, config }) => {
  const conn = new Client()

  try {
    if (config.privateKey) config.privateKey = fs.readFileSync(config.privateKey)
  } catch (err: any) {
    event.reply('ssh-error', { sessionId, message: '키 파일 로드 실패: ' + err.message })
    return
  }

  connections[sessionId] = { conn }

  conn.on('ready', () => {
    event.reply('ssh-ready', sessionId)
    startPolling(sessionId, event)

    // 연결 성공 시 최근 접속 목록 갱신
    try {
      const configToSave = { ...config }
      // privateKey가 Buffer로 변환됐을 수 있으므로 원래 경로 문자열은 잃어버림
      // config.privateKeyPath를 별도로 전달받거나 여기서 처리
      if (Buffer.isBuffer(configToSave.privateKey)) delete configToSave.privateKey
      updateRecentSession(configToSave)
    } catch { /* 기록 실패해도 연결은 계속 진행 */ }

    conn.shell((err, stream) => {
      if (err) return event.reply('ssh-error', { sessionId, message: err.message })

      // stream 참조 저장 — term-input 핸들러에서 사용
      connections[sessionId].stream = stream

      stream.on('close', () => {
        event.reply('ssh-closed', sessionId)
        cleanupSession(sessionId)
      }).on('data', (data: any) => {
        event.reply('term-data', { sessionId, data: data.toString() })
      })

      // SFTP 채널 초기화
      conn.sftp((err, sftp) => {
        if (err) return
        if (connections[sessionId]) {
          connections[sessionId].sftp = sftp
          // 홈 디렉토리 절대 경로 확인
          sftp.realpath('.', (err: any, absPath: string) => {
            const startPath = err ? '/' : absPath
            refreshSftp(sessionId, startPath, event)
          })
        }
      })
    })
  }).on('error', (err) => {
    event.reply('ssh-error', { sessionId, message: err.message })
  }).connect({
    ...config,
    readyTimeout: 10000,
    keepaliveInterval: 10000,
    keepaliveCountMax: 3
  })
})

// SSH 연결 해제
ipcMain.on('disconnect-ssh', (_, sessionId) => {
  if (connections[sessionId]) {
    connections[sessionId].conn.end()
    cleanupSession(sessionId)
  }
})

function cleanupSession(sessionId: string) {
  const session = connections[sessionId]
  if (session) {
    if (session.statsInterval) clearInterval(session.statsInterval)
    // 스트림 명시적 해제 — 비동기 콜백이 남아있을 수 있으므로
    if (session.stream) {
      try { session.stream.destroy() } catch { /* 이미 종료됨 */ }
    }
    delete connections[sessionId]
  }
}

// --- 서버 모니터링 ---
function startPolling(sessionId: string, event: any) {
  const session = connections[sessionId]
  if (!session) return

  const fetchStats = () => {
    if (!connections[sessionId]) return
    const cmd = `echo "LOAD:$(cat /proc/loadavg | awk '{print $1}')"; free -m | awk 'NR==2{printf "MEM:%s/%sMB %.1f%%", $3, $2, $3*100/$2}'; df -h / | awk 'NR==2{printf "DISK:%s/%s (%s)", $3, $2, $5}'`

    session.conn.exec(cmd, (err, stream) => {
      // 경합 조건 방어: exec 콜백 도착 전에 세션이 종료될 수 있음
      if (err || !connections[sessionId]) return
      let output = ''
      stream.on('data', (data: any) => { output += data.toString() })
      stream.on('close', () => {
        if (!connections[sessionId]) return
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

// --- SFTP ---
function refreshSftp(sessionId: string, targetPath: string, event: any) {
  const session = connections[sessionId]
  if (!session?.sftp) return

  session.sftp.readdir(targetPath, (err: any, list: any[]) => {
    if (err) {
      event.reply('ssh-error', { sessionId, message: 'SFTP 목록 조회 실패: ' + err.message })
      return
    }
    // 디렉토리 우선 정렬
    const sorted = list.sort((a: any, b: any) => (b.attrs.mode & 0o40000) - (a.attrs.mode & 0o40000))
    event.reply('sftp-list', { sessionId, path: targetPath, files: sorted })
  })
}

// SFTP 경로 탐색 — 렌더러가 계산한 경로를 realpath로 정규화
ipcMain.on('sftp-navigate', (event, { sessionId, path: targetPath }) => {
  const session = connections[sessionId]
  if (!session?.sftp) return

  session.sftp.realpath(targetPath, (err: any, absPath: string) => {
    if (err) {
      event.reply('ssh-error', { sessionId, message: 'SFTP 경로 오류: ' + err.message })
      return
    }
    refreshSftp(sessionId, absPath, event)
  })
})

// --- SFTP 업로드 (디렉토리 재귀 지원) ---
ipcMain.on('sftp-upload', (event, { sessionId, remotePath, localPaths }) => {
  const session = connections[sessionId]
  if (!session?.sftp) return

  let total = 0
  let completed = 0

  function countItems(localPath: string): number {
    const stat = fs.statSync(localPath)
    if (stat.isDirectory()) {
      const children = fs.readdirSync(localPath)
      return children.reduce((acc, c) => acc + countItems(path.join(localPath, c)), 0)
    }
    return 1
  }

  function uploadItem(localPath: string, remoteDir: string, done: () => void) {
    const stat = fs.statSync(localPath)
    const name = path.basename(localPath)
    const remoteDest = path.posix.join(remoteDir, name)

    if (stat.isDirectory()) {
      // 원격에 디렉토리 생성 후 하위 항목 재귀 업로드
      session.sftp.mkdir(remoteDest, (mkErr: any) => {
        // 이미 존재하는 경우 무시
        const children = fs.readdirSync(localPath)
        if (children.length === 0) { done(); return }
        let childDone = 0
        children.forEach(child => {
          uploadItem(path.join(localPath, child), remoteDest, () => {
            childDone++
            if (childDone === children.length) done()
          })
        })
      })
    } else {
      session.sftp.fastPut(localPath, remoteDest, (err: any) => {
        if (err) {
          event.reply('ssh-error', { sessionId, message: `업로드 실패 (${name}): ${err.message}` })
        }
        completed++
        event.reply('sftp-progress', { sessionId, completed, total, name })
        done()
      })
    }
  }

  // 파일/디렉토리 개수 미리 산정
  localPaths.forEach((lp: string) => { total += countItems(lp) })

  let rootDone = 0
  localPaths.forEach((localPath: string) => {
    uploadItem(localPath, remotePath, () => {
      rootDone++
      if (rootDone === localPaths.length && connections[sessionId]) {
        refreshSftp(sessionId, remotePath, event)
      }
    })
  })
})

// --- SFTP 드래그 다운로드 (단일 파일 → startDrag) ---
ipcMain.on('sftp-drag-start', (event, { sessionId, remotePath, file }) => {
  const session = connections[sessionId]
  if (!session?.sftp) return

  const tempPath = path.join(os.tmpdir(), file.filename)
  const src = path.posix.join(remotePath, file.filename)

  session.sftp.fastGet(src, tempPath, (err: any) => {
    if (err) {
      event.reply('ssh-error', { sessionId, message: `다운로드 실패: ${err.message}` })
      return
    }
    tempFiles.push(tempPath)
    event.sender.startDrag({ file: tempPath, icon: '' })
  })
})

// --- SFTP 다운로드 (저장 다이얼로그 방식 — 파일/디렉토리 모두 지원) ---
ipcMain.handle('sftp-download-dialog', async (event, { sessionId, remotePath, file }) => {
  if (!mainWindow) return false
  const session = connections[sessionId]
  if (!session?.sftp) return false

  const isDir = !!(file.attrs.mode & 0o40000)

  if (isDir) {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: `"${file.filename}" 저장 위치 선택`,
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return false
    const destDir = result.filePaths[0]
    await downloadDirRecursive(session.sftp, path.posix.join(remotePath, file.filename), path.join(destDir, file.filename), event, sessionId)
  } else {
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: file.filename,
      title: `"${file.filename}" 저장`
    })
    if (result.canceled || !result.filePath) return false
    await new Promise<void>((resolve, reject) => {
      session.sftp.fastGet(path.posix.join(remotePath, file.filename), result.filePath!, (err: any) => {
        if (err) reject(err); else resolve()
      })
    }).catch(err => {
      event.sender.send('ssh-error', { sessionId, message: `다운로드 실패: ${err.message}` })
      return false
    })
  }

  event.sender.send('sftp-download-done', { sessionId })
  return true
})

// 디렉토리 재귀 다운로드 헬퍼
async function downloadDirRecursive(sftp: any, remoteSrc: string, localDest: string, event: any, sessionId: string) {
  if (!fs.existsSync(localDest)) fs.mkdirSync(localDest, { recursive: true })

  const list: any[] = await new Promise((resolve, reject) => {
    sftp.readdir(remoteSrc, (err: any, files: any[]) => err ? reject(err) : resolve(files))
  })

  for (const f of list) {
    const srcPath = path.posix.join(remoteSrc, f.filename)
    const destPath = path.join(localDest, f.filename)
    if (f.attrs.mode & 0o40000) {
      await downloadDirRecursive(sftp, srcPath, destPath, event, sessionId)
    } else {
      await new Promise<void>((resolve, reject) => {
        sftp.fastGet(srcPath, destPath, (err: any) => {
          if (err) { event.sender.send('ssh-error', { sessionId, message: `다운로드 실패 (${f.filename}): ${err.message}` }); resolve() }
          else resolve()
        })
      })
    }
  }
}

// --- SFTP 내부 이동 (rename) ---
ipcMain.on('sftp-move', (event, { sessionId, srcPath, destPath, currentPath }) => {
  const session = connections[sessionId]
  if (!session?.sftp) return

  session.sftp.rename(srcPath, destPath, (err: any) => {
    if (err) {
      event.reply('ssh-error', { sessionId, message: `이동 실패: ${err.message}` })
      return
    }
    refreshSftp(sessionId, currentPath, event)
  })
})

// --- SFTP 이름 변경 ---
ipcMain.on('sftp-rename', (event, { sessionId, oldPath, newPath, currentPath }) => {
  const session = connections[sessionId]
  if (!session?.sftp) return

  session.sftp.rename(oldPath, newPath, (err: any) => {
    if (err) {
      event.reply('ssh-error', { sessionId, message: `이름 변경 실패: ${err.message}` })
      return
    }
    refreshSftp(sessionId, currentPath, event)
  })
})

// --- SFTP 삭제 (파일/디렉토리 재귀) ---
ipcMain.on('sftp-delete', (event, { sessionId, targetPath, isDir, currentPath }) => {
  const session = connections[sessionId]
  if (!session?.sftp) return

  if (isDir) {
    deleteDirRecursive(session.sftp, targetPath, (err: any) => {
      if (err) {
        event.reply('ssh-error', { sessionId, message: `삭제 실패: ${err.message}` })
        return
      }
      refreshSftp(sessionId, currentPath, event)
    })
  } else {
    session.sftp.unlink(targetPath, (err: any) => {
      if (err) {
        event.reply('ssh-error', { sessionId, message: `삭제 실패: ${err.message}` })
        return
      }
      refreshSftp(sessionId, currentPath, event)
    })
  }
})

// 디렉토리 재귀 삭제 헬퍼
function deleteDirRecursive(sftp: any, dirPath: string, callback: (err: any) => void) {
  sftp.readdir(dirPath, (err: any, list: any[]) => {
    if (err) { callback(err); return }

    let pending = list.length
    if (pending === 0) {
      sftp.rmdir(dirPath, callback)
      return
    }

    list.forEach((f: any) => {
      const childPath = path.posix.join(dirPath, f.filename)
      if (f.attrs.mode & 0o40000) {
        deleteDirRecursive(sftp, childPath, (err: any) => {
          if (err) { callback(err); return }
          pending--
          if (pending === 0) sftp.rmdir(dirPath, callback)
        })
      } else {
        sftp.unlink(childPath, (err: any) => {
          if (err) { callback(err); return }
          pending--
          if (pending === 0) sftp.rmdir(dirPath, callback)
        })
      }
    })
  })
}

// --- SFTP 새 폴더 ---
ipcMain.on('sftp-mkdir', (event, { sessionId, dirPath, currentPath }) => {
  const session = connections[sessionId]
  if (!session?.sftp) return

  session.sftp.mkdir(dirPath, (err: any) => {
    if (err) {
      event.reply('ssh-error', { sessionId, message: `폴더 생성 실패: ${err.message}` })
      return
    }
    refreshSftp(sessionId, currentPath, event)
  })
})

// --- 세션/스니펫 IPC ---
ipcMain.handle('get-sessions', () => loadSessions())
ipcMain.handle('save-sessions', (_, data) => saveSessions(data))
ipcMain.handle('get-snippets', () => loadSnippets())
ipcMain.handle('save-snippets', (_, data) => saveSnippets(data))

ipcMain.handle('dialog-open-file', async () => {
  if (!mainWindow) return { canceled: true, filePaths: [] }
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Key', extensions: ['pem', 'ppk', 'key', 'txt', '*'] }]
  })
  return result
})

// --- Import/Export 구현 ---
// Import한 세션 JSON 구조 검증
function validateSessionData(data: any): boolean {
  if (!data || typeof data !== 'object') return false
  if (!Array.isArray(data.groups)) return false
  return data.groups.every((g: any) =>
    g && typeof g.name === 'string' && Array.isArray(g.sessions)
  )
}

ipcMain.handle('import-sessions', async () => {
  if (!mainWindow) return null
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }]
  })
  if (result.canceled || result.filePaths.length === 0) return null
  try {
    const raw = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf-8'))
    if (!validateSessionData(raw)) return null

    // 기존 세션과 병합 (덮어쓰기 방지)
    const existing = loadSessions()
    raw.groups.forEach((importGroup: any) => {
      const match = existing.groups.find((g: any) => g.name === importGroup.name)
      if (match) {
        // 같은 그룹이면 세션 추가 (중복 host+username 제외)
        importGroup.sessions.forEach((s: any) => {
          const dup = match.sessions.find((e: any) => e.host === s.host && e.username === s.username)
          if (!dup) match.sessions.push(s)
        })
      } else {
        existing.groups.push(importGroup)
      }
    })

    saveSessions(existing)
    return existing
  } catch {
    return null
  }
})

ipcMain.handle('export-sessions', async (_, data) => {
  if (!mainWindow) return false
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: 'neonterm-sessions.json',
    filters: [{ name: 'JSON', extensions: ['json'] }]
  })
  if (result.canceled || !result.filePath) return false
  try {
    // 내보내기는 평문으로 저장 (다른 환경에서 import 가능하도록)
    fs.writeFileSync(result.filePath, JSON.stringify(data, null, 2))
    return true
  } catch {
    return false
  }
})
