import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        // Main process
        entry: 'electron/main.ts',
        vite: {
          build: {
            rollupOptions: {
              // Externalize ssh2 and native modules
              external: ['ssh2', 'cpu-features', 'fs', 'path', 'os', 'child_process']
            }
          }
        }
      },
      {
        entry: 'electron/preload.ts',
        onstart(options) { options.reload() },
      },
    ]),
    renderer(),
  ],
})
