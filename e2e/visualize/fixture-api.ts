import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import type { Plugin } from 'vite'

// Deliberate transport fixture for presentation comparison only. Authorization
// and real model acceptance MUST use the real API and separate integration run.
export function visualizeFixtureApi(): Plugin {
  const pages=new Map<string,{channel:string;initId:string;active:boolean}>()
  const states=new Map<string,unknown>()
  const revisions=new Map<string,number>()
  const follows:string[]=[]
  let failOnce=false
  return {name:'issue193-presentation-api',configureServer(server){
    server.middlewares.use(async(req,res,next)=>{
      const url=new URL(req.url??'/', 'http://127.0.0.1:5193')
      if(url.pathname==='/__visualize_fixture/evidence') {res.setHeader('content-type','application/json');res.end(JSON.stringify({follows}));return}
      if(url.pathname==='/__visualize_fixture/reset') {states.clear();revisions.clear();follows.length=0;failOnce=url.searchParams.get('failOnce')==='1';res.end('{}');return}
      const match=/^\/api\/im\/channels\/([^/]+)\/visualize\/pages(?:\/([^/]+)(?:\/(.*))?)?$/.exec(url.pathname)
      if(!match)return next()
      try {
        const [,,id,action]=match,channel=match[1]
        const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk))
        const input=chunks.length?JSON.parse(Buffer.concat(chunks).toString()):{}
        res.setHeader('content-type','application/json')
        if(!id&&req.method==='POST'){
          if(failOnce){failOnce=false;res.statusCode=503;res.end(JSON.stringify({error:'Deterministic first acquisition failure'}));return}
          const pageId=randomUUID(),initId=randomUUID();pages.set(pageId,{channel,initId,active:true})
          res.end(JSON.stringify({pageId,initId,path:input.path,html:await readFile('e2e/visualize/fixtures/acceptance.html','utf8'),state:states.get(channel)??null,stateRevision:revisions.get(channel)??0}));return
        }
        const page=pages.get(id)
        if(!page?.active||page.channel!==channel||req.headers['x-visualize-page-token']!==page.initId){res.statusCode=403;res.end('{"error":"fixture page inactive"}');return}
        if(req.method==='DELETE'){page.active=false;res.end('{}');return}
        if(action==='resources'){
          const name=url.searchParams.get('name')??''
          const allowed=['visualize.css','visualize.html','calendar.js','gen-ui.js','vendor/d3-7.9.0.min.js','vendor/floating-ui-core-1.7.3.min.js','vendor/floating-ui-dom-1.7.4.min.js','vendor/lucide-1.17.0.js']
          if(!allowed.includes(name)){res.statusCode=404;res.end('{}');return}
          const file=name==='gen-ui.js'?'server/assets/visualize-runtime/gen-ui.js':path.join('third_party/zcode/skills/visualize/assets',name)
          res.setHeader('content-type','text/plain');res.end(await readFile(file));return
        }
        if(action==='state'&&req.method==='PUT'){states.set(channel,input.state);revisions.set(channel,(revisions.get(channel)??0)+1)}
        if(action==='follow-up')follows.push(input.prompt)
        res.end(JSON.stringify(action==='state'?{state:states.get(channel)??null,revision:revisions.get(channel)??0}:action==='gesture'?{gestureToken:randomUUID()}:action==='open-external'?{href:input.href}:{}))
      } catch(error){res.statusCode=500;res.end(JSON.stringify({error:String(error)}))}
    })
  }}
}
