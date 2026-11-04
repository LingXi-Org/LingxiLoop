// Deterministic HTTP fixture. API replies are synthetic; UI/runtime bytes and
// isolated-editor gateway are the actual product. Never point at production.
import express from 'express'
import compression from 'compression'
import { createHash, randomUUID } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { resolve, extname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Readable } from 'node:stream'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest, createServer } from 'node:https'
import { canvas, board } from './fixtures.mjs'
const root = resolve(process.argv[2] ?? '.')
const web = resolve(process.argv[3] ?? '/tmp/issue-611-a')
const port = Number(process.argv[4] ?? 4191)
const tls = process.env.PERF_TLS === '1'
const appOrigin = tls ? `https://app.loop.test:${port}` : `http://127.0.0.1:${port}`
const editorBase = tls ? `https://artifact.loop.test:${port}` : `http://artifact.localhost:${port}`
const localOrigin = `${tls ? 'https' : 'http'}://127.0.0.1:${port}`
const { artifactEditorOrigin, isolatedEditor } = await import(pathToFileURL(resolve(root, 'shared/artifact-editor-origin.ts')).href)
const { sendEditorAsset } = await import(pathToFileURL(resolve(root, 'server/src/modules/artifacts/editor-static.ts')).href)
const sha = (x: string | Buffer) => createHash('sha256').update(x).digest('hex')
const editor = process.env.PERF_DESIGN_DIST ? resolve(process.env.PERF_DESIGN_DIST) : resolve(root, 'third_party/baoyu-design/upstream/claude-design/scripts/editor')
const files = new Map<string, string>([['project/canvas.json', JSON.stringify(canvas)], ['project/Main.dc.html', board]])
// Optional local exported-project copy for focused artwork regressions (#612).
// This fixture never reads a production artifact store.
if (process.env.PERF_PROJECT_DIR) {
  files.clear()
  const directory = resolve(process.env.PERF_PROJECT_DIR)
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isFile()) files.set(`project/${entry.name}`, await readFile(resolve(directory, entry.name), 'utf8'))
  }
}
const initialFiles = new Map(files)
const grants = new Map<string, string>()
const documents = new Map<string, Map<string, string>>()
const rawFetch = async (input: Request) => new Promise<Response>((resolveResponse,reject) => {
  const headers=Object.fromEntries(input.headers)
  const request=(tls ? httpsRequest : httpRequest)(input.url,{method:input.method,headers,...(tls ? {rejectUnauthorized:false} : {})},incoming=>{
    const output=new Headers()
    for(const [key,value] of Object.entries(incoming.headers))if(value)output.set(key,Array.isArray(value)?value.join(', '):value)
    resolveResponse(new Response(input.method==='HEAD'?null:Readable.toWeb(incoming) as ReadableStream<Uint8Array>,{status:incoming.statusCode,headers:output}))
  })
  request.on('error',reject)
  if(input.body)Readable.fromWeb(input.body as import('node:stream/web').ReadableStream).pipe(request)
  else request.end()
})
const app = express()
app.use((req, res, next) => {
  if (!(req.headers.host ?? '').includes(tls ? '-artifact.loop.test' : '-artifact.localhost')) return next()
  void (async () => {
    const reply = await isolatedEditor(new Request(`${tls ? 'https' : 'http'}://${req.headers.host}${req.originalUrl}`, { method: req.method, headers: req.headers as Record<string,string>,
      ...(!['GET','HEAD'].includes(req.method) ? { body: Readable.toWeb(req), duplex:'half' } : {}) }), editorBase, localOrigin, rawFetch)
    if (!reply) return next()
    res.status(reply.status)
    reply.headers.forEach((v: string,k: string) => { res.setHeader(k,v) })
    if(reply.body)Readable.fromWeb(reply.body as import('node:stream/web').ReadableStream).pipe(res)
    else res.end()
  })().catch(next)
})
app.use(compression({ filter: (req,res) => !String(res.getHeader('Content-Type')).includes('event-stream') && compression.filter(req,res) }))
app.use(express.json({limit:'16mb'}))
app.post('/__fixture/reset', (_req,res)=>{grants.clear();documents.clear();files.clear();for(const [name,text] of initialFiles)files.set(name,text);res.json({ok:true})})
app.get('/__fixture/documents', (_req,res)=>res.json(Object.fromEntries([...documents].map(([id,entries])=>[id,Object.fromEntries(entries)]))))
app.post('/__fixture/content', (req,res)=>{ if(req.body.replaceFiles===true)files.clear();if(req.body.files)for(const [name,text] of Object.entries(req.body.files))if(typeof text==='string')files.set(name,text);if(req.body.canvas)files.set('project/canvas.json',JSON.stringify(req.body.canvas));if(typeof req.body.board==='string')files.set('project/Main.dc.html',req.body.board);res.json({ok:true}) })
app.use((req,res,next)=>{res.set({'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*'});if(req.method==='OPTIONS')res.sendStatus(204);else next()})
app.post('/api/artifacts/:id/editor-grant', async (req,res)=>{
  const grant = randomUUID(); grants.set(grant,req.params.id)
  if(!documents.has(req.params.id))documents.set(req.params.id,new Map(files))
  res.json({url: `${await artifactEditorOrigin(grant, editorBase)}/artifact-editor/design/${grant}/`, write:true})
})
app.get(/^\/artifact-editor\/design-assets\/(design-[a-f0-9]{64}\.(?:js|css|woff2))$/, async (req,res,next)=>{
  try {
    const name=req.path.split('/').at(-1)!, file=resolve(editor,'assets',name)
    const type=name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'font/woff2'
    if (!name.endsWith('.woff2')) await sendEditorAsset(req,res,file,type,true)
    else res.set('Cache-Control','private,max-age=31536000,immutable').type(type).send(await readFile(file))
  } catch(error) {next(error)}
})
app.use('/artifact-editor/design/:grant', (req,res,next)=>{
  if (!grants.has(req.params.grant)) {res.sendStatus(404);return}
  const files = documents.get(grants.get(req.params.grant)!)!
  const path = decodeURIComponent(req.path.slice(1))
  res.set('Cache-Control','no-store')
  if (path === '__deck/session') {res.json({canEdit:true});return}
  if (path === '_files.json') {res.json({ver:'fixed',files:Object.fromEntries([...files].map(([name,value])=>[name,{sha256:sha(value),size:Buffer.byteLength(value),contentType:name.endsWith('.json')?'application/json':'text/html'}]))});return}
  if (path === '__deck/events' || path === '__comments/events') {res.set('Content-Type','text/event-stream');res.write(': connected\n\n');return}
  if (path === '__comments') {res.json({threads:[],agent:{available:false,listening:false,busy:false,hook:false},me:{name:'Performance fixture'}});return}
  if (path === '__deck/publish') {
    const shas: Record<string,string> = {}
    for(const [name,entry] of Object.entries(req.body.files) as [string,{base64:string;ifMatch?:string}][]) {
      if(entry.ifMatch && sha(files.get(name)??'') !== entry.ifMatch){res.status(409).json({code:'conflict'});return}
      const text=Buffer.from(entry.base64,'base64').toString();files.set(name,text);shas[name]=sha(text)
    }
    res.json({version:'saved',shas});return
  }
  if(files.has(path)){res.type(path.endsWith('.json')?'json':'html').send(files.get(path));return}
  void (async()=>{
    if (path.includes('..') || path.startsWith('project/')) {res.sendStatus(404);return}
    const file=resolve(editor,path||'index.html')
    if (file.endsWith('.html')) {
      let html=await readFile(file,'utf8'), assetSource=''
      if(html.includes('__LINGXI_DESIGN_ASSET_ORIGIN__')) {
        const {designPageAssets}=await import(pathToFileURL(resolve(root,'server/src/modules/artifacts/design-page.ts')).href)
        const page=designPageAssets(html,appOrigin);html=page.html;assetSource=page.source
      }
      res.set({'Content-Security-Policy':`sandbox allow-scripts allow-downloads allow-popups allow-modals; default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: ${assetSource}; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com ${assetSource}; font-src 'self' data: https://fonts.gstatic.com ${assetSource}; img-src 'self' data: blob:; connect-src 'self' data: blob: https://fonts.googleapis.com https://fonts.gstatic.com; frame-src 'self' blob: data:; object-src 'none'; base-uri 'self'; form-action 'none'`,'Cache-Control':'no-cache'})
      if (process.env.PERF624_OPTIONAL_BEACON === '1') html = html.replace('</head>', '<script>setTimeout(function(){var s=document.createElement("script");s.src="https://static.cloudflareinsights.com/beacon.min.js";document.head.appendChild(s)},1000)</script></head>')
      res.type('html').send(html);return
    }
    const type = ({'.js':'text/javascript','.css':'text/css','.woff2':'font/woff2'} as Record<string,string>)[extname(file)]??'application/octet-stream'
    if (process.env.PERF_DESIGN_DIST && ['.js','.css'].includes(extname(file))) {await sendEditorAsset(req,res,file,type,path.startsWith('assets/')||/^artifact-type\/dc-runtime-[a-f0-9]{64}\.js$/.test(path));return}
    res.set('Cache-Control',path.startsWith('assets/')?'private, max-age=31536000, immutable':'no-cache').type(type).send(await readFile(file))
  })().catch(next)
})
app.use(express.static(web))
app.get('/', (_req,res)=>res.sendFile(resolve(web,'perf/issue-611/index.html'), { dotfiles: 'allow' }))
app.use((error: Error,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{console.error(error.message);res.status(500).send(error.name)})
const server = tls ? createServer({key:await readFile(process.env.PERF_TLS_KEY ?? '/tmp/611-fixture-key.pem'),cert:await readFile(process.env.PERF_TLS_CERT ?? '/tmp/611-fixture-cert.pem')},app) : app
server.listen(port,'0.0.0.0',()=>console.log(JSON.stringify({port,root,editor,fixtureHashes:{canvas:sha(JSON.stringify(canvas)),board:sha(board)}})))
