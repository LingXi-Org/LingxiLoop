// Reviewed operator artifact. Execute these fixed bytes with node --input-type=module -e.
// argv[1] is a private, non-secret finite scope JSON. DATABASE_URL remains in env only.
import {createHash} from 'node:crypto'
import {open,realpath,stat} from 'node:fs/promises'
import {dirname,isAbsolute} from 'node:path'
import {setTimeout as pause} from 'node:timers/promises'
import {performance} from 'node:perf_hooks'

const TABLES=['knowledge_source_jobs','knowledge_sources','knowledge_notebook_bindings','organization_case_notebooks','organization_cases','projects'].sort()
const CAP=128,HOLD_MS=80000
const hash=bytes=>createHash('sha256').update(bytes).digest('hex')
const compare=(a,b)=>a<b?-1:a>b?1:0
function canonical(value){
  if(value===null||typeof value==='string'||typeof value==='boolean')return JSON.stringify(value)
  if(typeof value==='number'&&Number.isSafeInteger(value))return String(value)
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']'
  if(value&&Object.getPrototypeOf(value)===Object.prototype)return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}'
  throw Error('invalid-semantic-value')
}
function requireTrue(value){if(!value)throw Error('refused')}
const text=(v,max=512)=>typeof v==='string'&&v.length>0&&Buffer.byteLength(v)<=max&&!/[\x00-\x1f\x7f]/.test(v)
const hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)
const sorted=values=>[...values].sort()
const equal=(a,b)=>canonical(a)===canonical(b)
function list(value,max,prefix){requireTrue(Array.isArray(value)&&value.length>0&&value.length<=max&&value.every(v=>text(v)&&(!prefix||v.startsWith(prefix)))&&new Set(value).size===value.length);return sorted(value)}
function emit(value){process.stdout.write(JSON.stringify(value)+'\n')}
let stage='input',client,connected=false,began=false,transportError=false,failure=false,released=false,result,hardClose,hardExit,signal=false,privateExport,driverSqlstate
let activeIdentity,locked=false
const onSignal=()=>{signal=true}
process.on('SIGINT',onSignal);process.on('SIGTERM',onSignal)
const query=async(sql,args=[])=>{requireTrue(!transportError);try{return (await client.query(sql,args)).rows}catch(error){if(/^[0-9A-Z]{5}$/.test(error?.code))driverSqlstate=error.code;throw Error('query-refused')}}
function projection(rows,fields){
  requireTrue(rows.length<=CAP)
  return rows.map(row=>Object.fromEntries(fields.map(field=>{requireTrue(Object.hasOwn(row,field));return [field,row[field]]}))).sort((a,b)=>compare(canonical(a),canonical(b)))
}
async function resolveOwners(c){
  const sources=projection(await query(`/*pg-gate:resolve-sources*/ SELECT id,company_id,project_id,external_source_id,visibility_scope,case_id
    FROM public.knowledge_sources WHERE external_source_id=ANY($1::text[]) ORDER BY id LIMIT $2`,[c.source_ids,CAP+1]),['id','company_id','project_id','external_source_id','visibility_scope','case_id'])
  const notebooks=projection(await query(`/*pg-gate:resolve-project-notebooks*/ SELECT b.project_id,b.company_id,b.external_notebook_id,b.state,p.company_id AS project_company_id
    FROM public.knowledge_notebook_bindings b LEFT JOIN public.projects p ON p.id=b.project_id
    WHERE b.external_notebook_id=ANY($1::text[]) ORDER BY b.project_id LIMIT $2`,[c.notebook_ids,CAP+1]),['project_id','company_id','external_notebook_id','state','project_company_id'])
  const caseNotebooks=projection(await query(`/*pg-gate:resolve-case-notebooks*/ SELECT company_id,external_notebook_id
    FROM public.organization_case_notebooks WHERE external_notebook_id=ANY($1::text[]) ORDER BY company_id LIMIT $2`,[c.notebook_ids,CAP+1]),['company_id','external_notebook_id'])
  requireTrue(sources.length===c.source_ids.length&&new Set(sources.map(row=>row.external_source_id)).size===sources.length&&equal(sorted(sources.map(row=>row.external_source_id)),c.source_ids))
  const caseIds=sorted([...new Set(sources.map(row=>row.case_id).filter(id=>id!==null))])
  const cases=projection(await query(`/*pg-gate:resolve-cases*/ SELECT id,company_id FROM public.organization_cases WHERE id=ANY($1::text[]) ORDER BY id LIMIT $2`,[caseIds,CAP+1]),['id','company_id'])
  requireTrue(cases.length===caseIds.length&&new Set(cases.map(row=>row.id)).size===cases.length&&equal(sorted(cases.map(row=>row.id)),caseIds))
  const owners=[]
  for(const row of notebooks){requireTrue(text(row.company_id)&&row.project_company_id===row.company_id&&row.state==='ready'&&text(row.project_id));owners.push({notebook_id:row.external_notebook_id,company_id:row.company_id,kind:'project',project_id:row.project_id})}
  for(const row of caseNotebooks){requireTrue(text(row.company_id));owners.push({notebook_id:row.external_notebook_id,company_id:row.company_id,kind:'case'})}
  requireTrue(owners.length===c.notebook_ids.length&&new Set(owners.map(row=>row.notebook_id)).size===owners.length&&equal(sorted(owners.map(row=>row.notebook_id)),c.notebook_ids))
  const bindings=[]
  for(const source of sources){
    requireTrue(text(source.id)&&text(source.company_id))
    let matches
    if(source.visibility_scope==='COMPANY_CASE'){
      requireTrue(source.project_id===null&&cases.find(row=>row.id===source.case_id)?.company_id===source.company_id)
      matches=owners.filter(row=>row.kind==='case'&&row.company_id===source.company_id)
    }else{
      requireTrue(['PRIVATE','PROJECT'].includes(source.visibility_scope)&&source.case_id===null)
      matches=owners.filter(row=>row.kind==='project'&&row.project_id===source.project_id&&row.company_id===source.company_id)
    }
    requireTrue(matches.length===1)
    bindings.push({source_id:source.external_source_id,company_id:source.company_id,notebook_ids:[matches[0].notebook_id]})
  }
  const companyIds=list([...new Set(owners.map(row=>row.company_id))],5)
  const payload={format:'rag-shadow-pg-resolve/v1',namespace:c.namespace,source_database:c.source_database,source_ids:c.source_ids,notebook_ids:c.notebook_ids,company_ids:companyIds,
    sources:bindings.sort((a,b)=>compare(a.source_id,b.source_id)),notebooks:owners.sort((a,b)=>compare(a.notebook_id,b.notebook_id))}
  const bytes=canonical(payload);requireTrue(Buffer.byteLength(bytes)<=256*1024)
  return {bytes,sha:hash(bytes),counts:{companies:companyIds.length,sources:sources.length,notebooks:owners.length}}
}
async function collect(c){
  const args=[c.company_ids,CAP+1]
  const sources=projection(await query(`/*pg-gate:sources*/
    SELECT id,company_id,project_id,conversation_id,external_source_id,external_command_id,status,stage,
      visibility_scope,owner_user_id,created_by_user_id,created_via,kind,mime_type,size_bytes,external_chunk_count,
      is_truncated,case_id,case_version,(deleted_at IS NOT NULL) AS deleted
    FROM public.knowledge_sources WHERE company_id=ANY($1::text[]) ORDER BY id LIMIT $2`,args),
    ['id','company_id','project_id','conversation_id','external_source_id','external_command_id','status','stage','visibility_scope','owner_user_id','created_by_user_id','created_via','kind','mime_type','size_bytes','external_chunk_count','is_truncated','case_id','case_version','deleted'])
  const projects=projection(await query(`/*pg-gate:projects*/ SELECT id,company_id,kind,status,(archived_at IS NOT NULL) AS archived
    FROM public.projects WHERE company_id=ANY($1::text[]) ORDER BY id LIMIT $2`,args),['id','company_id','kind','status','archived'])
  const notebooks=projection(await query(`/*pg-gate:notebooks*/ SELECT project_id,company_id,external_key,external_notebook_id,state
    FROM public.knowledge_notebook_bindings WHERE company_id=ANY($1::text[]) ORDER BY project_id LIMIT $2`,args),['project_id','company_id','external_key','external_notebook_id','state'])
  const caseNotebooks=projection(await query(`/*pg-gate:case-notebooks*/ SELECT company_id,external_notebook_id
    FROM public.organization_case_notebooks WHERE company_id=ANY($1::text[]) ORDER BY company_id LIMIT $2`,args),['company_id','external_notebook_id'])
  const cases=projection(await query(`/*pg-gate:cases*/ SELECT id,company_id,status,version,published_version,source_id,(published IS NOT NULL) AS has_published
    FROM public.organization_cases WHERE company_id=ANY($1::text[]) ORDER BY id LIMIT $2`,args),['id','company_id','status','version','published_version','source_id','has_published'])
  const jobs=projection(await query(`/*pg-gate:jobs*/ SELECT j.id,j.source_id,j.status,(j.leased_by IS NOT NULL OR j.leased_until IS NOT NULL) AS has_lease
    FROM public.knowledge_source_jobs j JOIN public.knowledge_sources s ON s.id=j.source_id
    WHERE s.company_id=ANY($1::text[]) ORDER BY j.id LIMIT $2`,args),['id','source_id','status','has_lease'])
  requireTrue([...sources,...projects,...notebooks,...caseNotebooks,...cases].every(row=>c.company_ids.includes(row.company_id)))
  const byProject=new Map(projects.map(row=>[row.id,row])),bySource=new Map(sources.map(row=>[row.id,row])),byCase=new Map(cases.map(row=>[row.id,row]))
  requireTrue(byProject.size===projects.length&&bySource.size===sources.length&&byCase.size===cases.length)
  const notebookByProject=new Map(),notebookByCompany=new Map(),allNotebooks=[]
  for(const row of notebooks){
    requireTrue(!notebookByProject.has(row.project_id)&&row.state==='ready'&&text(row.external_key)&&text(row.external_notebook_id)&&row.external_notebook_id.startsWith('notebook:')&&byProject.get(row.project_id)?.company_id===row.company_id)
    notebookByProject.set(row.project_id,row);allNotebooks.push(row.external_notebook_id)
  }
  for(const row of caseNotebooks){
    requireTrue(!notebookByCompany.has(row.company_id)&&text(row.external_notebook_id)&&row.external_notebook_id.startsWith('notebook:'))
    notebookByCompany.set(row.company_id,row);allNotebooks.push(row.external_notebook_id)
  }
  requireTrue(new Set(allNotebooks).size===allNotebooks.length&&equal(sorted(allNotebooks),c.notebook_ids))
  const bindings=[]
  for(const row of sources){
    requireTrue(text(row.id)&&typeof row.deleted==='boolean'&&text(row.owner_user_id)&&text(row.created_by_user_id)&&text(row.status)&&text(row.stage)&&!['queued','processing'].includes(row.status))
    if(row.external_source_id===null){requireTrue(row.deleted);continue}
    requireTrue(text(row.external_source_id)&&row.external_source_id.startsWith('source:'))
    let binding
    if(row.visibility_scope==='COMPANY_CASE'){
      const caseRow=byCase.get(row.case_id)
      requireTrue(row.project_id===null&&row.conversation_id===null&&caseRow?.company_id===row.company_id&&Number.isSafeInteger(row.case_version)&&row.case_version>0)
      binding=notebookByCompany.get(row.company_id)
    }else{
      requireTrue(['PRIVATE','PROJECT'].includes(row.visibility_scope)&&row.case_id===null&&row.case_version===null&&byProject.get(row.project_id)?.company_id===row.company_id)
      binding=notebookByProject.get(row.project_id)
    }
    requireTrue(binding?.company_id===row.company_id)
    bindings.push({source_id:row.external_source_id,company_id:row.company_id,notebook_ids:[binding.external_notebook_id]})
  }
  requireTrue(bindings.length===c.source_ids.length&&new Set(bindings.map(row=>row.source_id)).size===bindings.length&&equal(sorted(bindings.map(row=>row.source_id)),c.source_ids))
  for(const row of cases){
    requireTrue(['draft','published','unpublished'].includes(row.status)&&Number.isSafeInteger(row.version)&&row.version>0)
    if(row.source_id!==null){const source=bySource.get(row.source_id);requireTrue(source?.company_id===row.company_id&&source.case_id===row.id)}
    if(row.status==='published'){const source=bySource.get(row.source_id);requireTrue(row.has_published===true&&Number.isSafeInteger(row.published_version)&&source?.case_version===row.published_version&&!source.deleted)}
  }
  requireTrue(new Set(jobs.map(row=>row.id)).size===jobs.length&&jobs.every(row=>bySource.has(row.source_id)&&['completed','failed'].includes(row.status)&&row.has_lease===false))
  requireTrue(c.company_ids.every(company=>bindings.some(row=>row.company_id===company)||notebooks.some(row=>row.company_id===company)||caseNotebooks.some(row=>row.company_id===company)))
  const payload={format:'rag-shadow-bindings/v1',namespace:c.namespace,source_database:c.source_database,notebook_ids:c.notebook_ids,
    sources:bindings.sort((a,b)=>a.source_id<b.source_id?-1:a.source_id>b.source_id?1:0),semantic_metadata:{company_ids:c.company_ids,
      knowledge_sources:sources,projects,knowledge_notebook_bindings:notebooks,organization_case_notebooks:caseNotebooks,organization_cases:cases,knowledge_source_jobs:jobs}}
  const bytes=canonical(payload);requireTrue(Buffer.byteLength(bytes)<=256*1024)
  return {bytes,sha:hash(bytes),keys:sorted([...projects.map(row=>'open-notebook:'+row.id),...c.company_ids.map(id=>'lingxiloop:company-cases:'+id)]),
    counts:{companies:c.company_ids.length,sources:bindings.length,notebooks:allNotebooks.length,projects:projects.length,cases:cases.length,jobs:jobs.length}}
}
async function identity({allowExpired=false}={}){
  const rows=await query(`/*pg-gate:identity*/ SELECT pg_backend_pid() AS pg_backend_pid,a.datid::int AS database_oid,
    to_char(a.backend_start AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US')||'+00:00' AS pg_backend_start,
    to_char(a.xact_start AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US')||'+00:00' AS pg_transaction_start,
    to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US')||'+00:00' AS observed_at,
    to_char((a.xact_start+interval '80 seconds') AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US')||'+00:00' AS deadline_at
    FROM pg_catalog.pg_stat_activity a WHERE a.pid=pg_backend_pid() AND a.backend_type='client backend' AND a.state='active'`)
  requireTrue(rows.length===1)
  const i=rows[0]
  requireTrue(Number.isSafeInteger(i.pg_backend_pid)&&i.pg_backend_pid>0&&Number.isSafeInteger(i.database_oid)&&i.database_oid>0&&[i.pg_backend_start,i.pg_transaction_start,i.observed_at,i.deadline_at].every(s=>typeof s==='string'&&Number.isFinite(Date.parse(s))))
  requireTrue(Date.parse(i.deadline_at)-Date.parse(i.pg_transaction_start)===HOLD_MS&&Date.parse(i.observed_at)>=Date.parse(i.pg_transaction_start))
  requireTrue(allowExpired||Date.parse(i.observed_at)<=Date.parse(i.deadline_at))
  return i
}
async function relations(){
  const rows=await query(`/*pg-gate:relations*/ SELECT c.relname,c.oid::int AS oid,c.relkind
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname=ANY($1::text[]) ORDER BY c.relname`,[TABLES])
  requireTrue(rows.length===TABLES.length&&equal(rows.map(r=>r.relname),TABLES)&&rows.every(r=>r.relkind==='r'&&Number.isSafeInteger(r.oid)&&r.oid>0)&&new Set(rows.map(r=>r.oid)).size===TABLES.length)
  return rows.map(r=>r.oid).sort((a,b)=>a-b)
}
async function prove(expectedOids,expectedAdvisory,i){
  requireTrue(equal(await relations(),expectedOids))
  const locks=await query(`/*pg-gate:locks*/ SELECT locktype,mode,granted,pid,database::bigint AS database_oid,relation::bigint AS relation_oid,classid::bigint AS classid,objid::bigint AS objid,objsubid
    FROM pg_catalog.pg_locks WHERE pid=pg_backend_pid() AND ((locktype='relation' AND mode='ShareLock') OR locktype='advisory')`)
  requireTrue(locks.every(row=>row.pid===i.pg_backend_pid&&row.granted===true&&Number(row.database_oid)===i.database_oid))
  const relationLocks=locks.filter(row=>row.locktype==='relation')
  requireTrue(relationLocks.length===TABLES.length&&equal(relationLocks.map(row=>Number(row.relation_oid)).sort((a,b)=>a-b),expectedOids)&&relationLocks.every(row=>row.mode==='ShareLock'))
  const advisory=locks.filter(row=>row.locktype==='advisory').map(row=>{requireTrue(row.mode==='ExclusiveLock'&&row.objsubid===1);return [String(row.classid),String(row.objid)]}).sort((a,b)=>compare(canonical(a),canonical(b)))
  requireTrue(equal(advisory,expectedAdvisory))
  return {held_lock_count:locks.length,relation_lock_count:relationLocks.length,advisory_lock_count:advisory.length,relation_oids:expectedOids}
}
try{
  requireTrue(process.argv.length===2&&Buffer.byteLength(process.argv[1])<=16384)
  const c=JSON.parse(process.argv[1]);requireTrue(c&&Object.getPrototypeOf(c)===Object.prototype&&c.format==='rag-shadow-pg-config/v1'&&['resolve','collect','gate'].includes(c.mode))
  const common=['format','mode','namespace','source_database','source_ids','notebook_ids','rag_inventory_sha256',...c.mode==='resolve'?[]:['company_ids']]
  const exporting=c.mode!=='gate'&&c.private_export==='canonical-base64/v1'
  const expected=[...common,...c.mode==='gate'?['binding_manifest_sha256','plan_sha256','verification_sha256']:exporting?['private_export']:['output_path']].sort()
  requireTrue(equal(Object.keys(c).sort(),expected)&&/^[A-Za-z0-9_]{1,64}$/.test(c.namespace)&&/^[A-Za-z0-9_]{1,64}$/.test(c.source_database)&&hex(c.rag_inventory_sha256))
  if(c.mode!=='resolve')c.company_ids=list(c.company_ids,5)
  c.source_ids=list(c.source_ids,4,'source:');c.notebook_ids=list(c.notebook_ids,5,'notebook:')
  requireTrue(text(process.env.DATABASE_URL,8192))
  requireTrue(c.mode!=='resolve'||exporting)
  if(c.mode==='collect'&&!exporting){
    requireTrue(text(c.output_path,240)&&isAbsolute(c.output_path)&&c.output_path.startsWith('/tmp/')&&!c.output_path.split('/').includes('..')&&await realpath(dirname(c.output_path))===dirname(c.output_path))
    requireTrue((await stat(dirname(c.output_path))).isDirectory())
    try{await stat(c.output_path);throw Error('existing-private-output')}catch(error){requireTrue(error.code==='ENOENT')}
  }else if(c.mode==='gate')requireTrue([c.binding_manifest_sha256,c.plan_sha256,c.verification_sha256].every(hex))
  stage='connect';const {default:pg}=await import('pg')
  client=new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:2000,query_timeout:2000,application_name:'lingxiloop-shadow-pg-gate-297'})
  client.on('error',error=>{transportError=true;if(/^[0-9A-Z]{5}$/.test(error?.code))driverSqlstate=error.code})
  await client.connect();connected=true
  stage='timeouts'
  await query("SET lock_timeout='500ms'");await query("SET statement_timeout='1500ms'");await query("SET idle_in_transaction_session_timeout='5s'")
  const settings=await query("/*pg-gate:settings*/ SELECT current_setting('lock_timeout') AS lock_timeout,current_setting('statement_timeout') AS statement_timeout,current_setting('idle_in_transaction_session_timeout') AS idle_timeout")
  requireTrue(settings.length===1&&equal(settings[0],{lock_timeout:'500ms',statement_timeout:'1500ms',idle_timeout:'5s'}))
  stage='begin';const monotonicStart=performance.now()
  hardClose=setTimeout(()=>{transportError=true;void client.end().catch(()=>{})},82000)
  hardExit=setTimeout(()=>process.exit(1),86000)
  await query(c.mode!=='gate'?'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY':'BEGIN ISOLATION LEVEL READ COMMITTED');began=true
  stage=c.mode==='resolve'?'resolve':'collect';const first=c.mode==='resolve'?await resolveOwners(c):await collect(c)
  if(c.mode!=='gate'){
    const pgIdentity=await identity()
    result={format:'rag-shadow-pg-observation/v1',status:c.mode==='resolve'?'resolved':'collected',read_only:true,
      [c.mode==='resolve'?'private_payload_sha256':'binding_manifest_sha256']:first.sha,rag_inventory_sha256:c.rag_inventory_sha256,...first.counts,...pgIdentity}
    await query('ROLLBACK');began=false
    const release=await query("/*pg-gate:released*/ SELECT COUNT(*)::int AS count FROM pg_catalog.pg_locks WHERE pid=pg_backend_pid() AND (locktype='advisory' OR (locktype='relation' AND mode='ShareLock'))")
    requireTrue(release.length===1&&release[0].count===0);released=true
    stage='private-output'
    if(exporting)privateExport={format:'rag-shadow-pg-private/v1',private:true,encoding:'base64',payload_format:c.mode==='resolve'?'rag-shadow-pg-resolve/v1':'rag-shadow-bindings/v1',payload_sha256:first.sha,bytes:Buffer.byteLength(first.bytes),payload_base64:Buffer.from(first.bytes).toString('base64')}
    else{const handle=await open(c.output_path,'wx',0o600);try{await handle.writeFile(first.bytes,'utf8');await handle.sync();requireTrue((await handle.stat()).mode%512===0o600)}finally{await handle.close()}}
  }else{
    stage='provisioning-locks'
    const expectedAdvisory=[]
    for(const key of first.keys){
      const rows=await query('/*pg-gate:advisory*/ SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS acquired,((hashtextextended($1,0)>>32)&4294967295)::text AS classid,(hashtextextended($1,0)&4294967295)::text AS objid',[key])
      requireTrue(rows.length===1&&rows[0].acquired===true);expectedAdvisory.push([rows[0].classid,rows[0].objid])
    }
    expectedAdvisory.sort((a,b)=>compare(canonical(a),canonical(b)));requireTrue(new Set(expectedAdvisory.map(canonical)).size===expectedAdvisory.length)
    stage='table-locks';const oids=await relations()
    await query('LOCK TABLE public.knowledge_notebook_bindings,public.knowledge_source_jobs,public.knowledge_sources,public.organization_case_notebooks,public.organization_cases,public.projects IN SHARE MODE NOWAIT');locked=true
    const scopeSha=hash(canonical(TABLES));let sequence=0
    while(!signal&&performance.now()-monotonicStart<HOLD_MS){
      const tickStart=performance.now()
      stage='heartbeat-collect';const fresh=await collect(c)
      requireTrue(fresh.sha===c.binding_manifest_sha256&&equal(fresh.keys,first.keys))
      stage='heartbeat-identity';const i=await identity({allowExpired:true})
      if(!activeIdentity)activeIdentity={pg_backend_pid:i.pg_backend_pid,pg_backend_start:i.pg_backend_start,pg_transaction_start:i.pg_transaction_start,database_oid:i.database_oid}
      requireTrue(Object.entries(activeIdentity).every(([key,value])=>i[key]===value))
      stage='heartbeat-locks';const proof=await prove(oids,expectedAdvisory,i)
      requireTrue(!signal&&!transportError)
      // Expiry is normal only after the complete identity and lock proof; do not emit a late held row.
      if(performance.now()-monotonicStart>=HOLD_MS||Date.parse(i.observed_at)>Date.parse(i.deadline_at))break
      emit({format:'rag-shadow-pg-observation/v1',status:'held',sequence:++sequence,binding_manifest_sha256:fresh.sha,rag_inventory_sha256:c.rag_inventory_sha256,
        plan_sha256:c.plan_sha256,verification_sha256:c.verification_sha256,lock_mode:'ShareLock',lock_scope_sha256:scopeSha,...fresh.counts,...i,...proof})
      await pause(Math.min(Math.max(0,1000-(performance.now()-tickStart)),Math.max(0,HOLD_MS-(performance.now()-monotonicStart))))
    }
    result={format:'rag-shadow-pg-observation/v1',status:'rolled-back',reason:signal?'signal':'deadline',...activeIdentity}
  }
}catch{failure=true;result={format:'rag-shadow-pg-observation/v1',status:'failed',stage,...activeIdentity}}
finally{
  if(connected&&began){
    try{await query('ROLLBACK');began=false;const rows=await query("/*pg-gate:released*/ SELECT COUNT(*)::int AS count FROM pg_catalog.pg_locks WHERE pid=pg_backend_pid() AND (locktype='advisory' OR (locktype='relation' AND mode='ShareLock'))");released=rows.length===1&&rows[0].count===0}catch{released=false;failure=true}
  }
  if(client){try{await Promise.race([client.end(),pause(2000,undefined,{ref:false}).then(()=>{throw Error('close-timeout')})])}catch{failure=true}}
  clearTimeout(hardClose)
  process.off('SIGINT',onSignal);process.off('SIGTERM',onSignal)
}
if(!released&&connected){failure=true;result={format:'rag-shadow-pg-observation/v1',status:'failed',stage:'release-unproven',failed_at:result?.stage,...driverSqlstate?{sqlstate:driverSqlstate}:{},...activeIdentity}}
if(!result)result={format:'rag-shadow-pg-observation/v1',status:'failed',stage:'result'}
if(!failure&&released&&privateExport)emit(privateExport)
setTimeout(()=>process.exit(1),500).unref()
process.stdout.write(JSON.stringify({...result,released,held_lock_operation:locked})+'\n',()=>{clearTimeout(hardExit);process.exit(failure?1:0)})
