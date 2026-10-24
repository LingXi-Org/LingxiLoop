import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// One existing renderer fixture; excludes the unrelated app build/optimizer.
export default defineConfig({
  publicDir: false,
  plugins: [react()],
  cacheDir: '.e2e/streaming-budget-vite-cache',
  resolve: {
    alias: { '@': path.resolve('src') },
    dedupe: ['react', 'react-dom', '@assistant-ui/react', '@assistant-ui/core', '@assistant-ui/store', '@assistant-ui/tap'],
  },
  optimizeDeps: { entries: ['scripts/streaming-browser-check.html'], esbuildOptions: { sourcemap: false } },
  build: {
    outDir: '.e2e/streaming-budget-dist', reportCompressedSize: false, sourcemap: false,
    rollupOptions: { input: path.resolve('scripts/streaming-browser-check.html') },
  },
  preview: { host: '127.0.0.1', port: 5196, strictPort: true },
  server: { host: '127.0.0.1', port: 5196, strictPort: true, watch: { ignored: ['**/third_party/**'] } },
})
