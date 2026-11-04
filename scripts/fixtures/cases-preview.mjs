import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'

const server = await createServer({
  root: fileURLToPath(new URL('../../', import.meta.url)),
  server: { host: '127.0.0.1', port: 5205, strictPort: true },
  plugins: [{ name: 'case-fixture-entry', configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      if (/^\/cases(?:\/|\?|$)/.test(req.url ?? '')) req.url = '/scripts/fixtures/cases.html' + ((req.url ?? '').includes('?') ? (req.url ?? '').slice(req.url.indexOf('?')) : '')
      next()
    })
  } }],
})
await server.listen()
server.printUrls()
