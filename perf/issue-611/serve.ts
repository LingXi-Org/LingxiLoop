// Deterministic HTTP fixture. API replies are synthetic; UI/runtime bytes and
// isolated-editor gateway are the actual product. Never point at production.
import express from 'express'
import compression from 'compression'
import { createHash, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve, extname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Readable } from 'node:stream'
import { request as httpRequest } from 'node:http'
import { canvas, board, visualization } from './fixtures.mjs'
const root = resolve(process.argv[2] ?? '.')
const web = resolve(process.argv[3] ?? '/tmp/issue-611-a')
const port = Number(process.argv[4] ?? 4191)
const { artifactEditorOrigin, isolatedEditor } = await import(pathToFileURL(resolve(root, 'shared/artifact-editor-origin.ts')).href)
const { VISUALIZE_PUBLIC_RESOURCES, visualizeResourceFile, visualizeResourceUrl } = await import(pathToFileURL(resolve(root, 'shared/visualize-public-resources.ts')).href)
const { sendEditorAsset } = await import(pathToFileURL(resolve(root, 'server/src/modules/artifacts/editor-static.ts')).href)
const sha = (x: string | Buffer) => createHash('sha256').update(x).digest('hex')
const resources = Object.fromEntries(await Promise.all(VISUALIZE_PUBLIC_RESOURCES.map(async (name: string) => [name, await readFile(resolve(root, visualizeResourceFile(name)))])))
const hashes = Object.fromEntries(Object.entries(resources).map(([name, bytes]) => [name, sha(bytes as Buffer)]))
const editor = process.env.PERF_DESIGN_DIST ? resolve(process.env.PERF_DESIGN_DIST) : resolve(root, 'third_party/baoyu-design/upstream/claude-design/scripts/editor')
const files = new Map<string, string>([['project/canvas.json', JSON.stringify(canvas)], ['project/Main.dc.html', board]])
const states = new Map<string, { state: unknown; revision: number }>()
const grants = new Set<string>()
const rawFetch = async (input: Request) => new Promise<Response>((resolveResponse,reject) => {
  const headers=Object.fromEntries(input.headers)
  const request=httpRequest(input.url,{method:input.method,headers},incoming=>{
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
  if (!(req.headers.host ?? '').includes('-artifact.localhost')) return next()
  void (async () => {
    const reply = await isolatedEditor(new Request(`http://${req.headers.host}${req.originalUrl}`, { method: req.method, headers: req.headers as Record<string,string>,
      ...(!['GET','HEAD'].includes(req.method) ? { body: Readable.toWeb(req), duplex:'half' } : {}) }), `http://artifact.localhost:${port}`, `http://127.0.0.1:${port}`, rawFetch)
    if (!reply) return next()
    res.status(reply.status)
    reply.headers.forEach((v: string,k: string) => { res.setHeader(k,v) })
    if(reply.body)Readable.fromWeb(reply.body as import('node:stream/web').ReadableStream).pipe(res)
    else res.end()
  })().catch(next)
})
app.use(compression({ filter: (req,res) => !String(res.getHeader('Content-Type')).includes('event-stream') && compression.filter(req,res) }))
app.use(express.json({limit:'16mb'}))
app.post('/__fixture/reset', (_req,res)=>{states.clear();files.set('project/canvas.json',JSON.stringify(canvas));files.set('project/Main.dc.html',board);res.json({ok:true})})
app.use((req,res,next)=>{res.set({'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*'});if(req.method==='OPTIONS')res.sendStatus(204);else next()})
app.post('/api/artifacts/:id/editor-grant', async (_req,res)=>{
  const grant = randomUUID(); grants.add(grant)
  res.json({url: `${await artifactEditorOrigin(grant, `http://artifact.localhost:${port}`)}/artifact-editor/design/${grant}/`, write:true})
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
        const page=designPageAssets(html,`http://127.0.0.1:${port}`);html=page.html;assetSource=page.source
      }
      res.set({'Content-Security-Policy':`sandbox allow-scripts allow-downloads allow-popups allow-modals; default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: ${assetSource}; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com ${assetSource}; font-src 'self' data: https://fonts.gstatic.com ${assetSource}; img-src 'self' data: blob:; connect-src 'self' data: blob: https://fonts.googleapis.com https://fonts.gstatic.com; frame-src 'self' blob: data:; object-src 'none'; base-uri 'self'; form-action 'none'`,'Cache-Control':'no-cache'})
      res.type('html').send(html);return
    }
    const type = ({'.js':'text/javascript','.css':'text/css','.woff2':'font/woff2'} as Record<string,string>)[extname(file)]??'application/octet-stream'
    if (process.env.PERF_DESIGN_DIST && ['.js','.css'].includes(extname(file))) {await sendEditorAsset(req,res,file,type,path.startsWith('assets/')||/^artifact-type\/dc-runtime-[a-f0-9]{64}\.js$/.test(path));return}
    res.set('Cache-Control',path.startsWith('assets/')?'private, max-age=31536000, immutable':'no-cache').type(type).send(await readFile(file))
  })().catch(next)
})
app.use('/api/im/channels/:channel/visualize', (req,res)=>{
  const state=states.get(req.params.channel)??{state:null,revision:0}
  if (req.path==='/pages'&&req.method==='POST') {res.json({pageId:'page-'+randomUUID(),initId:'fixture-capability',html:visualization,state:state.state,stateRevision:state.revision,path:'/workspace/perf.html',resourceHashes:hashes});return}
  if (req.path.endsWith('/state')) {
    if(req.method==='PUT'){state.state=req.body.state;state.revision++;states.set(req.params.channel,state)}res.json(state);return
  }
  if(req.path.endsWith('/resources')){const name=String(req.query.name);res.type(name.endsWith('.css')?'css':'js').send(resources[name]);return}
  res.json({})
})
app.use((req,res,next)=>{
  for(const name of VISUALIZE_PUBLIC_RESOURCES)if(req.path===visualizeResourceUrl(name,hashes[name])){res.set('Cache-Control','public,max-age=31536000,immutable').type(name.endsWith('.css')?'css':'js').send(resources[name]);return}
  next()
})
app.use(express.static(web))
app.get('/', (_req,res)=>res.sendFile(resolve(web,'perf/issue-611/index.html')))
app.use((error: Error,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{console.error(error.message);res.status(500).send(error.name)})
app.listen(port,'0.0.0.0',()=>console.log(JSON.stringify({port,root,editor,fixtureHashes:{canvas:sha(JSON.stringify(canvas)),board:sha(board),visualization:sha(visualization)}})))
