import { defineConfig, mergeConfig, type Plugin } from 'vite'
import { resolve } from 'node:path'
import base from './vite.state373.config'

// Same two fixture entrypoints and real product providers, compiled once.
// Preview keeps the same synthetic API middleware and avoids dev module transforms.
const requests: Plugin = {
  name: 'state373-static-http-evidence',
  configurePreviewServer(server) {
    server.middlewares.use((req, res, next) => {
      const path = new URL(req.url ?? '/', 'http://127.0.0.1').pathname
      if (path.startsWith('/assets/') || path.endsWith('.html')) {
        const start = performance.now()
        const log = (event: string) => console.log(JSON.stringify({ event, path, status: res.statusCode,
          contentLength: res.getHeader('content-length'), elapsedMs: Math.round(performance.now() - start) }))
        res.on('finish', () => log('http-finish'))
        res.on('close', () => { if (!res.writableFinished) log('http-aborted') })
      }
      next()
    })
  },
}

export default mergeConfig(base, defineConfig({
  mode: 'questionnaire-test',
  publicDir: false,
  plugins: [requests],
  build: {
    outDir: '.e2e/state373-static-dist',
    emptyOutDir: true,
    sourcemap: false,
    reportCompressedSize: false,
    rollupOptions: { input: {
      conversation: resolve(__dirname, 'answer-first.html'),
      questionnaire: resolve(__dirname, 'questionnaire.html'),
    } },
  },
  preview: { host: '127.0.0.1', port: 53124, strictPort: true },
}))
