import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// One existing renderer fixture; excludes the unrelated app build/optimizer.
export default defineConfig({
  publicDir: false,
  plugins: [react()],
  cacheDir: '.e2e/viewport-controller-vite-cache',
  resolve: {
    alias: { '@': path.resolve('src') },
    dedupe: ['react', 'react-dom', '@assistant-ui/react', '@assistant-ui/core', '@assistant-ui/store', '@assistant-ui/tap'],
  },
  optimizeDeps: { entries: ['e2e/question-index/index.html'], esbuildOptions: { sourcemap: false } },
  build: {
    outDir: '.e2e/viewport-controller-dist', reportCompressedSize: false, sourcemap: false,
    rollupOptions: { input: path.resolve('e2e/question-index/index.html') },
  },
  preview: { host: '127.0.0.1', port: 5293, strictPort: true },
  server: { host: '127.0.0.1', port: 5293, strictPort: true, watch: { ignored: ['**/third_party/**'] } },
})
