import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  publicDir: false,
  cacheDir: '.e2e/chat-layout-vite/node_modules/.vite',
  resolve: { alias: { '@': path.resolve('src') }, dedupe: ['react', 'react-dom', '@assistant-ui/react', '@assistant-ui/store', '@assistant-ui/core'] },
  optimizeDeps: { entries: ['e2e/chat-layout/index.html'] },
  build: { outDir: '.e2e/chat-layout-dist', reportCompressedSize: false, rollupOptions: { input: path.resolve('e2e/chat-layout/index.html') } },
  server: { host: '127.0.0.1', port: 5197, strictPort: true },
})
