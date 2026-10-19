import {createServer} from 'node:http'
import {readFile} from 'node:fs/promises'
import {resolve} from 'node:path'
const bytes=await readFile(resolve(process.env.E2E_VISUALIZE_LIVE_OUTPUT??'.e2e/visualize-live','quantity-export.html'))
const server=createServer((request,response)=>{
  if(request.url!=='/quantity-export.html'&&request.url!=='/'){response.writeHead(404);response.end();return}
  response.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});response.end(bytes)
})
server.listen(5198,'127.0.0.1')
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)))
