import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {spawnSync} from 'node:child_process'
import {pathToFileURL} from 'node:url'
import test from 'node:test'

const artifact=new URL('knowledge-shadow-pg-gate.mjs',import.meta.url)
const secret='SYNTHETIC_DEADLINE_DRIVER_ERROR_MUST_NOT_ESCAPE'
const tables=['knowledge_source_jobs','knowledge_sources','knowledge_notebook_bindings','organization_case_notebooks','organization_cases','projects'].sort()
const fixture={
  sources:[{id:'pg-a',company_id:'company-a',project_id:'project-a',conversation_id:null,external_source_id:'source:a',external_command_id:'command:a',status:'ready',stage:'ready',visibility_scope:'PROJECT',owner_user_id:'owner-a',created_by_user_id:'owner-a',created_via:'USER',kind:'file',mime_type:'text/plain',size_bytes:42,external_chunk_count:1,is_truncated:false,case_id:null,case_version:null,deleted:false}],
  projects:[{id:'project-a',company_id:'company-a',kind:'TEACHING',status:'ACTIVE',archived:false}],
  notebooks:[{project_id:'project-a',company_id:'company-a',external_key:'project-key-a',external_notebook_id:'notebook:a',state:'ready'}],
  case_notebooks:[],cases:[],jobs:[{id:'job-a',source_id:'pg-a',status:'completed',has_lease:false}],
}
const canonical=v=>JSON.stringify((function sorted(x){return Array.isArray(x)?x.map(sorted):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,sorted(x[k])])):x})(v))
const binding={format:'rag-shadow-bindings/v1',namespace:'open_notebook',source_database:'open_notebook',notebook_ids:['notebook:a'],sources:[{source_id:'source:a',company_id:'company-a',notebook_ids:['notebook:a']}],semantic_metadata:{company_ids:['company-a'],knowledge_sources:fixture.sources,projects:fixture.projects,knowledge_notebook_bindings:fixture.notebooks,organization_case_notebooks:[],organization_cases:[],knowledge_source_jobs:fixture.jobs}}
const config={format:'rag-shadow-pg-config/v1',mode:'gate',namespace:'open_notebook',source_database:'open_notebook',company_ids:['company-a'],source_ids:['source:a'],notebook_ids:['notebook:a'],rag_inventory_sha256:'1'.repeat(64),binding_manifest_sha256:createHash('sha256').update(canonical(binding)).digest('hex'),plan_sha256:'2'.repeat(64),verification_sha256:'3'.repeat(64)}

function invoke(scenario='cross-pg-deadline'){
  const directory=mkdtempSync(join(tmpdir(),'pg-gate-deadline-'))
  try{
    // Hermetic resolution supports a clean checkout without pg/node_modules installed.
    mkdirSync(join(directory,'node_modules/pg'),{recursive:true})
    writeFileSync(join(directory,'node_modules/pg/package.json'),'\u007b"type":"module","exports":"./index.mjs"\u007d')
    writeFileSync(join(directory,'node_modules/pg/index.mjs'),"throw Error('unmocked PostgreSQL driver is forbidden in this fixture')\n")
    const programPath=join(directory,'gate-under-test.mjs')
    writeFileSync(programPath,readFileSync(artifact)) // exact bytes; imports instantiate after mocks are registered
    const prefix=`import {mock} from 'node:test';import {writeSync} from 'node:fs';
      const scenario=${JSON.stringify(scenario)},fixture=${JSON.stringify(fixture)},tables=${JSON.stringify(tables)},secret=${JSON.stringify(secret)};
      const events=[];let clock=0,idleTimeout,identityCalls=0,ended=false,errorHandler;
      const advisory=[];const transactionStart='2026-10-22T00:00:01.000000+00:00';
      const event=(kind,details={})=>events.push({kind,clock,...details});
      mock.module('node:perf_hooks',{namedExports:{performance:{now:()=>clock}}});
      mock.module('node:timers/promises',{namedExports:{setTimeout:async(ms,value,options)=>{
        if(options?.ref===false)return new Promise(()=>{});
        event('pause',{ms});clock+=ms;return value;
      }}});
      class Client{
        constructor(options){if(options.connectionString!=='postgresql://fixture:fixture@127.0.0.1:1/never-connect')throw Error(secret)}
        on(name,handler){if(name==='error')errorHandler=handler}
        async connect(){event('connect')}
        async end(){ended=true;event('end')}
        async query(sql,args=[]){
          const tag=sql.match(/pg-gate:([a-z-]+)/)?.[1];event('query',{tag:tag??null,verb:sql.trim().split(/\\s/)[0]});
          if(sql.startsWith('SET idle_in_transaction_session_timeout='))idleTimeout=sql.match(/'([^']+)'/)[1];
          if(tag==='settings')return{rows:[{lock_timeout:'500ms',statement_timeout:'1500ms',idle_timeout:idleTimeout}]};
          if(tag&&Object.hasOwn(fixture,tag.replaceAll('-','_')))return{rows:fixture[tag.replaceAll('-','_')]};
          if(tag==='advisory'){const row={acquired:true,classid:'1',objid:String(advisory.length+1)};advisory.push(row);return{rows:[row]}};
          if(tag==='relations')return{rows:tables.map((relname,i)=>({relname,oid:100+i+(clock>=80000&&scenario==='relation-drift'?1000:0),relkind:'r'}))};
          if(tag==='identity'){
            identityCalls++;await Promise.resolve();const crossing=clock===79000;
            if(crossing){clock=80005;event('identity-crossed');if(scenario==='signal')process.emit('SIGTERM');if(scenario==='transport-error')errorHandler({code:'08006',message:secret});if(scenario==='identity-query-error')throw Object.assign(Error(secret),{code:'57014'})}
            const i={pg_backend_pid:101,pg_backend_start:'2026-10-22T00:00:00.000000+00:00',pg_transaction_start:transactionStart,observed_at:new Date(Date.parse(transactionStart)+(clock>=80000&&scenario!=='cross-pg-deadline'?79999:clock)).toISOString(),deadline_at:'2026-10-22T00:01:21.000000+00:00',database_oid:5};
            if(crossing){
              if(scenario==='identity-missing')return{rows:[]};
              if(scenario==='identity-malformed')i.pg_backend_start='malformed';
              if(scenario==='identity-pid-drift')i.pg_backend_pid=102;
              if(scenario==='identity-backend-drift')i.pg_backend_start='2026-10-22T00:00:00.100000+00:00';
              if(scenario==='identity-transaction-drift'){i.pg_transaction_start='2026-10-22T00:00:02.000000+00:00';i.deadline_at='2026-10-22T00:01:22.000000+00:00'};
              if(scenario==='identity-database-drift')i.database_oid=6;
            }
            return{rows:[i]};
          }
          if(tag==='locks'){
            event('lock-proof');if(clock>=80000&&scenario==='locks-query-error')throw Object.assign(Error(secret),{code:'57014'});
            const locks=[...tables.map((_,i)=>({locktype:'relation',mode:'ShareLock',granted:true,pid:101,database_oid:5,relation_oid:100+i})),...advisory.map(a=>({locktype:'advisory',mode:'ExclusiveLock',granted:true,pid:101,database_oid:5,classid:a.classid,objid:a.objid,objsubid:1}))];
            if(clock>=80000){if(scenario==='lock-missing')locks.shift();if(scenario==='lock-ungranted')locks[0].granted=false;if(scenario==='lock-mode')locks[0].mode='AccessShareLock';if(scenario==='lock-pid')locks[0].pid=102;if(scenario==='advisory-missing')locks.pop()};
            return{rows:locks};
          }
          if(sql==='ROLLBACK'){event('rollback');if(scenario==='rollback-error')throw Error(secret);return{rows:[]}};
          if(tag==='released'){event('release-proof');if(scenario==='release-query-error')throw Error(secret);return{rows:scenario==='release-missing'?[]:[{count:scenario==='release-nonzero'?1:0}]}};
          return{rows:[]};
        }
      }
      mock.module('pg',{defaultExport:{Client}});
      process.on('exit',()=>writeSync(1,'SYNTHETIC_DEADLINE_EVENTS='+JSON.stringify({events,identityCalls,ended})+'\\n'));
    `
    const child=spawnSync(process.execPath,['--experimental-test-module-mocks','--input-type=module','-e',prefix+'await import('+JSON.stringify(pathToFileURL(programPath).href)+');',JSON.stringify(config)],{cwd:directory,env:{...process.env,DATABASE_URL:'postgresql://fixture:fixture@127.0.0.1:1/never-connect'},encoding:'utf8',timeout:5000,maxBuffer:2*1024*1024})
    assert.ok(!child.error,'fixture '+(child.error?.code??'unknown')+' stdout tail '+child.stdout.slice(-700).replaceAll(secret,'[redacted]')+' stderr '+child.stderr.slice(-700).replaceAll(secret,'[redacted]'))
    assert.doesNotMatch(child.stdout+child.stderr,new RegExp(secret))
    const rows=child.stdout.split('\n').filter(line=>line.startsWith('{')).map(JSON.parse)
    const marker=child.stdout.split('\n').find(line=>line.startsWith('SYNTHETIC_DEADLINE_EVENTS='))
    assert.ok(marker,child.stderr);const trace=JSON.parse(marker.slice('SYNTHETIC_DEADLINE_EVENTS='.length))
    assert.ok(trace.events.some(e=>e.kind==='identity-crossed'),'fixture must reach the asynchronous boundary')
    return{status:child.status,rows,last:rows.at(-1),...trace}
  }finally{rmSync(directory,{recursive:true,force:true})}
}
function notDeadlineSuccess(r){assert.ok(!(r.status===0&&r.last?.status==='rolled-back'&&r.last.reason==='deadline'&&r.last.released===true),'expiry must not hide a failed identity/lock/release proof')}

test('an awaited valid identity crossing either PG or monotonic deadline ends cleanly after latest lock/release proof',()=>{
  for(const scenario of ['cross-pg-deadline','cross-monotonic-deadline']){
    const r=invoke(scenario);assert.equal(r.status,0,JSON.stringify({scenario,final:r.last}));assert.equal(r.last.status,'rolled-back');assert.equal(r.last.reason,'deadline');assert.equal(r.last.released,true);assert.equal(r.last.pg_backend_pid,101);assert.equal(r.last.pg_transaction_start,'2026-10-22T00:00:01.000000+00:00');assert.ok(r.rows.filter(row=>row.status==='held').length>0)
    assert.ok(r.events.some(e=>e.kind==='lock-proof'&&e.clock===80005),'latest exact locks must still be proved after identity completed')
    assert.equal(r.rows.filter(row=>row.status==='held').length,79,'no extra held receipt may be emitted after expiry')
    const rollback=r.events.findIndex(e=>e.kind==='rollback'),release=r.events.findIndex(e=>e.kind==='release-proof');assert.ok(rollback>=0&&release>rollback);assert.equal(r.ended,true)
  }
})
test('deadline cannot hide missing, malformed or changed backend/transaction identity',()=>{
  for(const scenario of ['identity-missing','identity-malformed','identity-pid-drift','identity-backend-drift','identity-transaction-drift','identity-database-drift']){const r=invoke(scenario);notDeadlineSuccess(r);assert.equal(r.status,1);assert.equal(r.last.status,'failed')}
})
test('identity/lock query failure and transport loss remain failures after expiry',()=>{
  for(const scenario of ['identity-query-error','locks-query-error','transport-error']){const r=invoke(scenario);notDeadlineSuccess(r);assert.equal(r.status,1);assert.equal(r.last.status,'failed')}
})
test('deadline does not bypass exact relation, advisory, granted, mode or PID lock evidence',()=>{
  for(const scenario of ['relation-drift','lock-missing','lock-ungranted','lock-mode','lock-pid','advisory-missing']){const r=invoke(scenario);notDeadlineSuccess(r);assert.equal(r.status,1);assert.equal(r.last.status,'failed')}
})
test('signal at the boundary is never relabelled as deadline success',()=>{
  const r=invoke('signal');notDeadlineSuccess(r);assert.equal(r.status,1);assert.equal(r.last.status,'failed')
})
test('rollback and release failures remain unproven regardless of a valid deadline identity',()=>{
  for(const scenario of ['rollback-error','release-query-error','release-missing','release-nonzero']){const r=invoke(scenario);notDeadlineSuccess(r);assert.equal(r.status,1);assert.equal(r.last.status,'failed');assert.equal(r.last.released,false);assert.equal(r.last.stage,'release-unproven')}
})
