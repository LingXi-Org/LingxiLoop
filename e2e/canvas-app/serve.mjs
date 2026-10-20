import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { readFile } from 'node:fs/promises'
let snapshot, patches, feedback, comments, finishedPatches = 0, dropNext = false, delay = 0, readDelay = 0, steerDelay = 0, finishedSteers = 0
function reset() {
  const now = new Date().toISOString()
  const frame = { id: 'fixture-frame', canvasId: 'fixture-canvas', type: 'markdown', title: '共同笔记', content: '# 旧卡片\n\n需要一起保留的内容。', x: 80, y: 80, width: 560, height: 440, data: {}, revision: 1, createdBy: 'teacher', updatedBy: 'teacher', createdAt: now, updatedAt: now }
  snapshot = { id: 'fixture-canvas', title: '协议验收画布', companyId: 'fixture-company', conversationId: 'fixture-conversation', triggerClientMsgNo: null, goal: '共同编辑', initiatorAgentId: 'teacher', status: 'active', origin: 'fixture', summary: null, createdBy: 'teacher', createdAt: now, updatedAt: now, frames: [frame, { ...frame, id: 'legacy-html', type: 'html', title: '旧网页卡片', x: 700, width: 340, content: '<h1>旧网页内容</h1><script>document.body.innerHTML="UNSAFE SCRIPT RAN"</script>' }], assignments: [{ id: 'assignment', canvasId: 'fixture-canvas', agentId: 'teacher', assignment: '共同编辑', color: '#7257d9', status: 'working', workArea: { x: 0, y: 0, width: 600, height: 500 }, activeFrameId: 'fixture-frame', cursor: null, workId: 'fixture-work', dependsOnAgentIds: [], executionRole: 'specialist', verifiesAssignmentId: null, result: null, error: null, startedAt: now, completedAt: null, updatedAt: now }], presence: [], comments: [], activity: [], reports: [] }
  patches = []; feedback = []; comments = []; finishedPatches = 0; dropNext = false; delay = 0; readDelay = 0; steerDelay = 0; finishedSteers = 0
}
reset()
const fixture = { name: 'canvas-api-fixture', configureServer(server) { server.middlewares.use(async (req, res, next) => {
  const pathname = new URL(req.url, 'http://fixture').pathname
  if (!pathname.startsWith('/api/') && !pathname.startsWith('/__canvas/')) return next()
  const body = await new Promise(resolve => { let text = ''; req.on('data', chunk => text += chunk); req.on('end', () => resolve(text ? JSON.parse(text) : {})) })
  const send = (body, status = 200) => { res.statusCode = status; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(body)) }
  if (pathname === '/__canvas/reset') { reset(); return send({ ok: true }) }
  if (pathname === '/__canvas/evidence') return send({ document: snapshot.frames[0], patches, feedback, comments, finishedPatches, finishedSteers })
  if (pathname === '/__canvas/failure') { dropNext = body.dropNext ?? false; delay = body.delay ?? 0; readDelay = body.readDelay ?? 0; steerDelay = body.steerDelay ?? 0; return send({ ok: true }) }
  if (pathname === '/__canvas/remote') { const frame = snapshot.frames[0]; frame.content = '远端已保存的新版本'; frame.revision++; frame.updatedAt = new Date().toISOString(); return send(frame) }
  if (pathname === '/api/canvases/fixture-canvas') { if (readDelay) await new Promise(resolve => setTimeout(resolve, readDelay)); return send(snapshot) }
  if (pathname === '/api/canvas/frames/fixture-frame' && req.method === 'PATCH') {
    patches.push({ ...body })
    const frame = snapshot.frames[0]
    if (body.baseRevision !== frame.revision) return send({ error: 'revision conflict', latestFrame: frame }, 409)
    frame.content = body.content; frame.revision++; frame.updatedAt = new Date().toISOString()
    const response = structuredClone(frame)
    if (delay) await new Promise(resolve => setTimeout(resolve, delay))
    finishedPatches++
    // Return a failed acknowledgement after committing. A bare socket reset can
    // be transparently retried by Chromium before the application sees it.
    if (dropNext) { dropNext = false; return send({ error: 'simulated acknowledgement loss after commit' }, 503) }
    return send(response)
  }
  if (pathname === '/api/canvas/status') return send(null)
  if (pathname.endsWith('/steer')) { feedback.push(body.text); if (steerDelay) await new Promise(resolve => setTimeout(resolve, steerDelay)); finishedSteers++; return send({ ok: true }) }
  if (pathname === '/api/canvas/comments') { comments.push(body); return send({ id: `comment-${comments.length}`, ...body, createdAt: new Date().toISOString() }) }
  return send({ error: 'fixture route unavailable' }, 404)
}) } }
// Browser-only adversarial probe appended to the real App by this test server.
// No probe or test route is bundled by the product's Vite configuration.
const probe = { name: 'canvas-app-test-probe', enforce: 'pre', async load(id) {
  if (!id.endsWith('/src/features/canvas/mcp-app/editor.js?raw')) return
  const original = await readFile(id.slice(0, -4), 'utf8')
  return `export default ${JSON.stringify(original + '\n' + await readFile('e2e/canvas-app/probe.js', 'utf8'))}`
} }
const server = await createServer({ configFile: false, plugins: [probe, fixture, react()], resolve: { alias: { '@': path.resolve('src') } }, server: { host: '127.0.0.1', port: 5291, strictPort: true }, optimizeDeps: { entries: ['e2e/canvas-app/index.html'] } })
await server.listen()
server.printUrls()
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, async () => { await server.close(); process.exit(0) })
