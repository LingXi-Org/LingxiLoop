import { createServer } from 'vite'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const documentPath = path.resolve('src/features/chat/visualize/web/document.ts')
const source = process.env.ISSUE377_DOCUMENT_SOURCE
  ? readFileSync(process.env.ISSUE377_DOCUMENT_SOURCE, 'utf8') : null
process.env.E2E_VISUALIZE_READY = '0'
const server = await createServer({
  configFile: path.resolve('e2e/visualize/vite.config.ts'),
  plugins: [{ name: 'issue377-document-baseline', enforce: 'pre', load(id) {
    if (source && id.split('?')[0] === documentPath) return source
  } }],
})
await server.listen()
await server.transformRequest('/third_party/zcode/upstream/packages/ui/src/styles.css')
await server.transformRequest('/src/styles/globals.css')
process.env.E2E_VISUALIZE_READY = '1'
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => {
  await server.close(); process.exit(0)
})
