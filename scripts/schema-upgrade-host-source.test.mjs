import assert from 'node:assert/strict'
import test from 'node:test'
import {createHash} from 'node:crypto'
import {createOperations,createTransport} from './schema-upgrade-komodo.mjs'
import {deriveHostSource,verifyHostSource} from './schema-upgrade-host-source.mjs'

const commit='a'.repeat(40),branch='release/production-fixture',body='name: fixture\nservices: {}\n'
const sha256=createHash('sha256').update(body).digest('hex')
const names=['lingxiloop-app-a','lingxiloop-app-b','lingxiloop-core-state']
const server=stack=>stack.endsWith('-b')?'shanghai-b':'shanghai-a'
const serverId=stack=>(stack.endsWith('-b')?'b':'a').repeat(24)
const hostSource={mode:'host',branch,stacks:names.map(stack=>({stack,server:server(stack),sha256}))}
const plan={format:2,pinCommit:commit,hostSource,target:{sha:commit}}
const idle=Object.fromEntries(['pulling','deploying','starting','restarting','pausing','unpausing','stopping','destroying'].map(k=>[k,false]))
function fixture(change=()=>{}) {
 const calls=[],details=new Map(names.map(stack=>[stack,{_id:{$oid:(stack.endsWith('-b')?'d':'c').repeat(24)},config:{
  server_id:serverId(stack),swarm_id:'',repo:'LingXi-Org/LingxiLoop',branch,commit,reclone:false,clone_path:'',
  files_on_host:true,git_account:'',registry_account:'',linked_repo:'',file_contents:'',run_directory:`deploy/komodo/${stack}`,
  file_paths:['compose.yml'],additional_env_files:[],config_files:[],env_file_path:'.env',
  auto_update:false,auto_update_all_services:false,poll_for_updates:false,run_build:false,destroy_before_deploy:false,
  project_name:'',compose_cmd_wrapper:'',extra_args:[],build_extra_args:[],
  pre_deploy:{path:'',command:'',shell_mode:false},post_deploy:{path:'',command:'',shell_mode:false},
  ignore_services:stack.endsWith('core-state')?[]:['db-migrate'],
 },info:{remote_contents:[{path:'compose.yml',contents:body}],remote_errors:[],missing_files:[]}}]))
 const servers=['a','b'].map(side=>({id:side.repeat(24),name:`shanghai-${side}`,info:{state:'Ok'}}))
 const transport={
  async read(op,p){calls.push({op,p});change({op,p,details,servers,calls})
   if(op==='GetProcedureActionState')return {running:false}
   if(op==='ListServers')return structuredClone(servers)
   if(op==='GetStackActionState')return idle
   if(op==='GetStack')return structuredClone(details.get(p.stack))
   if(op==='ListStackServices')return []
   throw Error('Unexpected fixture read')
  },
  async refreshStackCache(stack){calls.push({op:'RefreshStackCache',p:{stack}});change({op:'RefreshStackCache',p:{stack},details,servers,calls})},
  async execute(op,p){calls.push({op,p});return {status:'Complete',success:true,logs:[{stdout:'SCHEMA_UPGRADE_METADATA={"sha":"'+commit+'"}'}]}},
 }
 return {calls,details,servers,transport}
}
test('host verification refreshes every actual stack and emits only fixed hash evidence',async()=>{
 const f=fixture(),events=[]
 await verifyHostSource({plan,transport:f.transport,onProgress:async e=>events.push(e)})
 assert.deepEqual(f.calls.filter(x=>x.op==='RefreshStackCache').map(x=>x.p.stack),names)
 assert.equal(events.length,3);assert.equal(JSON.stringify(events).includes(body),false)
 assert.ok(events.every(x=>x.sha256===sha256&&Number.isFinite(x.durationMs)))
})
test('all source/path/hook drift and remote errors fail closed without an execute',async()=>{
 const changes=[
  d=>d.config.git_account='fixture-account',d=>d.config.registry_account='fixture-account',d=>d.config.files_on_host=false,d=>d.config.reclone=true,d=>d.config.clone_path='/tmp/other',
  d=>d.config.branch='main',d=>d.config.commit='b'.repeat(40),d=>d.config.server_id='f'.repeat(24),
  d=>d.config.run_directory='..',d=>d.config.env_file_path='/tmp/new.env',
  d=>d.config.file_paths.push('override.yml'),d=>d.config.additional_env_files.push('secret.env'),
  d=>d.config.config_files.push({path:'private'}),d=>d.config.auto_update=true,
  d=>d.config.auto_update_all_services=true,d=>d.config.pre_deploy.command='unexpected',
  d=>d.config.post_deploy.command='unexpected',d=>d.config.compose_cmd_wrapper='unexpected',
  d=>d.config.project_name='other',d=>d.config.extra_args=['--project-directory=/tmp'],
  d=>d.info.remote_contents[0].contents+='drift',d=>d.info.remote_contents.push(d.info.remote_contents[0]),
  d=>d.info.remote_errors.push({contents:'private response'}),d=>d.info.missing_files.push('compose.yml'),
 ]
 for(const change of changes){
  const f=fixture();change(f.details.get(names[1]))
  await assert.rejects(verifyHostSource({plan,transport:f.transport}),e=>!e.message.includes('private response'))
  assert.equal(f.calls.some(x=>['RunStackService','StopStack','DeployStack'].includes(x.op)),false)
 }
})
test('host unavailable after refresh cannot pass using retained matching cache',async()=>{
 const f=fixture(({op,servers})=>{if(op==='RefreshStackCache')servers[0].info.state='NotOk'})
 await assert.rejects(verifyHostSource({plan,transport:f.transport}))
})
test('maintenance operations check the actual relevant host before metadata, stop, pull and deploy',async()=>{
 for(const [method,args] of [['metadata',[names[1]]],['stop',[names[1],'worker']],['pull',[names[1]]],['deploy',[names[1],'worker']],['state',[]],['migrate',[]]]){
  const f=fixture();f.details.get(method==='state'?names[2]:method==='migrate'?names[0]:names[1]).info.remote_contents[0].contents+='changed'
  const ops=createOperations({plan,transport:f.transport})
  await assert.rejects(ops[method](...args))
  assert.equal(f.calls.some(x=>['RunStackService','StopStack','DeployStack','PullStack'].includes(x.op)),false,method)
 }
})
test('B metadata executes on B after host proof; arbitrary destinations are rejected',async()=>{
 const f=fixture(),ops=createOperations({plan,transport:f.transport})
 await ops.metadata(names[1])
 assert.equal(f.calls.at(-1).op,'RunStackService');assert.equal(f.calls.at(-1).p.stack,names[1])
 await assert.rejects(ops.metadata('other-stack'))
})
test('transport exposes only fixed host-cache refresh, never an arbitrary write',async()=>{
 const calls=[],t=createTransport({apiKey:'fixture',apiSecret:'fixture',fetcher:async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return Response.json({})}})
 await t.refreshStackCache(names[0])
 assert.deepEqual(calls,[{url:'https://ops.christmas1314.xyz/write/RefreshStackCache',body:{stack:names[0]}}])
 await assert.rejects(t.refreshStackCache('other-stack'));assert.equal(calls.length,1)
 assert.equal(t.write,undefined)
})
test('descriptor derives actual committed Compose bytes and rejects unsafe branch names',async()=>{
 const {execFileSync}=await import('node:child_process')
 const exact=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()
 const d=await deriveHostSource({pinCommit:exact,branch})
 assert.equal(d.stacks.length,3)
 for(const row of d.stacks){const bytes=execFileSync('git',['show',`${exact}:deploy/komodo/${row.stack}/compose.yml`]);assert.equal(row.sha256,createHash('sha256').update(bytes).digest('hex'))}
 for(const invalid of ['main','../release','release/x y','release/x\n','release/x..y'])await assert.rejects(deriveHostSource({pinCommit:exact,branch:invalid}))
})
