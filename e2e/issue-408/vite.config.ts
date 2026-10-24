import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [react()], envDir: '/dev/null',
  cacheDir: resolve('.e2e/issue-408-vite-cache'),
  resolve: { alias: { '@': resolve('src') }, dedupe: ['@assistant-ui/react', '@assistant-ui/core', '@assistant-ui/store', '@assistant-ui/tap'] },
  optimizeDeps: { entries: ['e2e/issue-408/index.html'] },
  server: { host: '127.0.0.1', port: 53128, strictPort: true, hmr: false, watch: { ignored: ['**/*'] } },
})
