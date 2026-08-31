import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const port = Number(process.env.E2E_PORT ?? 5180)

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, '../src') } },
  server: { host: '127.0.0.1', port, strictPort: true, hmr: false },
})
