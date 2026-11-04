import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'
import { realpathSync } from 'node:fs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const server = await createServer({
  root,
  cacheDir: '.codex-tmp/vite-cases',
  server: { host: '127.0.0.1', port: Number(process.env.CASE_PREVIEW_PORT || 5205), strictPort: true,
    fs: { allow: [root, realpathSync(`${root}/node_modules`)] } },
  plugins: [{ name: 'case-fixture-entry', configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      if (/^\/cases(?:\/|\?|$)/.test(req.url ?? '')) req.url = '/scripts/fixtures/cases.html' + ((req.url ?? '').includes('?') ? (req.url ?? '').slice(req.url.indexOf('?')) : '')
      next()
    })
  } }],
})
await server.listen()
server.printUrls()
