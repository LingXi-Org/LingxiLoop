import assert from 'node:assert/strict'
import { once } from 'node:events'
import { after, mock, test } from 'node:test'
import { createHash } from 'node:crypto'
import express from 'express'
import { createDocument, createNode, createPage } from '../../../../shared/artifact-document.js'

const document=createDocument('design','page-read')
const contents=new Map<string,Buffer>(),hashes:Record<string,string>={}
for(let index=0;index<50;index++){
 const page=createPage(`page-${index}`),node=createNode('text',`text-${index}`)
 node.text='按需读取的正文';page.nodes[node.id]=node;page.nodeOrder=[node.id]
 document.pages[page.id]=page;document.pageOrder.push(page.id)
 const bytes=Buffer.from(JSON.stringify(page)+'\n'),hash=createHash('sha256').update(bytes).digest('hex')
 hashes[page.id]=hash;contents.set(hash,bytes)
}
const manifestHash='a'.repeat(64),manifest={...document,pages:undefined,pageFiles:hashes}
for(let i=0;i<20_000;i++)manifest.versions[`node/other-page/node-${i}/field/text`]=1
const manifestBytes=Buffer.from(JSON.stringify(manifest))
const files=Object.fromEntries(Object.entries(hashes).map(([id,sha256])=>[`project/pages/${id}.json`,{sha256}]))
files['project/document.json']={sha256:manifestHash}
let allowed=true,member=true,manifestReads=0,pageReads=0,authorizations=0,readBytes=0
await mock.module('../../db/pool.js',{namedExports:{pool:{query:async(sql:string,values:unknown[])=>{
 if(sql.includes('artifact_revisions'))return {rows:member?[sql.includes('SELECT 1')?{}:{files}]:[]}
 if(sql.includes('artifact_file_versions'))return {rows:(values[1] as string[]).map(value=>{if(value===manifestHash){manifestReads++;readBytes+=manifestBytes.length;return {sha256:value,body:manifestBytes}}const body=contents.get(value);assert.ok(body);pageReads++;readBytes+=body.length;return {sha256:value,body}})}
 throw Error('页面正文读取不应访问其他数据')
}}}})
await mock.module('../../http/authorization.js',{namedExports:{requireArtifact:async()=>{authorizations++;if(!allowed)throw Object.assign(Error('拒绝访问'),{status:403});return {companyId:'tenant',userId:'user',kind:'design'}}}})
await mock.module('../access/public.js',{namedExports:{permissionService:{}}})
await mock.module('../../storage.js',{namedExports:{storage:{}}})
await mock.module('../../env.js',{namedExports:{env:{GATEWAY_HMAC_SECRET:'unit-test-only'}}})
await mock.module('./events.js',{namedExports:{publishArtifactEvent:async()=>{},onArtifactEvent:()=>()=>{}}})
await mock.module('./native-comments-router.js',{namedExports:{nativeCommentsRouter:express.Router()}})
const {nativeArtifactsRouter}=await import('./native-router.js')
const app=express();app.use('/api',nativeArtifactsRouter)
app.use((error:{status?:number;name?:string},_req:express.Request,res:express.Response,_next:express.NextFunction)=>{res.status(error.status??(error.name==='ZodError'?400:500)).json({error:'请求无效'})})
const server=app.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();assert.ok(address&&typeof address!=='string')
const base=`http://127.0.0.1:${address.port}/api/artifacts/page-read/pages/`
const pageUrl=(id='page-0',hash=hashes[id])=>`${base}${id}?hash=${hash}`
after(()=>{server.close();mock.restoreAll()})

test('连续读取50页正文，只读取指定页而不解析整份稿件清单',async()=>{
 const timings:number[]=[]
 for(const page of Object.values(document.pages)){
  const start=performance.now(),response=await fetch(pageUrl(page.id))
  assert.equal(response.status,200);assert.deepEqual(await response.json(),{page,version:hashes[page.id]})
  timings.push(performance.now()-start)
  assert.equal(response.headers.get('cache-control'),'private, max-age=31536000, immutable')
 }
 timings.sort((a,b)=>a-b)
 console.log('DESIGN_PAGE_READ '+JSON.stringify({pages:50,manifestBytes:manifestBytes.length,manifestReads,readBytes,p50Ms:timings[24],p75Ms:timings[37],p95Ms:timings[47],scope:'真实路由和页面读取；内存数据库夹具，无网络/数据库往返延迟'}))
 assert.equal(pageReads,50);assert.equal(manifestReads,0,'正文接口不能读取包含其他页版本索引的清单')
})
test('逐次授权与页面版本归属校验先于正文读取',async()=>{
 const before=pageReads
 allowed=false;assert.equal((await fetch(pageUrl())).status,403);allowed=true
 member=false;assert.equal((await fetch(pageUrl())).status,404);member=true
 assert.equal((await fetch(pageUrl('page-0','invalid'))).status,400)
 assert.equal(pageReads,before);assert.equal(authorizations,53)
})
