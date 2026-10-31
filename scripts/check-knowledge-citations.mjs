// Real Chromium, production NativeTool/ConfidenceMarker and assistant-ui runtime.
// Synthetic receipts/excerpts only; no backend, model call or production writes.
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const mocks = {
  '../runtime/transport': 'export const chatTransport={}',
  './ToolRenderers': 'export const TOOL_DETAILS={}',
  './MemoryTool': 'export const MemoryTool=()=>null',
  './ResearchSources': 'export const ResearchSources=()=>null',
  './ApprovalRequestCard': 'export const ApprovalRequestCard=()=>null',
}
const entry = `import React,{useState}from'react';import{createRoot}from'react-dom/client';
import{AssistantRuntimeProvider,useExternalStoreRuntime,MessagePrimitive,ThreadPrimitive}from'@assistant-ui/react';
import{NativeTool}from'./src/features/chat/components/NativeTool';
import{ConfidenceMarker}from'./src/components/assistant-ui/elements/confidence-marker';
const key='issue579-synthetic',restored=sessionStorage.getItem(key);
const fixture=restored?JSON.parse(restored):{claims:[
 {id:'intro',text:'导读介绍 Q、K、V',confidence:'grounded',basis:'',evidence:[{marker:'S1',chunkId:'pdf:0:6797',title:'测试手册',excerpt:'[[PAGE:2]]\\n导读：介绍 Q、K、V。',truncated:true}]},
 {id:'cross',text:'交叉注意力允许不同序列',confidence:'grounded',basis:'',evidence:[{marker:'S2',chunkId:'pdf:6797:19204',title:'测试手册',excerpt:'[[PAGE:15]]\\n交叉注意力：Q、K、V 可以来自不同序列。',truncated:true}]}],
 tools:['unavailable','matched','no_matches','processing'].map((sourceStatus,index)=>({type:'tool-call',toolCallId:'search-'+index,toolName:'knowledge.search',args:{},argsText:'{}',
 result:{status:'completed',sourceStatus,display:{title:'检索课程资料',purpose:'查找课程依据。',summary:'检索已完成，可在下方查看资料结果。'}},isError:false}))};
sessionStorage.setItem(key,JSON.stringify(fixture));
const Fallback=p=><NativeTool {...p} readOnly/>;
const Message=()=> <MessagePrimitive.Root><MessagePrimitive.Parts components={{tools:{Fallback}}}/></MessagePrimitive.Root>;
function App(){const[id,setId]=useState('');const runtime=useExternalStoreRuntime({messages:[{id:'fixture',role:'assistant',content:fixture.tools,status:{type:'complete',reason:'stop'},metadata:{custom:{}}}],onNew:async()=>{}});
 return <><AssistantRuntimeProvider runtime={runtime}><ThreadPrimitive.Messages components={{Message}}/></AssistantRuntimeProvider>
 <ConfidenceMarker claims={fixture.claims} hoveredId={id} onHover={setId} floatingBasis/></>}
createRoot(document.getElementById('root')).render(<App/>);
const wait=async check=>{for(let i=0;i<120;i++){if(check())return;await new Promise(r=>setTimeout(r,25))}throw Error('UI condition timed out')};
const assert=(ok,message)=>{if(!ok)throw Error(message)};
try{
 await wait(()=>document.querySelectorAll('[data-confidence-id]').length===2);
 const labels=['课程检索未完成','课程检索已命中','课程检索未命中','课程资料仍在处理'];
 for(const button of document.querySelectorAll('button'))if(button.textContent.includes('检索课程资料'))button.click();
 await wait(()=>labels.every(x=>document.body.textContent.includes(x)));
 assert(!document.body.textContent.includes('检索已完成，可在下方查看资料结果。'),'stale success summary survived');
 for(const[id,page,text]of[['intro','2','导读：介绍 Q、K、V。'],['cross','15','交叉注意力：Q、K、V 可以来自不同序列。'],['intro','2','导读：介绍 Q、K、V。']]){
  document.querySelector('[data-confidence-id="'+id+'"]').click();
  await wait(()=>document.querySelector('[data-slot="confidence-basis"]')?.textContent.includes(text));
  const basis=document.querySelector('[data-slot="confidence-basis"]').textContent;
  assert(basis.includes('[[PAGE:'+page+']]'),'wrong page '+id);
  assert(!basis.includes('[[PAGE:'+(page==='2'?'15':'2')+']]'),'cross-range excerpt '+id);
 }
 if(!restored){location.reload()}else await fetch('/result',{method:'POST',body:JSON.stringify({passed:true,checks:['four real receipt summaries override obsolete recorded copy','page2/page15/page2 original excerpts before reload','same markers and excerpts after actual reload'],limits:['synthetic source data','no provider generation or backend ACL exercised']})});
}catch(error){await fetch('/result',{method:'POST',body:JSON.stringify({passed:false,error:error.message,body:document.body.textContent.slice(0,1500)})})}`
const bundle = await build({ stdin: { contents: entry, loader: 'jsx', resolveDir: root }, bundle: true, write: false,
  format: 'esm', jsx: 'automatic', alias: { '@': resolve(root, 'src') },
  define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}' },
  plugins: [{ name: 'fixture', setup(b) {
    b.onResolve({ filter: /.*/ }, args => Object.hasOwn(mocks, args.path) ? { path: args.path, namespace: 'fixture' } : null)
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: mocks[args.path], loader: 'jsx', resolveDir: root }))
  } }],
})
let finish
const result = new Promise(resolve => { finish = resolve })
const server = createServer(async (req, res) => {
  if (req.url === '/result') {
    let raw = ''
    for await (const chunk of req) raw += chunk
    finish(JSON.parse(raw)); res.end('ok')
  } else if (req.url === '/test.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(bundle.outputFiles[0].text) }
  else { res.setHeader('Content-Type', 'text/html'); res.end('<meta charset="utf-8"><div id="root"></div><script type="module" src="/test.js"></script>') }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const profile = await mkdtemp(resolve(tmpdir(), 'knowledge-citations-'))
const browser = spawn(process.env.CHROME_PATH ?? '/usr/bin/chromium', ['--headless', '--no-sandbox', '--disable-gpu', '--no-first-run',
  `--user-data-dir=${profile}`, `http://127.0.0.1:${server.address().port}`], { stdio: 'ignore' })
let timer
try {
  const outcome = await Promise.race([result, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Browser fixture timeout')), 30_000) })])
  console.log(JSON.stringify(outcome)); assert.equal(outcome.passed, true)
} finally {
  clearTimeout(timer); browser.kill(); server.closeAllConnections()
  await new Promise(resolve => server.close(resolve))
  await rm(profile, { recursive: true, force: true }).catch(() => {})
}
