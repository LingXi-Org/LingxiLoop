// Deterministic local fixture for opening the actual Design and Slides editors.
// node --import tsx perf/editor-open/serve.ts <arm source root> <built host> <public port>
// LISTEN_PORT, when set, listens elsewhere (behind a forwarder) than the public
// port in its URLs. Grants are g1, g2, ... so bench.py can name each grant origin
// as secure (the editors need a secure context; this machine's antivirus blocks
// local test certificates).
// The isolated-origin gateway, page asset rewriting, asset responses, CSP
// script policy and editor bytes come from the arm's own source; grants and
// documents are synthetic. Never point at production.
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { extname, resolve } from 'node:path'
import { Readable } from 'node:stream'
import { createServer as createHttpsServer } from 'node:https'
import { createServer as createHttpServer } from 'node:http'
import { pathToFileURL } from 'node:url'
import compression from 'compression'
import express from 'express'

const root = resolve(process.argv[2] ?? '.')
const host = resolve(process.argv[3] ?? '.codex-tmp/editor-host')
const port = Number(process.argv[4] ?? 4410), listen = Number(process.env.LISTEN_PORT ?? port)
const site = 'lingxi-perf.cn'
const protocol = process.env.PERF_TLS === '1' ? 'https' : 'http'
const upstreamPort = protocol === 'https' ? listen + 100 : listen
const appOrigin = `${protocol}://app.${site}:${port}`, editorBase = `${protocol}://artifact.${site}:${port}`
const load = (path: string) => import(pathToFileURL(resolve(root, path)).href)
const { artifactEditorOrigin, isolatedEditor } = await load('shared/artifact-editor-origin.ts')
const { sendEditorAsset, readEditorPreloads } = await load('server/src/modules/artifacts/editor-static.ts')
const { designPageAssets } = await load('server/src/modules/artifacts/design-page.ts')
const slidesPage = existsSync(resolve(root, 'server/src/modules/artifacts/slides-page.ts')) ? await load('server/src/modules/artifacts/slides-page.ts') : null
const { ARTIFACT_KIND_DEFINITIONS } = await load('server/src/modules/artifacts/kinds.ts')
const { EDITOR_DOWNLOAD_SCRIPT } = await load('server/src/modules/artifacts/editor-downloads.ts')
const { canvas, board } = await import(pathToFileURL(resolve('perf/issue-611/fixtures.mjs')).href)
const editors = { design: resolve(process.env.PERF_DESIGN_DIST ?? 'server/assets/design-editor'), slides: resolve(process.env.PERF_SLIDES_DIST ?? 'server/assets/slides-editor') }
const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')

const imageId = '1234567890abcdef1234567890abcdef'
const image = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#426b46"/><circle cx="320" cy="180" r="120" fill="#b8d994"/></svg>')
const order = Array.from({ length: 20 }, (_, index) => `slide-${index + 1}`)
const documents = {
  design: new Map([['project/canvas.json', JSON.stringify(canvas)], ['project/Main.dc.html', board]]),
  slides: new Map<string, string>([
    ['project/deck.json', JSON.stringify({ v: 4, lists: 'css', title: '加载基准稿', order, sections: {}, faces: {}, designSystems: [] })],
    ...order.map((id, index): [string, string] => [`project/slides/${id}.html`, `<section id="${id}" style="background:#faf8f4;padding:80px;display:flex;flex-direction:column;gap:32px"><h1>幻灯片 ${index + 1}</h1><p>固定样稿，用于测量打开时间。</p><img src="/_blob/${imageId}" style="width:640px;height:360px"><aside>第 ${index + 1} 页讲者备注。</aside></section>`]),
  ]),
}
const grants = new Map<string, 'design' | 'slides'>()
let issued = 0
const kindOf = (artifactId: string) => artifactId.startsWith('deck') ? 'slides' as const : 'design' as const

// Mirrors server/src/modules/artifacts/editor-router.ts pageCsp.
function pageCsp(scriptSrc: string, assets: string) {
  const fonts = 'https://fonts.googleapis.com https://fonts.gstatic.com'
  return ['sandbox allow-scripts allow-downloads allow-popups allow-modals', "default-src 'self'", `${scriptSrc} ${assets}`.trim(),
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com ${assets}`.trim(), `font-src 'self' data: https://fonts.gstatic.com ${assets}`.trim(),
    "img-src 'self' data: blob:", "media-src 'self' blob:", "worker-src 'self' blob:", `connect-src 'self' data: blob: ${fonts} ${slidesPage ? assets : ''}`.trim(),
    "frame-src 'self' blob: data:", "object-src 'none'", "base-uri 'self'", "form-action 'none'"].join('; ')
}

const app = express()
app.use(compression({ filter: (req, res) => !String(res.getHeader('Content-Type')).includes('event-stream') && !/\/(design|slides)-assets\//.test(req.path) && compression.filter(req, res) }))
app.use((req, res, next) => {
  if (!(req.headers.host ?? '').endsWith(`-artifact.${site}:${port}`)) return next()
  void (async () => {
    const headers = new Headers()
    for (const [key, value] of Object.entries(req.headers)) if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(', ') : value)
    // Node fetch decompresses upstream bodies; the outer middleware compresses again.
    headers.set('accept-encoding', 'identity')
    const reply = await isolatedEditor(new Request(`${protocol}://${req.headers.host}${req.originalUrl}`, { method: req.method, headers }), editorBase, `http://127.0.0.1:${upstreamPort}`)
    if (!reply) return next()
    res.status(reply.status)
    reply.headers.forEach((value: string, key: string) => { if (!['content-length', 'content-encoding', 'transfer-encoding', 'connection', 'keep-alive'].includes(key)) res.setHeader(key, value) })
    // A held event stream ends with the hop's body timeout; end that response only.
    if (reply.body) Readable.fromWeb(reply.body as import('node:stream/web').ReadableStream).on('error', () => res.destroy()).pipe(res)
    else res.end()
  })().catch(next)
})
app.use(/^\/(artifact-editor|_blob)/, (req, res, next) => {
  res.set({ 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type,last-event-id', 'Cross-Origin-Resource-Policy': 'cross-origin' })
  if (req.method === 'OPTIONS') res.sendStatus(204); else next()
})
app.post('/api/artifacts/:id/editor-grant', async (req, res) => {
  const kind = kindOf(req.params.id), grant = `g${++issued}`
  grants.set(grant, kind)
  const isolatedUrl = `${await artifactEditorOrigin(grant, editorBase)}/artifact-editor/${kind}/${grant}/`
  // The arm's own response shape: before this change Slides had no isolated URL.
  res.json(slidesPage ? { url: kind === 'design' ? isolatedUrl : `/artifact-editor/slides/${grant}/`, isolatedUrl, expiresAt: Date.now() + 3_600_000, write: true }
    : { url: kind === 'design' ? isolatedUrl : `/artifact-editor/slides/${grant}/`, expiresAt: Date.now() + 3_600_000, write: true })
})
app.get('/artifact-editor/preload.json', async (_req, res, next) => {
  if (!readEditorPreloads) { res.sendStatus(404); return }
  try {
    res.set('Cache-Control', 'public, max-age=300').json({ design: await readEditorPreloads(editors.design, 'design', appOrigin), slides: await readEditorPreloads(editors.slides, 'slides', appOrigin) })
  } catch (error) { next(error) }
})
app.get(/^\/artifact-editor\/(design|slides)-assets\/([\w-]+\.(js|css|woff2))$/, async (req, res, next) => {
  try {
    const [, kind, name, ext] = /^\/artifact-editor\/(design|slides)-assets\/([\w-]+\.(js|css|woff2))$/.exec(req.path)!
    const file = resolve(editors[kind as 'design' | 'slides'], 'assets', name)
    if (!existsSync(file)) { res.sendStatus(404); return }
    if (ext === 'woff2') { res.set({ 'Cache-Control': `${slidesPage ? 'public' : 'private'}, max-age=31536000, immutable`, 'Content-Type': 'font/woff2' }).send(await readFile(file)); return }
    await sendEditorAsset(req, res, file, ext === 'js' ? 'text/javascript; charset=utf-8' : 'text/css; charset=utf-8', true, ...(slidesPage ? ['public'] : []))
  } catch (error) { next(error) }
})
app.get('/_blob/:id', (req, res) => { if (req.params.id === imageId) res.type('svg').set('Cache-Control', 'private, max-age=31536000, immutable').send(image); else res.sendStatus(404) })
app.use('/artifact-editor/:kind/:grant', express.json({ limit: '16mb' }), (req, res, next) => {
  const kind = grants.get(req.params.grant)
  if (!kind || kind !== req.params.kind) { res.sendStatus(404); return }
  const files = documents[kind], path = decodeURIComponent(req.path.slice(1))
  res.set('Cache-Control', 'no-store')
  if (path === '__deck/session') { res.json({ canEdit: true }); return }
  if (path === '_files.json') { res.json({ ver: 'fixed', files: Object.fromEntries([...files].map(([name, value]) => [name, { sha256: sha(value), size: Buffer.byteLength(value), contentType: name.endsWith('.json') ? 'application/json' : 'text/html' }])) }); return }
  if (path.endsWith('events')) { res.set('Content-Type', 'text/event-stream'); res.write(': connected\n\n'); return }
  if (path === '__comments') { res.json({ threads: [], agent: { available: false, listening: false, busy: false, hook: false }, me: { name: '基准测试' } }); return }
  if (path === `_blob/${imageId}`) { res.type('svg').send(image); return }
  if (files.has(path)) { res.type(path.endsWith('.json') ? 'json' : 'html').send(files.get(path)); return }
  void (async () => {
    if (path.includes('..') || path.startsWith('project/')) { res.sendStatus(404); return }
    const file = resolve(editors[kind], path || 'index.html')
    if (!existsSync(file)) { res.sendStatus(404); return }
    if (file.endsWith('.html')) {
      const raw = await readFile(file, 'utf8')
      const page = kind === 'design' ? designPageAssets(raw, appOrigin) : slidesPage ? slidesPage.slidesPageAssets(raw, appOrigin) : { html: raw, source: '' }
      const html = page.html.replace('</head>', `<script>${EDITOR_DOWNLOAD_SCRIPT}</script></head>`)
      res.set({ 'Content-Security-Policy': pageCsp(ARTIFACT_KIND_DEFINITIONS[kind].pageScriptSrc(html), page.source), 'Cache-Control': 'no-cache' }).type('html').send(html)
      return
    }
    const type = ({ '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' } as Record<string, string>)[extname(file)] ?? 'application/octet-stream'
    res.set('Cache-Control', 'no-cache').type(type).send(await readFile(file))
  })().catch(next)
})
app.use(express.static(host))
app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => { console.error(error); res.status(500).send(error.name) })
// HTTPS lets the real browser negotiate Brotli and use secure editor APIs.
// Only explicit fixture certificates are accepted; no product trust is changed.
const server = protocol === 'https' ? createHttpsServer({
  key: await readFile(process.env.PERF_TLS_KEY!), cert: await readFile(process.env.PERF_TLS_CERT!),
}, app) : createHttpServer(app)
if (protocol === 'https') app.listen(upstreamPort, '127.0.0.1')
server.listen(listen, '127.0.0.1', () => console.log(JSON.stringify({ port, listen, protocol, root, host, isolatedSlides: Boolean(slidesPage), preload: Boolean(readEditorPreloads) })))
// Idle sockets stay open past the delayed link, so a reused one is never closed mid-request.
server.keepAliveTimeout = 120_000
