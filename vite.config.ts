import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        // 메인 프로세스
        entry: 'electron/main.ts',
        vite: {
          build: {
            rollupOptions: {
              external: ['ssh2', 'cpu-features', 'fs', 'path', 'os', 'child_process']
            }
          }
        }
      },
      {
        // 프리로드 스크립트 (contextBridge 사용)
        entry: 'electron/preload.ts',
        onstart(options) { options.reload() },
      },
    ]),
  ],
})
