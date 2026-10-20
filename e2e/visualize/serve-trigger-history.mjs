import assert from 'node:assert/strict'
import { createServer as createHttpServer } from 'node:http'
import { resolve } from 'node:path'
import { createServer as createViteServer } from 'vite'
import react from '@vitejs/plugin-react'
import { pool, closeDatabasePools } from '../../server/src/db/pool.ts'
import { buildApiTestApp } from '../../server/src/__integration__/_helpers.ts'
import { installRecordingWukong } from '../../server/src/__integration__/_recording-wukong.ts'
import { nativeMessageSchema, nativeText } from '../../src/lib/nativeMessage.ts'
import { visualizeReferences } from '../../server/src/agent-runtime/visualize-projection.ts'

// Read the completed real-provider run from the dedicated local test database.
// Auth and WuKong delivery are explicit fixtures; the stored model HTML is never
// substituted. Production API authorization, document/resource and guest paths run.
const database = new URL(process.env.DATABASE_URL)
assert.equal(database.hostname, '127.0.0.1')
assert.equal(database.pathname, '/lingxiloop_issue213217_test')
const room = (await pool.query("SELECT id,company_id,project_id FROM conversations WHERE id='visualize-trigger-comparison'")).rows[0]
assert.ok(room, 'Run visualize-trigger-live.test.ts against the real provider first')
const rows = (await pool.query("SELECT payload,echo FROM im_send_acceptances WHERE company_id=$1 AND channel_id=$2 AND status='accepted' ORDER BY created_at", [room.company_id, room.id])).rows
const im = await installRecordingWukong()
for (const row of rows) {
  const payload = nativeMessageSchema.parse(row.payload)
  assert.ok(row.echo?.messageId && row.echo?.messageSeq)
  im.messages.push({ ...row.echo, payload })
}
const source = im.messages.find(message => message.payload.role === 'assistant' && message.payload.status.type === 'complete' && visualizeReferences(nativeText(message.payload)).length)
assert.ok(source, 'A delivered complete real-model reference is required')
const path = visualizeReferences(nativeText(source.payload))[0].reference.path
const app = await buildApiTestApp('test-owner')
app.get('/__visualize_live/manifest', (_req, res) => res.json({ companyId: room.company_id, projectId: room.project_id, channelId: room.id, path, sourceMessageId: source.clientMsgNo }))
const api = createHttpServer(app)
await new Promise(resolve => api.listen(5194, '127.0.0.1', resolve))
const vite = await createViteServer({ configFile: false, plugins: [react()], resolve: { alias: { '@': resolve('src') }, dedupe: ['react', 'react-dom', '@assistant-ui/react'] },
  cacheDir: 'node_modules/.vite-213-217-history', optimizeDeps: { entries: ['e2e/visualize/live.html'] },
  server: { host: '127.0.0.1', port: 5195, strictPort: true, hmr: false, watch: { ignored: ['**/*'] }, proxy: { '/api': 'http://127.0.0.1:5194', '/__visualize_live': 'http://127.0.0.1:5194' } } })
await vite.listen()
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, async () => {
  await vite.close(); await new Promise(resolve => api.close(resolve)); await im.close(); await closeDatabasePools(); process.exit(0)
})
