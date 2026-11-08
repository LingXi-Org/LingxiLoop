// Reproducible geometry-only profile. No browser paint/network or product acceptance claim.
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {Worker} from 'node:worker_threads'
import {mkdtemp,writeFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {execFileSync} from 'node:child_process'

const baseline=resolve(process.argv[2]),candidate=resolve(import.meta.dirname,'..')
const output=resolve(process.argv[3]??'/tmp/lingxi-design-worker-profile.json')
const temp=await mkdtemp(join(tmpdir(),'design-worker-profile-'))
const roots={baseline,candidate},workers={},pending={},counts={baseline:0,candidate:0},samples=[]
let requestId=0
const source=Object.fromEntries(Object.entries(roots).map(([arm,root])=>[arm,{commit:execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),dirty:!!execFileSync('git',['-C',root,'status','--porcelain'],{encoding:'utf8'}).trim()}]))
try{
 for(const [arm,root]of Object.entries(roots)){
  const compiled=await build({entryPoints:[join(root,'src/features/artifacts/native/compute.worker.ts')],bundle:true,write:false,format:'esm',platform:'node',external:['katex'],logLevel:'silent'})
  const path=join(temp,`${arm}.mjs`)
  await writeFile(path,"import{parentPort}from'node:worker_threads';globalThis.postMessage=message=>parentPort.postMessage(message);\n"+compiled.outputFiles[0].text+"\nparentPort.on('message',data=>globalThis.onmessage({data}));parentPort.postMessage({ready:true});")
  workers[arm]=new Worker(path);pending[arm]=new Map()
  await new Promise((resolve,reject)=>{workers[arm].on('error',reject);workers[arm].on('message',message=>{if(message.ready){resolve();return}const request=pending[arm].get(message.id);if(!request)return;pending[arm].delete(message.id);message.error?request.reject(Error(message.error)):request.resolve(message.value)})})
 }
 const pack=elements=>{const coordinates=new Float64Array(elements.length*4);for(let i=0;i<elements.length;i++){const b=elements[i];coordinates.set([b.x,b.y,b.width,b.height],i*4)}return{ids:elements.map(b=>b.id),coordinates}}
 const request=(arm,task)=>new Promise((resolve,reject)=>{const id=++requestId;counts[arm]++;pending[arm].set(id,{resolve,reject});const transfer=[];if(task.geometry){const coordinates=task.geometry.coordinates.slice();task={...task,geometry:{ids:task.geometry.ids,coordinates}};transfer.push(coordinates.buffer)}workers[arm].postMessage({id,revision:1,task},transfer)})
 const viewport={x:0,y:0,width:1000,height:800},elements=Array.from({length:500},(_,id)=>({id:String(id),x:id%20*100,y:Math.floor(id/20)*80,width:80,height:60}))
 const geometry=pack(elements)
 const expected=elements.filter(b=>b.x+b.width>=viewport.x&&b.y+b.height>=viewport.y&&b.x<=viewport.x+viewport.width&&b.y<=viewport.y+viewport.height).map(b=>b.id)
 const run=async arm=>{
  const start=performance.now(),before=counts[arm]
  if(arm==='baseline')for(let page=0;page<50;page++){
   await request(arm,{kind:'elements',pageId:String(page),elements})
   assert.deepEqual(await request(arm,{kind:'validate-bounds',elements}),[])
   assert.deepEqual(await request(arm,{kind:'visible-elements',pageId:String(page),viewport}),expected)
  }else await Promise.all(Array.from({length:50},async(_,page)=>{
   const result=await request(arm,{kind:'project-elements',pageId:String(page),geometry,viewport,geometryKey:page})
   assert.deepEqual(result.ids,expected);assert.deepEqual(result.issues,[])
  }))
  return{ms:performance.now()-start,messages:counts[arm]-before}
 }
 await run('baseline');await run('candidate')
 for(let pair=0;pair<10;pair++)for(const arm of pair%2?['candidate','baseline']:['baseline','candidate'])samples.push({pair,arm,...await run(arm)})
 const summary=Object.fromEntries(Object.keys(roots).map(arm=>{const times=samples.filter(s=>s.arm===arm).map(s=>s.ms).sort((a,b)=>a-b);return[arm,{p50Ms:times[4],p75Ms:times[7],p95Ms:times[9],messages:samples.find(s=>s.arm===arm).messages}]}))
 const warm=[]
 for(const arm of Object.keys(roots))for(let page=0;page<8;page++){
  if(arm==='baseline')await request(arm,{kind:'elements',pageId:String(page),elements})
  else await request(arm,{kind:'project-elements',pageId:String(page),geometry,viewport,geometryKey:page})
 }
 for(let pair=0;pair<10;pair++)for(const arm of pair%2?['candidate','baseline']:['baseline','candidate']){
  const start=performance.now(),before=counts[arm]
  if(arm==='baseline')for(let page=0;page<8;page++){
   await request(arm,{kind:'update-elements',pageId:String(page),upserts:[],removed:[]})
   assert.deepEqual(await request(arm,{kind:'visible-elements',pageId:String(page),viewport}),expected)
  }else await Promise.all(Array.from({length:8},async(_,page)=>{assert.deepEqual((await request(arm,{kind:'project-elements',pageId:String(page),geometry,viewport,geometryKey:page})).ids,expected)}))
  warm.push({pair,arm,ms:performance.now()-start,messages:counts[arm]-before})
 }
 const warmSummary=Object.fromEntries(Object.keys(roots).map(arm=>{const times=warm.filter(s=>s.arm===arm).map(s=>s.ms).sort((a,b)=>a-b);return[arm,{p50Ms:times[4],p75Ms:times[7],p95Ms:times[9]}]}))
 const report={scope:'实际计算Worker，50画板×500矩形；10组交替AB/BA。仅几何管线，非真实浏览器加载/网络/内存资格。',node:process.version,source,summary,samples,warmSummary,warm}
 await writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({output,summary,warmSummary}))
}finally{await Promise.all(Object.values(workers).map(worker=>worker.terminate()));await rm(temp,{recursive:true,force:true})}
