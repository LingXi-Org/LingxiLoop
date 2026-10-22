import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
export default defineConfig({
  plugins: [react()], envDir: resolve(__dirname, '.empty-env'), cacheDir: '.e2e/run-recovery-vite',
  optimizeDeps: { entries: ['e2e/run-recovery/index.html'] },
  resolve: { alias: { '@': resolve(__dirname, '../../src') }, dedupe: ['@assistant-ui/react', '@assistant-ui/core', '@assistant-ui/store', '@assistant-ui/tap'] },
  server: { host: '127.0.0.1', port: 53126, strictPort: true, hmr: false, watch: { ignored: ['**/*'] } },
})
