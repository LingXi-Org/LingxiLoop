import assert from 'node:assert/strict'
import {readFileSync,existsSync,mkdtempSync,rmSync,statSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {spawnSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import test from 'node:test'
const artifact=new URL('knowledge-shadow-pg-gate.mjs',import.meta.url)
const privateSentinel='PRIVATE_PG_GATE_SENTINEL'
const config={format:'rag-shadow-pg-config/v1',mode:'collect',namespace:'open_notebook',source_database:'open_notebook',company_ids:['company-a'],source_ids:['source:a'],notebook_ids:['notebook:a'],rag_inventory_sha256:'1'.repeat(64)}
const fixture={
  sources:[{id:'pg-a',company_id:'company-a',project_id:'project-a',conversation_id:null,external_source_id:'source:a',external_command_id:'command:a',status:'ready',stage:'ready',visibility_scope:'PROJECT',owner_user_id:'owner-a',created_by_user_id:'owner-a',created_via:'USER',kind:'file',mime_type:'text/plain',size_bytes:42,external_chunk_count:1,is_truncated:false,case_id:null,case_version:null,deleted:false}],
  projects:[{id:'project-a',company_id:'company-a',kind:'TEACHING',status:'ACTIVE',archived:false}],
  notebooks:[{project_id:'project-a',company_id:'company-a',external_key:'project-key-a',external_notebook_id:'notebook:a',state:'ready'}],
  case_notebooks:[],cases:[],jobs:[{id:'job-a',source_id:'pg-a',status:'completed',has_lease:false}],
}
function invoke(change={},scenario='ok'){
  const root=mkdtempSync(join(tmpdir(),'pg-gate-test-'))
  const path=join(root,'private.json')
  const c={...config,output_path:path,...change}
  if(c.private_export)delete c.output_path
  if(c.mode==='resolve')delete c.company_ids
  const program=readFileSync(artifact,'utf8')
  const prefix=`import {mock} from 'node:test';const f=${JSON.stringify(fixture)},scenario=${JSON.stringify(scenario)},secret=${JSON.stringify(privateSentinel)};
    if(scenario==='orphan')f.sources[0].external_source_id='source:orphan';
    if(scenario==='cross-company')f.notebooks[0].company_id='other-company';
    if(scenario==='pending')f.jobs[0].status='processing';
    if(scenario==='semantic')f.projects[0].status='ARCHIVED';
    if(scenario==='touch')f.projects[0].updated_at='2099-01-01';
    if(scenario==='duplicate-source')f.sources.push({...f.sources[0]});
    const events=[];let idleTimeout;class Client{on(){}async connect(){events.push('connect');if(scenario==='connect-error')throw Error(secret)}async end(){events.push('end')}
      async query(sql,values){events.push(sql);if(scenario==='query-error')throw Error(secret);
        const tag=sql.match(/pg-gate:([a-z-]+)/)?.[1];
        if(sql.startsWith('SET idle_in_transaction_session_timeout='))idleTimeout=sql.match(/'([^']+)'/)[1];
        if(tag==='settings')return {rows:[{lock_timeout:'500ms',statement_timeout:'1500ms',idle_timeout:idleTimeout}]};
        if(tag==='identity')return {rows:[{pg_backend_pid:101,pg_backend_start:'2026-10-22T00:00:00.000000+00:00',pg_transaction_start:'2026-10-22T00:00:01.000000+00:00',observed_at:'2026-10-22T00:00:02.000000+00:00',deadline_at:'2026-10-22T00:01:21.000000+00:00',database_oid:5}]};
        if(tag&&Object.hasOwn(f,tag.replaceAll('-','_')))return {rows:f[tag.replaceAll('-','_')]};
        if(tag==='resolve-sources')return {rows:f.sources};
        if(tag==='resolve-project-notebooks')return {rows:f.notebooks.map(row=>({...row,project_company_id:f.projects.find(p=>p.id===row.project_id)?.company_id}))};
        if(tag==='resolve-case-notebooks')return {rows:f.case_notebooks};
        if(tag==='resolve-cases')return {rows:f.cases};
        if(tag==='released')return {rows:[{count:0}]};
        return {rows:[]};}}
    mock.module('pg',{defaultExport:{Client}});process.on('exit',()=>console.log('SYNTHETIC_QUERY_EVENTS='+JSON.stringify(events.map(s=>s.split('\\n')[0]))));
  `
  const child=spawnSync(process.execPath,['--experimental-test-module-mocks','--input-type=module','-e',prefix+program,JSON.stringify(c)],{encoding:'utf8',timeout:10000,env:{...process.env,DATABASE_URL:'postgresql://synthetic:synthetic@127.0.0.1:1/fixture'}})
  assert.ifError(child.error)
  assert.doesNotMatch(child.stdout+child.stderr,new RegExp(privateSentinel))
  const rows=child.stdout.split('\n').filter(s=>s.startsWith('{')).map(s=>JSON.parse(s))
  const file=existsSync(path)?readFileSync(path):null
  const permissions=existsSync(path)?statSync(path).mode&0o777:null
  const events=JSON.parse(child.stdout.split('\n').find(s=>s.startsWith('SYNTHETIC_QUERY_EVENTS='))?.slice('SYNTHETIC_QUERY_EVENTS='.length)||'[]')
  rmSync(root,{recursive:true,force:true})
  return {child,rows,file,permissions,events}
}
test('collector is private deterministic and read-only; observation timestamps do not change semantic bytes',()=>{
  const a=invoke(),b=invoke({},'touch'),c=invoke({},'semantic')
  assert.equal(a.child.status,0,a.child.stderr)
  assert.equal(a.permissions,0o600)
  assert.equal(a.file.toString(),b.file.toString())
  assert.notEqual(a.file.toString(),c.file.toString())
  assert.equal(JSON.parse(a.file).format,'rag-shadow-bindings/v1')
  assert.equal(a.rows[0].sources,1)
  assert.doesNotMatch(a.child.stdout,/source:a|pg-a|project-a|owner-a|notebook:a/)
  assert.ok(a.events.some(s=>s==='BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'))
  assert.ok(a.events.includes('ROLLBACK'))
  assert.ok(!a.events.some(s=>/^\s*(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|COMMIT|LOCK)\b/i.test(s)))
})
for(const scenario of ['orphan','cross-company','pending','connect-error','query-error'])test(`collector rejects ${scenario} without private file or unsafe error`,()=>{
  const r=invoke({},scenario);assert.equal(r.child.status,1);assert.equal(r.file,null);assert.equal(r.rows.at(-1).status,'failed')
})
for(const change of [{company_ids:[]},{source_ids:['source:a','source:a']},{source_ids:['a','b','c','d','e']},{notebook_ids:['notebook:a','notebook:b','notebook:c','notebook:d','notebook:e','notebook:f']},{extra:'forbidden'},{rag_inventory_sha256:'invalid'},{mode:'gate'}])test(`invalid config fails before connecting ${JSON.stringify(change)}`,()=>{
  const r=invoke(change);assert.equal(r.child.status,1);assert.ok(!r.events.includes('connect'));assert.equal(r.file,null)
})
function decodePrivate(r){
  const envelope=r.rows.find(row=>row.format==='rag-shadow-pg-private/v1')
  assert.equal(envelope.private,true);assert.equal(envelope.encoding,'base64')
  const bytes=Buffer.from(envelope.payload_base64,'base64')
  assert.equal(bytes.length,envelope.bytes)
  assert.equal(createHash('sha256').update(bytes).digest('hex'),envelope.payload_sha256)
  return {envelope,payload:JSON.parse(bytes),bytes}
}
test('private collector transport is explicit bounded canonical base64 with matching aggregate hash',()=>{
  const exported=invoke({private_export:'canonical-base64/v1'}),local=invoke()
  assert.equal(exported.child.status,0,exported.child.stderr)
  const {bytes,envelope}=decodePrivate(exported)
  assert.equal(bytes.toString(),local.file.toString());assert.equal(exported.file,null)
  assert.equal(exported.rows.at(-1).binding_manifest_sha256,envelope.payload_sha256)
  assert.ok(bytes.length<=256*1024)
})
test('resolve reads only exact RAG identity sets and exports authoritative owner metadata without company enumeration',()=>{
  const r=invoke({mode:'resolve',private_export:'canonical-base64/v1'})
  assert.equal(r.child.status,0,r.child.stderr)
  const {payload}=decodePrivate(r)
  assert.equal(payload.format,'rag-shadow-pg-resolve/v1');assert.deepEqual(payload.company_ids,['company-a'])
  assert.deepEqual(payload.notebook_ids,['notebook:a']);assert.deepEqual(payload.source_ids,['source:a'])
  assert.equal(r.rows.at(-1).status,'resolved');assert.equal(r.file,null)
  assert.ok(r.events.some(row=>row.includes('pg-gate:resolve-sources')))
  assert.ok(!r.events.some(row=>row.includes('pg-gate:sources')))
})
for(const scenario of ['orphan','cross-company','duplicate-source'])test(`resolve refuses ${scenario} without private export`,()=>{
  const r=invoke({mode:'resolve',private_export:'canonical-base64/v1'},scenario)
  assert.equal(r.child.status,1);assert.ok(!r.rows.some(row=>row.private));assert.equal(r.file,null)
})
test('resolve missing notebook and private export on gate are rejected',()=>{
  const missing=invoke({mode:'resolve',private_export:'canonical-base64/v1',notebook_ids:['notebook:a','notebook:missing']})
  assert.equal(missing.child.status,1);assert.ok(!missing.rows.some(row=>row.private))
  const gate=invoke({mode:'gate',private_export:'canonical-base64/v1'})
  assert.equal(gate.child.status,1);assert.ok(!gate.events.includes('connect'))
})
