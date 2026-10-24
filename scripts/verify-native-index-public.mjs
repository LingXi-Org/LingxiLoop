import assert from 'node:assert/strict';
import {readFile,writeFile}from'node:fs/promises';
import {createServer}from'node:http';
import {createHash}from'node:crypto';
import{createRequire}from'node:module';
import{resolve}from'node:path';
const fixtureRequire=createRequire(resolve(process.env.NATIVE_INDEX_FIXTURE_ROOT||'/workspace/LingxiOS','package.json'));
const{PGlite}=await import(fixtureRequire.resolve('@electric-sql/pglite'));
import{createLingxiOS,packageResources,releaseVersions}from'@lyyzka/lingxios';
import{createWorker}from'@lyyzka/lingxios/worker';
const db=new PGlite(),pool={query:async(sql,args)=>{const r=await db.query(sql,args);return{rows:r.rows,rowCount:r.affectedRows??r.rows.length}},connect:async()=>({query:pool.query,release(){}})};
const scope={tenantId:'synthetic-company',scopeType:'learner',scopeId:'synthetic-scope'},identity={tenantId:scope.tenantId,agentId:'synthetic-agent',principalId:'synthetic-principal',sessionId:'synthetic-session',workId:'synthetic-index-source'};
const receipts=[];let app,worker,changed=false,requests=0,expectedModel,result;
const server=createServer((req,res)=>{const b=[];req.on('data',x=>b.push(x));req.on('end',()=>{const p=JSON.parse(Buffer.concat(b));assert.equal(p.model,expectedModel);requests++;res.setHeader('content-type','application/json');res.end(JSON.stringify({model:p.model,data:p.input.map((_,index)=>({index,embedding:Array.from({length:1024},(_,i)=>i===0?1:0)})),usage:{prompt_tokens:p.input.length,total_tokens:p.input.length}}))})});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const baseUrl='http://127.0.0.1:'+server.address().port+'/v1';
const model={modelId:'synthetic-unused-chat',contextWindowTokens:200000,run:async()=>{throw Error('unexpected foreground model')},structured:async()=>{throw Error('unexpected structured model')},compact:async()=>{throw Error('unexpected compaction')}};
async function open(id){expectedModel=id;app=await createLingxiOS({database:pool,background:{role:'passive'},modelBudget:{maxModelCalls:1000,maxTokens:1000000},memory:{resolveScopes:async actor=>actor.tenantId===identity.tenantId&&actor.principalId===identity.principalId?[scope]:[],embeddings:{id,apiKey:'synthetic-local-only',baseUrl,expectedDimensions:1024,indexVersion:'memory-v1',requestTimeoutMs:3000,inputCostMicrosPerMillion:id.startsWith('Pro/')?10000:0}}});worker=createWorker({controlPlane:app,model,worker:{id:'synthetic-native-index',concurrency:1},modelBudget:{maxModelCalls:1000,maxTokens:1000000}})}
async function close(){await worker?.stop();worker=undefined;await app?.stop();app=undefined}
async function drain(){let jobs=0;while(await worker.runNext())assert.ok(++jobs<=96);return jobs}
try{
 await db.exec(await readFile(packageResources().schema,'utf8'));
 await open('BAAI/bge-m3');
 await app.enqueueJob({id:identity.workId,tenantId:identity.tenantId,agentId:identity.agentId,principalId:identity.principalId,sessionId:identity.sessionId,text:'Synthetic maintenance source; no real conversation',kind:'turn',lane:'interactive',availableAt:'2099-01-01T00:00:00.000Z'});
 const initialized={documents:[]};
 for(let batch=0;batch<4;batch++){const part=await app.memory.initialize(identity,{scope,idempotencyKey:'synthetic-init-'+batch,sourceRef:'synthetic-local-manifest',documents:Array.from({length:10},(_,index)=>{const i=batch*10+index;return{path:'notes/'+i+'.md',title:'Synthetic note '+i,description:'Synthetic migration fixture',body:'Synthetic memory content '+i,layer:'reference'}})});initialized.documents.push(...part.documents)}
 assert.equal(initialized.documents.length,40);
 const oldBefore=(await app.memory.doctor(identity,scope)).index;assert.equal(oldBefore.eligible,40);assert.equal(oldBefore.indexed,0);
 const initial=await app.memory.reindex(identity,scope);assert.ok(initial.queued<=32);const oldJobs=await drain();
 const old=(await app.memory.doctor(identity,scope)).index;assert.equal(old.indexed,40);receipts.push({model:'BAAI/bge-m3',...old,jobs:oldJobs});
 await close();await open('Pro/BAAI/bge-m3');
 const nextBefore=(await app.memory.doctor(identity,scope)).index;assert.notEqual(nextBefore.key,old.key);assert.equal(nextBefore.eligible,40);assert.equal(nextBefore.indexed,0);
 const pass=await app.memory.reindex(identity,scope);assert.equal(pass.configured,true);assert.equal(pass.queued,32);const nextJobs=await drain();assert.equal(nextJobs,40);
 const next=(await app.memory.doctor(identity,scope)).index;assert.equal(next.indexed,40);receipts.push({model:'Pro/BAAI/bge-m3',...next,jobs:nextJobs});
 await close();await open('BAAI/bge-m3');const oldRetained=(await app.memory.doctor(identity,scope)).index;assert.equal(oldRetained.key,old.key);assert.equal(oldRetained.indexed,40);receipts.push({model:'BAAI/bge-m3-retained-before-update',...oldRetained});
 await close();await open('Pro/BAAI/bge-m3');
 await assert.rejects(app.memory.doctor({...identity,tenantId:'foreign-company'},scope));
 const victim=initialized.documents[0];await app.memory.apply(identity,{scope,changes:[{action:'update',id:victim.id,expectedVersion:1,content:{path:victim.path,title:victim.title,description:victim.description,body:'Synthetic updated version',layer:'reference'}}],idempotencyKey:'synthetic-update',sourceRef:'synthetic-version-change'});
 assert.equal((await app.memory.doctor(identity,scope)).index.indexed,39);await drain();assert.equal((await app.memory.doctor(identity,scope)).index.indexed,40);changed=true;
 await close();await open('BAAI/bge-m3');const retained=(await app.memory.doctor(identity,scope)).index;assert.equal(retained.key,old.key);assert.equal(retained.eligible,40);assert.equal(retained.indexed,39);receipts.push({model:'BAAI/bge-m3-retained',...retained});
 const usage=(await app.readOperations()).models,usageModels=[...new Set(usage.filter(o=>o.calls>0).map(o=>o.model))];assert.ok(usageModels.includes('BAAI/bge-m3')&&usageModels.includes('Pro/BAAI/bge-m3'));
 result={format:'synthetic-public-native-index-retention/v1',passed:true,checkedAt:new Date().toISOString(),runtime:releaseVersions,scope:'synthetic-only',paidProviderRequests:0,providerRequests:requests,receipts,observedEmbeddingModels:usageModels,checks:{separateRequestedModelKeys:true,initialAdmission32:true,automaticRemainingPage:true,currentVersionExclusion:changed,foreignTenantRejected:true,oldModelCurrentRowsRetained:true},scriptSha256:createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex')};
}finally{await close();server.closeAllConnections();await new Promise(r=>server.close(r));await db.close()}
result.cleanupCompleted=true;
await writeFile(process.env.NATIVE_INDEX_PUBLIC_RESULT||'/tmp/native-memory-index-public-api-result.json',JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify(result));
