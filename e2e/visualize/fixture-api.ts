import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import type { Plugin } from 'vite'
import { windowFixture } from './window-fixture'

// Controlled local transport for UI/bridge tests. Real tenant authorization and
// durable delivery are verified separately against the real service.
export function visualizeFixtureApi(): Plugin {
  type Page={channel:string;path:string;instanceKey:string;initId:string;active:boolean;stale:boolean;gestures:Set<string>}
  const pages=new Map<string,Page>(),states=new Map<string,unknown>(),revisions=new Map<string,number>()
  const follows:string[]=[],external:string[]=[],denied:string[]=[]
  let failOnce=false,closedPages=0,externalHits=0,acceptedSaves=0
  let fault=''
  let resourceFault=''
  const resourceAttempts: {name:string;attempt:number;start:number;end?:number;outcome?:string}[]=[]
  const held=new Set<()=>void>(),blocked:string[]=[],aborted:string[]=[]
  const stateKey=(page:Pick<Page,'channel'|'path'>)=>JSON.stringify([page.channel,page.path])
  return {name:'issue193-presentation-api',configureServer(server){
    server.middlewares.use(async(req,res,next)=>{
      const url=new URL(req.url??'/', 'http://127.0.0.1:5193')
      const reply=(value:unknown,status=200)=>{res.statusCode=status;res.setHeader('content-type','application/json');res.end(JSON.stringify(value))}
      if(url.pathname==='/__visualize_fixture/ready'){reply({},process.env.E2E_VISUALIZE_READY==='1'?200:503);return}
      if(url.pathname==='/__visualize_fixture/fault') {fault=url.searchParams.get('stage')??'';if(url.searchParams.has('release')){for(const release of held)release();held.clear()}reply({});return}
      if(url.pathname==='/__visualize_fixture/resource-fault') {resourceFault=url.searchParams.get('mode')??'';reply({});return}
      if(url.pathname==='/__visualize_fixture/resource-evidence') {reply({attempts:resourceAttempts});return}
      if(url.pathname==='/__visualize_fixture/evidence') {reply({follows,external,denied,externalHits,acceptedSaves,savedStates:Object.fromEntries(states),activePages:[...pages.values()].filter(page=>page.active).length,closedPages,blocked,aborted});return}
      if(url.pathname==='/__visualize_fixture/reset') {fault='';resourceFault='';resourceAttempts.length=0;for(const release of held)release();held.clear();blocked.length=aborted.length=0;pages.clear();states.clear();revisions.clear();follows.length=external.length=denied.length=0;closedPages=externalHits=acceptedSaves=0;failOnce=url.searchParams.get('failOnce')==='1';reply({});return}
      if(url.pathname==='/__visualize_fixture/invalidate') {for(const page of pages.values())if(page.active)page.stale=true;reply({});return}
      if(url.pathname==='/__visualize_fixture/external') {externalHits++;res.setHeader('content-type','text/plain');res.end('Local fictional visualization link');return}
      const match=/^\/api\/im\/channels\/([^/]+)\/visualize\/pages(?:\/([^/]+)(?:\/(.*))?)?$/.exec(url.pathname)
      if(!match)return next()
      try {
        const [,,id,action]=match,channel=match[1]
        const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk))
        const input=chunks.length?JSON.parse(Buffer.concat(chunks).toString()):{}
        const stage=!id&&req.method==='POST'?'create':req.method==='DELETE'?'delete':action
        // Real createVisualizePage can continue after the HTTP client aborts.
        // Hold its pre-transaction work, then commit even without a response.
        if(stage==='create'&&fault==='late-create'){
          blocked.push('late-create')
          await new Promise<void>(resolve=>{const release=()=>{held.delete(release);resolve()};held.add(release)})
        }
        if(fault.split(',').includes(stage ?? '') && fault && req.method!=='PUT'){
          blocked.push(stage!)
          await new Promise<void>(resolve=>{
            const release=()=>{held.delete(release);resolve()}
            held.add(release)
            res.on('close',()=>{if(!res.writableEnded)aborted.push(stage!);release()})
          })
          if(res.destroyed)return
        }
        if(!id&&req.method==='POST'){
          if(failOnce){failOnce=false;reply({error:'Deterministic first acquisition failure'},503);return}
          for(const page of pages.values())if(page.channel===channel&&page.instanceKey===input.instanceKey)page.active=false
          const pageId=randomUUID(),initId=randomUUID(),page:Page={channel,path:input.path,instanceKey:input.instanceKey,initId,active:true,stale:false,gestures:new Set()};pages.set(pageId,page)
          const fixture=input.path.startsWith('/fixture/learning')?'learning':input.path==='/fixture/corners.html'?'corners':input.path==='/fixture/bridge.html'?'bridge':'acceptance'
          reply({pageId,initId,path:input.path,html:input.path==='/fixture/window.html'?windowFixture():await readFile(`e2e/visualize/fixtures/${fixture}.html`,'utf8'),state:states.get(stateKey(page))??null,stateRevision:revisions.get(stateKey(page))??0});return
        }
        const page=pages.get(id)
        if(!page||page.channel!==channel||req.headers['x-visualize-page-token']!==page.initId){reply({error:'fixture page unauthorized'},403);return}
        if(req.method==='DELETE'){if(page.active){closedPages++;page.active=false}reply({});return}
        if(!page.active||page.stale){denied.push(action??'page');reply({error:'fixture page no longer current'},410);return}
        if(action==='resources'){
          const name=url.searchParams.get('name')??''
          const allowed=['visualize.css','visualize.html','calendar.js','gen-ui.js','vendor/d3-7.9.0.min.js','vendor/floating-ui-core-1.7.3.min.js','vendor/floating-ui-dom-1.7.4.min.js','vendor/lucide-1.17.0.js']
          if(!allowed.includes(name)){reply({},404);return}
          if(fault.split(',').includes('handshake')&&name==='gen-ui.js'){res.setHeader('content-type','text/plain');res.end('/* fault fixture: runtime unavailable */');return}
          const file=name==='gen-ui.js'?path.join(process.env.E2E_VISUALIZE_RUNTIME_ROOT??'server/assets/visualize-runtime','gen-ui.js')
            :path.join(process.env.E2E_VISUALIZE_ASSET_ROOT??'third_party/zcode/skills/visualize/assets',name)
          const attempt = resourceAttempts.filter(item=>item.name===name).length + 1
          const entry: typeof resourceAttempts[number] = {name,attempt,start:performance.now()}
          resourceAttempts.push(entry)
          res.once('close',()=>{entry.end=performance.now();entry.outcome??=res.writableEnded?'complete':'aborted'})
          if(name==='gen-ui.js') {
            if(resourceFault==='slow-headers')await new Promise(resolve=>setTimeout(resolve,6000))
            if(resourceFault==='stall-once'&&attempt===1) {entry.outcome='stalled';return}
            if(resourceFault==='offline') {
              res.setHeader('content-length','500000');res.write('/* interrupted')
              setTimeout(()=>{entry.outcome='disconnected';res.destroy()},20);return
            }
            if(resourceFault==='denied') {entry.outcome='403';reply({},403);return}
            if(resourceFault==='503-once'&&attempt===1) {entry.outcome='503';reply({},503);return}
            if(resourceFault==='retry-after') {entry.outcome='503';res.setHeader('retry-after','60');reply({},503);return}
            if(resourceFault==='drop-once'&&attempt===1) {
              const bytes=await readFile(file)
              res.setHeader('content-length',bytes.length);res.write(bytes.subarray(0,1024))
              setTimeout(()=>{entry.outcome='body-disconnected';res.destroy()},100);return
            }
            if(resourceFault==='slow-body') {
              const bytes=await readFile(file),size=Math.ceil(bytes.length/9)
              res.setHeader('content-length',bytes.length);res.setHeader('content-type','text/plain');res.setHeader('cache-control','no-store')
              for(let offset=0;offset<bytes.length;offset+=size) {
                if(res.destroyed)return
                res.write(bytes.subarray(offset,offset+size))
                if(offset+size<bytes.length)await new Promise(resolve=>setTimeout(resolve,1000))
              }
              res.end();return
            }
          }
          const delays = JSON.parse(process.env.E2E_VISUALIZE_RESOURCE_DELAYS ?? '{}') as Record<string, number>
          const delay = Number(delays[name] ?? process.env.E2E_VISUALIZE_RESOURCE_DELAY ?? 0)
          if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay))
          res.setHeader('cache-control','no-store')
          res.setHeader('content-type','text/plain');res.end(await readFile(file));return
        }
        const key=stateKey(page)
        if(action==='state'){
          if(req.method==='PUT'){states.set(key,input.state);revisions.set(key,(revisions.get(key)??0)+1);acceptedSaves++}
          reply({state:states.get(key)??null,revision:revisions.get(key)??0});return
        }
        if(action==='gesture'){const gestureToken=randomUUID();page.gestures.add(gestureToken);reply({gestureToken});return}
        if(action==='follow-up'||action==='open-external'){
          if(!page.gestures.delete(input.gestureToken)){denied.push(action);reply({error:'fixture gesture missing or consumed'},403);return}
          if(action==='follow-up'){follows.push(input.prompt);reply({})}
          else {const href=new URL(input.href);if(href.origin!==url.origin||href.pathname!=='/__visualize_fixture/external'){reply({error:'Only the local fictional link is allowed'},400);return}external.push(input.href);reply({href:input.href})}
          return
        }
        if(action==='validate'){reply({});return}
        denied.push(action??'unknown');reply({error:'Unsupported fixture API'},404)
      } catch(error){reply({error:String(error)},500)}
    })
  }}
}
