// Real GenUI production fixture and assets; only the page/state API is synthetic.
import { createServer } from 'node:http'
import { createHash, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve, extname } from 'node:path'
import { gzipSync } from 'node:zlib'
import { visualization } from '../issue-611/fixtures.mjs'
import { VISUALIZE_PUBLIC_RESOURCES, visualizeResourceFile, visualizeResourceUrl } from '../../shared/visualize-public-resources'

const root = resolve(process.argv[2] ?? '.')
const web = resolve(process.argv[3])
const port = Number(process.argv[4])
const resources = Object.fromEntries(await Promise.all(VISUALIZE_PUBLIC_RESOURCES.map(async name => [name, await readFile(resolve(root, visualizeResourceFile(name)!))])))
const hashes = Object.fromEntries(Object.entries(resources).map(([name, bytes]) => [name, createHash('sha256').update(bytes).digest('hex')]))
const urls = new Map(VISUALIZE_PUBLIC_RESOURCES.map(name => [visualizeResourceUrl(name, hashes[name]), name]))
let fragment = visualization, state: unknown = null, revision = 0, stallMath = false
createServer(async (req, res) => {
  try {
    const url = new URL(req.url!, `http://127.0.0.1:${port}`)
    const send = (body: string | Buffer, type = 'application/json', immutable = false) => {
      const compressed = /gzip/.test(req.headers['accept-encoding'] ?? '')
      const bytes = compressed ? gzipSync(body) : Buffer.from(body)
      res.writeHead(200, { 'content-type': type + '; charset=utf-8', 'content-length': bytes.length, 'cache-control': immutable ? 'public,max-age=31536000,immutable' : 'no-store', 'access-control-allow-origin': '*', ...(compressed ? { 'content-encoding': 'gzip', vary: 'Accept-Encoding' } : {}) })
      res.end(bytes)
    }
    const json = (value: unknown) => send(JSON.stringify(value))
    let body = ''
    for await (const chunk of req) body += chunk
    if (url.pathname === '/__fixture/reset') { fragment = visualization; state = null; revision = 0; stallMath = false; json({ ok: true }); return }
    if (url.pathname === '/__fixture/content') { fragment = JSON.parse(body).visualization; json({ ok: true }); return }
    if (url.pathname === '/__fixture/stall-math') { stallMath = JSON.parse(body).enabled; json({ ok: true }); return }
    if (url.pathname.startsWith('/api/im/channels/')) {
      if (req.method === 'POST' && url.pathname.endsWith('/pages')) { json({ pageId: randomUUID(), initId: 'fixture-capability', html: fragment.replace('<h1', `<h1 data-fixture-channel="${url.pathname.split('/')[4]}"`), state, stateRevision: revision, path: '/workspace/perf.html', resourceHashes: hashes }); return }
      if (url.pathname.endsWith('/state')) { if (req.method === 'PUT') { state = JSON.parse(body).state; revision++ } json({ state, revision }); return }
      if (url.pathname.endsWith('/resources')) { const name = url.searchParams.get('name')!; if (stallMath && name === 'math.js') return; send(resources[name], name.endsWith('.css') ? 'text/css' : 'text/javascript'); return }
      json({}); return
    }
    const resource = urls.get(url.pathname)
    if (resource) { if (stallMath && resource === 'math.js') return; send(resources[resource], resource.endsWith('.css') ? 'text/css' : 'text/javascript', true); return }
    const relative = url.pathname === '/' ? 'perf/issue-611/index.html' : decodeURIComponent(url.pathname.slice(1))
    const file = resolve(web, relative)
    if (!file.startsWith(web + '\\') && !file.startsWith(web + '/')) { res.writeHead(404); res.end(); return }
    send(await readFile(file), ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' } as Record<string, string>)[extname(file)] ?? 'application/octet-stream', relative.startsWith('assets/'))
  } catch { res.writeHead(500); res.end('Fixture request failed') }
}).listen(port, '127.0.0.1', () => console.log(JSON.stringify({ port, web, hashes })))
