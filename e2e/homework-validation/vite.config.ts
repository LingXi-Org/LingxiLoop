import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()], resolve: { alias: { '@': path.resolve('src') } }, envDir: path.resolve('e2e/homework-validation/.empty-env'),
  cacheDir: '/tmp/lingxiloop-424-homework-vite',
  optimizeDeps: { entries: ['e2e/homework-validation/index.html'] },
  server: { host: '127.0.0.1', port: 5194, strictPort: true },
})
