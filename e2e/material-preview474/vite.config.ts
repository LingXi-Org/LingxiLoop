import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  cacheDir: '/tmp/lingxiloop-material-preview474-vite-cache',
  resolve: { alias: { '@': path.resolve('src') }, dedupe: ['react', 'react-dom'] },
  optimizeDeps: { entries: ['e2e/material-preview474/index.html'] },
  server: { host: '127.0.0.1', port: 5194, strictPort: true, watch: { ignored: ['**/third_party/**'] } },
})
