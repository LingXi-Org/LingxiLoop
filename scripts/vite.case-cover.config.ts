import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// Public synthetic fixture; no API proxy, credentials, install, or production build.
export default defineConfig({
  plugins: [react(), {
    name: 'case-cover-network-probe',
    configureServer(server) {
      let requests = 0
      server.middlewares.use((request, response, next) => {
        if (request.url?.startsWith('/cover-network-probe')) {
          requests++; response.setHeader('Content-Type', 'text/html'); response.end('<p>network reached</p>')
        } else if (request.url?.startsWith('/cover-network-count')) {
          response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ requests }))
        } else next()
      })
    },
  }],
  cacheDir: '/tmp/loop-case-cover-vite-cache',
  resolve: { alias: { '@': path.resolve(__dirname, '../src') } },
  optimizeDeps: { entries: ['scripts/case-cover-fixture.html'], include: ['react', 'react-dom/client', 'next-themes', 'zustand'] },
  server: { host: '127.0.0.1', port: 5189, strictPort: true, watch: { ignored: ['**/third_party/**', '**/.e2e/**'] } },
})
