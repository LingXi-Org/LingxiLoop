import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import dgram from 'node:dgram'

// Public synthetic fixture; no API proxy, credentials, install, or production build.
export default defineConfig({
  plugins: [react(), {
    name: 'case-cover-network-probe',
    configureServer(server) {
      let requests = 0
      let udpPackets = 0
      const udp = dgram.createSocket('udp4')
      let listening = false
      udp.on('listening', () => { listening = true })
      // bind() is also the exclusive free-port check: fail rather than share/reuse.
      udp.on('error', error => { console.error('case-cover UDP probe failed', error.message); void server.close() })
      udp.on('message', () => { udpPackets++ })
      udp.bind(51890, '127.0.0.1', () => console.log('case-cover UDP probe started: 127.0.0.1:51890'))
      let closed = false
      const stop = () => {
        if (closed) return
        closed = true
        console.log('case-cover UDP probe stopping: 127.0.0.1:51890')
        if (listening) udp.close()
      }
      server.httpServer?.once('close', stop)
      process.once('SIGTERM', stop)
      process.once('SIGINT', stop)
      process.once('exit', stop)
      server.middlewares.use((request, response, next) => {
        if (request.url?.startsWith('/cover-network-probe')) {
          requests++; response.setHeader('Content-Type', 'text/html'); response.end('<p>network reached</p>')
        } else if (request.url?.startsWith('/cover-network-count')) {
          response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ requests, udpPackets }))
        } else next()
      })
    },
  }],
  cacheDir: '/tmp/loop-case-cover-vite-cache',
  resolve: { alias: { '@': path.resolve(__dirname, '../src') } },
  optimizeDeps: { entries: ['scripts/case-cover-fixture.html'], include: ['react', 'react-dom/client', 'next-themes', 'zustand'] },
  server: { host: '127.0.0.1', port: 5189, strictPort: true, watch: { ignored: ['**/third_party/**', '**/.e2e/**'] } },
})
