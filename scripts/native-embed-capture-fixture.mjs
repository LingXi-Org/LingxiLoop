/** Controlled HTTP fixture for the real capture client and opaque runtime.
 * No authentication or production-performance qualification is claimed. */
import {createServer} from 'node:http'
import {build} from 'esbuild'
import {createHash} from 'node:crypto'
import {resolve} from 'node:path'
import {createFixture} from './native-artifact-fixture.mjs'
import {nativeEmbedRuntime,renderNativeEmbedSource} from '../server/src/modules/artifacts/native-embed-source.ts'
const fixture=createFixture('design','capture'),node=fixture.document.pages['page-25'].nodes['page-25-isolated'],runtime=await nativeEmbedRuntime()
const client=await build({stdin:{contents:`import{captureEmbedPreviews}from${JSON.stringify(resolve('src/features/artifacts/native/capture-embeds.ts'))};window.captureNative=captureEmbedPreviews`,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'iife',platform:'browser',target:'es2022',plugins:[{name:'controlled-http-fixture',setup(build){build.onResolve({filter:/^@\/api\/core\/http$/},()=>({path:'http',namespace:'capture-fixture'}));build.onLoad({filter:/.*/,namespace:'capture-fixture'},()=>({contents:"export async function http(path,init){const response=await fetch('/api'+path,{...init,headers:{'content-type':'application/json'}});if(!response.ok)throw new Error('捕获请求失败');return response.json()}",loader:'js'}))}}]})
const csp="sandbox allow-scripts; default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data: https:; connect-src 'self' data: blob:; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'none'"
const documentJson=JSON.stringify(fixture.document).replaceAll('<','\\u003c')
const html=`<!doctype html><meta charset="utf-8"><button id="capture">验证隔离导出</button><script src="/client.js"></script><script>
const source=${documentJson},original=JSON.stringify(source);let controller,mode='success';window.probePeak=0;window.observations=[];
new MutationObserver(records=>{for(const record of records)for(const frame of record.addedNodes){if(frame.tagName!=='IFRAME')continue;window.probePeak=Math.max(window.probePeak,document.querySelectorAll('iframe').length);frame.addEventListener('load',()=>{const rect=frame.getBoundingClientRect();window.observations.push({opaque:frame.contentDocument===null,scriptsOnly:frame.sandbox.value==='allow-scripts',inert:frame.inert,hiddenFromAccessibility:frame.getAttribute('aria-hidden')==='true',nonFocusable:frame.tabIndex===-1,pointerDisabled:frame.style.pointerEvents==='none',transparent:frame.style.opacity==='0',intersectsViewport:rect.right>0&&rect.bottom>0&&rect.left<innerWidth&&rect.top<innerHeight})});if(mode==='abort')setTimeout(()=>controller.abort(),25)}}).observe(document.body,{childList:true});
document.querySelector('button').onclick=async()=>{controller=new AbortController();window.captureState={state:'pending'};try{const result=await window.captureNative(source,controller.signal,{'page-25':'a'.repeat(64)}),asset=result.assets[result.pages['page-25'].nodes['page-25-isolated'].embed.previewAssetId];window.captureState={state:'passed',image:asset.url,originalUnchanged:JSON.stringify(source)===original}}catch(error){window.captureState={state:'failed',aborted:error.name==='AbortError',originalUnchanged:JSON.stringify(source)===original}}};window.abortMode=()=>{mode='abort';window.observations=[]};
</script>`
const server=createServer(async(request,response)=>{
 try{
  const url=new URL(request.url,'http://127.0.0.1')
  if(url.pathname==='/client.js'){response.setHeader('content-type','text/javascript');response.end(client.outputFiles[0].text);return}
  if(url.pathname==='/runtime.js'){response.setHeader('content-type','text/javascript');response.end(runtime);return}
  if(url.pathname==='/embed.html'){const nonce=url.searchParams.get('nonce');if(!/^[a-zA-Z0-9_-]{1,128}$/.test(nonce??'')){response.writeHead(400);response.end();return}response.setHeader('content-type','text/html;charset=utf-8');response.setHeader('content-security-policy',csp);response.end(await renderNativeEmbedSource(node.embed.source,'html',{runtimeUrl:'/runtime.js',nonce}));return}
  if(request.method==='POST'&&url.pathname==='/api/artifacts/capture/embeds/page-25/page-25-isolated/grant'){
   const chunks=[];for await(const chunk of request)chunks.push(chunk);const body=JSON.parse(Buffer.concat(chunks).toString())
   if(body.sha256!==node.embed.sourceHash||body.pageHash!=='a'.repeat(64)||!/^[a-zA-Z0-9_-]{1,128}$/.test(body.nonce)){response.writeHead(400);response.end();return}
   response.setHeader('content-type','application/json');response.end(JSON.stringify({url:`/embed.html?nonce=${body.nonce}`}));return
  }
  response.setHeader('content-type','text/html;charset=utf-8');response.end(html)
 }catch{response.writeHead(500);response.end('隔离捕获夹具失败')}
})
await new Promise(done=>server.listen(0,'127.0.0.1',done))
console.log(JSON.stringify({origin:`http://127.0.0.1:${server.address().port}`,runtimeBytes:Buffer.byteLength(runtime),sourceBytes:Buffer.byteLength(node.embed.source),sourceSha256:createHash('sha256').update(node.embed.source).digest('hex')}))
const stop=()=>server.close(()=>process.exit());process.once('SIGTERM',stop);process.once('SIGINT',stop)
