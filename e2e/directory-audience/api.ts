import { createServer } from 'node:http'
import { mkdir, writeFile } from 'node:fs/promises'
import { ensureSchemaOnce, resetAllTables, teardownAll } from '../../server/src/__integration__/_helpers.js'
import { seedDirectory, runDirectoryTurn } from '../../server/src/__integration__/directory-audience-fixture.js'
import { installRecordingWukong } from '../../server/src/__integration__/_recording-wukong.js'

if (new URL(process.env.DATABASE_URL!).pathname !== '/lingxiloop_directory_test') throw new Error('Dedicated directory test DB required')
await ensureSchemaOnce(); await resetAllTables(); await seedDirectory()
const im = await installRecordingWukong()
const receipts: Awaited<ReturnType<typeof runDirectoryTurn>>[] = []
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Directory audience acceptance</title>
<style>body{max-width:950px;margin:35px auto;font:16px system-ui;background:#f7f9fc;color:#163047}section{background:white;border:1px solid #c4d2e1;border-radius:12px;margin:20px 0;padding:20px}button{padding:10px;margin-right:10px}pre{white-space:pre-wrap}</style>
<h1>Directory audience acceptance</h1><p>Real native worker and PostgreSQL. Synthetic identities, scripted model, recorded IM.</p>
${['A','B'].map(a=>`<section><h2>Frozen audience ${a}</h2><button onclick="run('${a}',1)">Run ${a} turn 1</button><button onclick="run('${a}',2)">Run ${a} turn 2</button><pre role="status" aria-label="Audience ${a} result" id="${a}">Ready</pre></section>`).join('')}
<script>async function run(a,t){const o=document.getElementById(a);o.textContent='Running';const r=await fetch('/turn/'+a.toLowerCase()+'/'+t,{method:'POST'});o.textContent=JSON.stringify(await r.json(),null,2)}</script></html>`
const server = createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/') { res.setHeader('Content-Type','text/html; charset=utf-8'); res.end(html); return }
  const match = req.url?.match(/^\/turn\/(a|b)\/([12])$/)
  if (req.method !== 'POST' || !match) { res.writeHead(404).end(); return }
  try {
    const receipt = await runDirectoryTurn(match[1] as 'a'|'b', Number(match[2]))
    receipts.push(receipt)
    await mkdir('.e2e/directory-audience', { recursive: true })
    await writeFile('.e2e/directory-audience/audience-results.json', JSON.stringify({ receipts,
      limitations: ['Scripted model; recording WuKong adapter; contract harness rather than product SPA; no real provider, real WuKong delivery or 24-hour soak.'] }, null, 2))
    res.setHeader('Content-Type','application/json'); res.end(JSON.stringify(receipt))
  } catch (error) { console.error(error); res.writeHead(500).end(JSON.stringify({ status: 'failed' })) }
})
server.listen(53158,'127.0.0.1')
process.on('SIGTERM', () => { void teardownAll(server).finally(() => im.close()).finally(() => process.exit()) })
