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
const { sendEditorAsset, readEditorPreloads, retainedEditorAsset } = await load('server/src/modules/artifacts/editor-static.ts')
const { designPageAssets } = await load('server/src/modules/artifacts/design-page.ts')
const slidesPage = existsSync(resolve(root, 'server/src/modules/artifacts/slides-page.ts')) ? await load('server/src/modules/artifacts/slides-page.ts') : null
const { ARTIFACT_KIND_DEFINITIONS } = await load('server/src/modules/artifacts/kinds.ts')
const { EDITOR_DOWNLOAD_SCRIPT } = await load('server/src/modules/artifacts/editor-downloads.ts')
const { canvas, board } = await import(pathToFileURL(resolve('perf/issue-611/fixtures.mjs')).href)
const editors = { design: resolve(process.env.PERF_DESIGN_DIST ?? 'server/assets/design-editor'), slides: resolve(process.env.PERF_SLIDES_DIST ?? 'server/assets/slides-editor') }
const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')

const imageId = '1234567890abcdef1234567890abcdef'
const image = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#426b46"/><circle cx="320" cy="180" r="120" fill="#b8d994"/></svg>')
const mathFixture = process.env.PERF_MATH_FIXTURE === '1'
const failedFeatures = new Set<string>()
const failFeatures = (process.env.PERF_FAIL_FEATURES ?? '').split(',').filter(value => ['math', 'templates', 'presentation', 'properties', 'exports', 'pptx-library', 'woff2-decoder'].includes(value))
const order = Array.from({ length: mathFixture || process.env.PERF_FONT_FIXTURE === '1' ? 3 : 20 }, (_, index) => `slide-${index + 1}`)
const documents = {
  design: new Map([['project/canvas.json', JSON.stringify(canvas)], ['project/Main.dc.html', board]]),
  slides: new Map<string, string>([
    ['project/deck.json', JSON.stringify({ v: 4, lists: 'css', title: '加载基准稿', order, sections: {}, faces: {}, designSystems: [] })],
    ...order.map((id, index): [string, string] => [`project/slides/${id}.html`, `<section id="${id}" style="background:#faf8f4;padding:80px;display:flex;flex-direction:column;gap:32px"><h1>幻灯片 ${index + 1}</h1><p>固定样稿，用于测量打开时间。</p>${mathFixture && index === 0 ? String.raw`<p>\(x^2\)</p>` : ''}<img src="/_blob/${imageId}" style="width:640px;height:360px"><aside>第 ${index + 1} 页讲者备注。</aside></section>`]),
  ]),
}
if (process.env.PERF_COMPONENT_FIXTURE === '1') {
  const componentCanvas = structuredClone(canvas)
  Object.assign(componentCanvas.boards, { 'Card.dc.html': { x: 900, y: 0, w: 360, h: 180 } })
  componentCanvas.order.push('Card.dc.html')
  documents.design.set('project/canvas.json', JSON.stringify(componentCanvas))
  documents.design.set('project/Main.dc.html', board.replace('</div></x-dc>', '<dc-import name="Card" hint-size="360px,180px"></dc-import></div></x-dc>'))
  documents.design.set('project/Card.dc.html', '<html><head><script src="./support.js"></script></head><body><x-dc><div style="width:360px;height:180px;background:#fef3c7;padding:16px"><h2>Reusable card original</h2><button onClick="{{ increment }}">Increment child</button><output>{{ count }}</output></div></x-dc><script type="text/x-dc" data-dc-script>class Component extends DCLogic { state = {count: 0}; renderVals() { return {count: this.state.count, increment: () => this.setState({count: this.state.count + 1})}; } }</script></body></html>')
}
if (process.env.PERF_TYPED_COMPONENT_FIXTURE === '1') {
  const typedCanvas = structuredClone(canvas)
  typedCanvas.designSystems.push({ title: 'Typed fixture', namespace: 'fixture', artifact: 'https://claude.ai/artifact/typed-fixture', version: null, copiedAt: '2026-11-03T00:00:00.000Z' })
  documents.design.set('project/canvas.json', JSON.stringify(typedCanvas))
  documents.design.set('project/Main.dc.html', board.replace('</head>', '<script src="ds/fixture/bundle.js"></script></head>').replace('</div></x-dc>', '<x-import component-from-global-scope="Fixture.Button" variant="primary">Typed fixture button</x-import></div></x-dc>'))
  documents.design.set('project/ds/fixture/bundle.js', 'window.Fixture={Button:function Button(props){return React.createElement("button",{"data-variant":props.variant,disabled:props.disabled,style:{padding:"12px",background:props.variant==="primary"?"#bfdbfe":"#ddd"}},props.children)}};')
  documents.design.set('project/ds/fixture/fixture.d.ts', 'export interface ButtonProps { variant?: "primary" | "secondary"; disabled?: boolean; children?: React.ReactNode; } export declare function Button(props: ButtonProps): React.ReactElement;')
}
if (process.env.PERF_THEME_FIXTURE === '1') {
  const metadata = JSON.parse(documents.slides.get('project/deck.json')!)
  const styled = ARTIFACT_KIND_DEFINITIONS.slides.initialIndex(metadata.title, '2026-11-03T00:00:00.000Z')
  documents.slides.set('project/deck.json', JSON.stringify({ ...styled, order: metadata.order }))
  for (const [path, tokens] of Object.entries(ARTIFACT_KIND_DEFINITIONS.slides.initialResources ?? {}))
    documents.slides.set(path, JSON.stringify(tokens))
}
if (process.env.PERF_FONT_FIXTURE === '1') {
  const metadata = JSON.parse(documents.slides.get('project/deck.json')!)
  metadata.faces = { 'dm-sans': { family: 'DM Sans', href: 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400&display=swap' } }
  documents.slides.set('project/deck.json', JSON.stringify(metadata))
  for (const [path, text] of documents.slides)
    if (path.startsWith('project/slides/')) documents.slides.set(path, text.replace(/<h1>[^<]+<\/h1>/, '<h1 style="font-family:\'DM Sans\',sans-serif;font-weight:400">Font export original 123</h1>'))
}
const grants = new Map<string, 'design' | 'slides'>()
// Explicit, loopback-only recovery fixture. Ordinary performance documents keep
// their fixed read-only backing store and cannot take this control path.
const recoveryFixture = process.env.PERF_RECOVERY_FIXTURE === '1'
const initialDocuments = { design: new Map(documents.design), slides: new Map(documents.slides) }
const access = { read: true, write: true, failPublish: true, shortGrants: false }
const grantAccess = new Map<string, { expiresAt: number; write: boolean }>()
let publishes = 0, refusedPublishes = 0
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
    const reply = await isolatedEditor(new Request(`${protocol}://${req.headers.host}${req.originalUrl}`, { method: req.method, headers,
      ...(!['GET', 'HEAD'].includes(req.method) ? { body: Readable.toWeb(req) as ReadableStream<Uint8Array>, duplex: 'half' } : {}),
    }), editorBase, `http://127.0.0.1:${upstreamPort}`)
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
  if (recoveryFixture && !access.read) { res.status(403).json({ code: 'forbidden' });return }
  const kind = kindOf(req.params.id), grant = `g${++issued}`
  grants.set(grant, kind)
  const isolatedUrl = `${await artifactEditorOrigin(grant, editorBase)}/artifact-editor/${kind}/${grant}/`
  const expiresAt = Date.now() + (recoveryFixture && access.shortGrants ? 12_000 : 3_600_000), write = !recoveryFixture || access.write
  grantAccess.set(grant, { expiresAt, write })
  // The arm's own response shape: before this change Slides had no isolated URL.
  res.json(slidesPage ? { url: kind === 'design' ? isolatedUrl : `/artifact-editor/slides/${grant}/`, isolatedUrl, expiresAt, write }
    : { url: kind === 'design' ? isolatedUrl : `/artifact-editor/slides/${grant}/`, expiresAt, write })
})
if (recoveryFixture) {
  app.post('/fixture/access', express.json({ limit: '4kb' }), (req, res) => {
    if (req.body.reset === true) {
      for (const kind of ['design', 'slides'] as const) { documents[kind].clear();for (const [name, text] of initialDocuments[kind]) documents[kind].set(name, text) }
      grants.clear();grantAccess.clear();publishes = 0;refusedPublishes = 0
      failedFeatures.clear()
    }
    for (const key of ['read', 'write', 'failPublish', 'shortGrants'] as const) if (typeof req.body[key] === 'boolean') access[key] = req.body[key]
    res.json({ ...access })
  })
  app.get('/fixture/state', (_req, res) => { res.json({ publishes, refusedPublishes, files: Object.fromEntries(Object.entries(documents).map(([kind, files]) => [kind, Object.fromEntries(files)])) }) })
}
app.get('/artifact-editor/preload.json', async (_req, res, next) => {
  if (!readEditorPreloads) { res.sendStatus(404); return }
  try {
    res.set('Cache-Control', 'public, max-age=300').json({ design: await readEditorPreloads(editors.design, 'design', appOrigin), slides: await readEditorPreloads(editors.slides, 'slides', appOrigin) })
  } catch (error) { next(error) }
})
app.get(/^\/artifact-editor\/(design|slides)-assets\/([\w-]+\.(js|css|woff2))$/, async (req, res, next) => {
  try {
    const [, kind, name, ext] = /^\/artifact-editor\/(design|slides)-assets\/([\w-]+\.(js|css|woff2))$/.exec(req.path)!
    for (const feature of failFeatures) {
      if (kind === 'slides' && name.startsWith(feature + '-') && !failedFeatures.has(feature)) {
        failedFeatures.add(feature)
        res.set('Cache-Control', 'no-store').status(503).send('Synthetic first-use failure'); return
      }
    }
    if (kind === 'design' && (process.env.PERF_FAIL_DESIGN_PROGRAMS || process.env.PERF_FAIL_DESIGN_OPTIONAL || process.env.PERF_DESIGN_PROGRAM_DELAY_MS)) {
      const manifest = JSON.parse(await readFile(resolve(editors.design, 'manifest.json'), 'utf8'))
      const optional = Object.entries(manifest.optionalPrograms ?? {}).find(([, value]) => (value as { file: string }).file === name)?.[0]
      if (optional && (process.env.PERF_FAIL_DESIGN_OPTIONAL ?? '').split(',').includes(optional) && !failedFeatures.has('design:' + optional)) {
        failedFeatures.add('design:' + optional);res.set('Cache-Control', 'no-store').status(503).send('Synthetic optional-program failure');return
      }
      const program = Object.entries(manifest.startupPrograms ?? {}).find(([, value]) => (value as { file: string }).file === name)?.[0]
      if (program && (process.env.PERF_FAIL_DESIGN_PROGRAMS ?? '').split(',').includes(program) && !failedFeatures.has('design:' + program)) {
        failedFeatures.add('design:' + program);res.set('Cache-Control', 'no-store').status(503).send('Synthetic required-program failure');return
      }
      if (program === 'support' && Number(process.env.PERF_DESIGN_PROGRAM_DELAY_MS) > 0)
        await new Promise(resolve => setTimeout(resolve, Number(process.env.PERF_DESIGN_PROGRAM_DELAY_MS)))
    }
    let file = resolve(editors[kind as 'design' | 'slides'], 'assets', name)
    if (!existsSync(file)) {
      const previous = process.env.PERF_RETAINED_EDITOR_ROOT && retainedEditorAsset ? await retainedEditorAsset(kind, name, resolve(process.env.PERF_RETAINED_EDITOR_ROOT)) : null
      if (!previous) { res.sendStatus(404); return }
      file = previous
    }
    if (ext === 'woff2') { res.set({ 'Cache-Control': `${slidesPage ? 'public' : 'private'}, max-age=31536000, immutable`, 'Content-Type': 'font/woff2' }).send(await readFile(file)); return }
    await sendEditorAsset(req, res, file, ext === 'js' ? 'text/javascript; charset=utf-8' : 'text/css; charset=utf-8', true, ...(slidesPage ? ['public'] : []))
  } catch (error) { next(error) }
})
app.get('/_blob/:id', (req, res) => { if (req.params.id === imageId) res.type('svg').set('Cache-Control', 'private, max-age=31536000, immutable').send(image); else res.sendStatus(404) })
app.use('/artifact-editor/:kind/:grant', express.json({ limit: '16mb' }), (req, res, next) => {
  const kind = grants.get(req.params.grant)
  if (!kind || kind !== req.params.kind) { res.sendStatus(404); return }
  const grant = grantAccess.get(req.params.grant)!
  if (recoveryFixture && (!access.read || grant.expiresAt <= Date.now())) { res.sendStatus(404);return }
  const files = documents[kind], path = decodeURIComponent(req.path.slice(1))
  res.set('Cache-Control', 'no-store')
  if (path === '__deck/session') { res.json({ canEdit: !recoveryFixture || access.write && grant.write }); return }
  if (recoveryFixture && path === '__deck/publish' && req.method === 'POST') {
    if (!access.write || !grant.write) { refusedPublishes++;res.status(403).json({ code: 'not_writer' });return }
    if (access.failPublish) { refusedPublishes++;res.status(503).json({ code: 'upstream_error' });return }
    const batch = req.body.files
    if (!batch || typeof batch !== 'object' || Object.entries(batch).some(([name, entry]) => !name.startsWith('project/') || name.includes('..') || entry && typeof entry === 'object' && 'ifMatch' in entry && entry.ifMatch !== (files.has(name) ? sha(files.get(name)!) : null))) { res.status(409).json({ code: 'conflict' });return }
    const shas: Record<string, string> = {}
    for (const [name, entry] of Object.entries(batch) as Array<[string, { delete?: boolean; base64?: string } | null]>) {
      if (entry === null || entry.delete) files.delete(name)
      else { const text = Buffer.from(entry.base64 ?? '', 'base64').toString('utf8');files.set(name, text);shas[name] = sha(text) }
    }
    publishes++;res.json({ version: `recovery-${publishes}`, shas });return
  }
  if (recoveryFixture && kind === 'slides' && path.startsWith('project/slides/') && path !== 'project/slides/slide-1.html' && Number(process.env.PERF_LATER_SLIDES_DELAY_MS) > 0) {
    setTimeout(() => { if (!access.read || grant.expiresAt <= Date.now()) res.sendStatus(403);else res.type('text/html').send(files.get(path)) }, Number(process.env.PERF_LATER_SLIDES_DELAY_MS));return
  }
  const fileType = (path: string) => ({ '.json': 'application/json', '.js': 'text/javascript', '.ts': 'text/plain', '.css': 'text/css' } as Record<string, string>)[extname(path)] ?? 'text/html'
  if (path === '_files.json') { res.json({ ver: 'fixed', files: Object.fromEntries([...files].map(([name, value]) => [name, { sha256: sha(value), size: Buffer.byteLength(value), contentType: fileType(name) }])) }); return }
  if (path.endsWith('events')) { res.set('Content-Type', 'text/event-stream'); res.write(': connected\n\n'); return }
  if (path === '__comments') { res.json({ threads: [], agent: { available: false, listening: false, busy: false, hook: false }, me: { name: '基准测试' } }); return }
  if (path === `_blob/${imageId}`) { res.type('svg').send(image); return }
  if (files.has(path)) { res.type(fileType(path)).send(files.get(path)); return }
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
