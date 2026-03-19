import { contextBridge, ipcRenderer } from 'electron'

// 허용된 IPC 채널만 노출 (보안 — 화이트리스트 방식)
const SEND_CHANNELS = [
  'connect-ssh', 'disconnect-ssh', 'term-input', 'term-resize',
  'sftp-navigate', 'sftp-upload', 'sftp-drag-start'
]

const RECEIVE_CHANNELS = [
  'term-data', 'ssh-ready', 'ssh-error', 'ssh-closed',
  'sftp-list', 'server-stats'
]

const INVOKE_CHANNELS = [
  'get-sessions', 'save-sessions', 'get-snippets', 'save-snippets',
  'dialog-open-file', 'import-sessions', 'export-sessions'
]

contextBridge.exposeInMainWorld('electronAPI', {
  send(channel: string, ...args: any[]) {
    if (SEND_CHANNELS.includes(channel)) {
      ipcRenderer.send(channel, ...args)
    }
  },

  on(channel: string, callback: (...args: any[]) => void) {
    if (!RECEIVE_CHANNELS.includes(channel)) return () => {}
    const handler = (_event: Electron.IpcRendererEvent, ...args: any[]) => callback(...args)
    ipcRenderer.on(channel, handler)
    // 구독 해제 함수 반환
    return () => { ipcRenderer.removeListener(channel, handler) }
  },

  invoke(channel: string, ...args: any[]) {
    if (INVOKE_CHANNELS.includes(channel)) {
      return ipcRenderer.invoke(channel, ...args)
    }
    return Promise.reject(new Error(`허용되지 않은 채널: ${channel}`))
  }
})
