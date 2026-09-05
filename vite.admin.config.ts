import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

const HTTP_TARGET = process.env.LINGXILOOP_DEV_API_TARGET || 'http://localhost:5181'

export default defineConfig({
  root: path.resolve(__dirname, 'admin'),
  envDir: __dirname,
  plugins: [react()],
  publicDir: path.resolve(__dirname, 'admin/public'),
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@admin': path.resolve(__dirname, 'admin/src'),
    },
  },
  build: {
    outDir: path.resolve(__dirname, 'dist-admin'),
    emptyOutDir: true,
  },
  server: {
    host: true,
    proxy: { '/api': { target: HTTP_TARGET, changeOrigin: true, secure: false } },
  },
})
