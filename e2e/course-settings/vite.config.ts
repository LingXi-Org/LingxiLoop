import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({ plugins: [react()], envDir: resolve(__dirname, '.empty-env'), cacheDir: '.e2e/course-settings-vite',
  optimizeDeps: { entries: ['e2e/course-settings/index.html'] }, resolve: { alias: { '@': resolve(__dirname, '../../src') } },
  server: { host: '127.0.0.1', port: 53182, strictPort: true, hmr: false, watch: { ignored: ['**/*'] } },
})
