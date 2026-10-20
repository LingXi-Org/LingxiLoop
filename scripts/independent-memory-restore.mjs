// Explicit non-production rehearsal. Creates only one labelled loopback tmpfs PG fixture.
import assert from 'node:assert/strict'
import {execFile,spawn} from 'node:child_process'
import {promisify} from 'node:util'
import {createHash,randomBytes} from 'node:crypto'
import {readFile,writeFile,mkdir,mkdtemp,rm,readdir,symlink,stat} from 'node:fs/promises'
import {resolve,join,dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import {tmpdir} from 'node:os'
import {Pool} from 'pg'
import {buildMemoryBackupPlan,parseMemoryBackupReceipt} from './verify-memory-backup.mjs'
const root=fileURLToPath(new URL('../',import.meta.url)),run=promisify(execFile)
const SOURCE='c6c47bddeabb4488f9fe93391f15c695a528260c',APP='ac9069460e99a20fac7f2c3de87c60f2bec66924'
const options={}
for(let i=2;i<process.argv.length;i++){
 const key=process.argv[i];assert.ok(['--output','--source-tar','--target-package','--target-tar','--target-registry','--negative-source-control'].includes(key)&&!(key in options))
 options[key]=key==='--negative-source-control'?true:process.argv[++i]
}
for(const key of ['--output','--source-tar','--target-package'])assert.ok(options[key]&&resolve(options[key])===options[key],`${key} absolute path required`)
assert.equal(Boolean(options['--target-tar']),Boolean(options['--target-registry']))
const input=new URL(process.env.RESTORE_REHEARSAL_LOCAL_URL??'')
assert.equal(input.hostname,'127.0.0.1');assert.equal(input.username,'postgres');assert.equal(input.pathname,'/postgres');assert.ok(input.password)
const output=options['--output'];await mkdir(output,{mode:0o700}) // Existing output is never reused.
const nonce=randomBytes(6).toString('hex'),owner=`restore216-${nonce}`,container=`lingxiloop-restore216-${nonce}`
const sourceDatabase=`restore216_${nonce}_source_test`,targetDatabase=`restore216_${nonce}_target_test`
const startedAt=new Date().toISOString(),started=performance.now()
const evidence={format:1,startedAt,mode:options['--negative-source-control']?'negative-source-control':'restore-upgrade',sourceCommit:SOURCE,applicationCommit:APP,
 targetCommit:(await run('git',['rev-parse','HEAD'],{cwd:root})).stdout.trim(),formalTarget:false,productionRequests:0,externalProviderRequests:0,sharedDatabaseRequests:0,
 driverHashes:{},steps:[],cleanup:{ownedContainerRemoved:false,ownedToolContainersRemoved:false,temporaryArchivesRemoved:false},passed:false}
const receipt=join(output,'receipt.json');await writeFile(receipt,'{}\n',{flag:'wx',mode:0o600})
const save=()=>writeFile(receipt,JSON.stringify(evidence,null,2)+'\n',{mode:0o600})
const hash=data=>createHash('sha256').update(data).digest('hex')
const invoke=async(cmd,args,opts={})=>run(cmd,args,{cwd:root,timeout:120000,maxBuffer:4*1024*1024,...opts})
const docker=async args=>(await invoke('docker',args)).stdout.trim()
const safeEnv={PATH:process.env.PATH,DOTENV_CONFIG_PATH:'/dev/null',NODE_ENV:'test',OPENAI_API_KEY:'synthetic-no-provider',OPENAI_BASE_URL:'http://127.0.0.1:9/v1',
 OPENAI_MODEL:'synthetic-no-provider',OPENAI_EMBEDDING_MODEL:'disabled',LINGXILOOP_DISABLE_EMBEDDINGS:'1',LINGXILOOP_RUNTIME_CLIENT:'http',
 REDIS_URL:'redis://127.0.0.1:9/15',WUKONG_USER_TOKEN_SECRET:'memory-isolated-user-token',LINGXILOOP_GATEWAY_HMAC_SECRET:'memory-isolated-gateway',
 LINGXILOOP_INVITE_BASE_URL:'http://127.0.0.1:9',OPEN_NOTEBOOK_ENABLED:'false',DATABASE_POOL_MAX:'3',RESTORE_REHEARSAL_CHILD:'1'}
const tools=new Set();let admin,source,target,work,phase='prepare',pgImage
function dbURL(name){const url=new URL(input);url.port=evidence.port;url.pathname='/'+name;return url.href}
async function child(task,checkout,database){
 const result=await invoke(process.execPath,['--import',join(root,'node_modules/tsx/dist/loader.mjs'),join(root,'scripts/independent-memory-restore-step.mjs'),task,checkout],
 {env:{...safeEnv,DATABASE_URL:dbURL(database)},timeout:120000}).catch(error=>({stdout:error.stdout??'',stderr:error.stderr??'',failed:true}))
 const lines=result.stdout.trim().split('\n');let value
 try{value=JSON.parse(lines.at(-1))}catch{value={phase:task,passed:false,outputHash:hash(result.stdout),stderrHash:hash(result.stderr),moduleMissing:result.stderr.match(/Cannot find (?:module|package) '([^']+)'/)?.[1]?.split('/').slice(-3).join('/'),loadErrorCode:result.stderr.match(/Error \[(ERR_[A-Z_]+)\]/)?.[1],missingEnv:result.stderr.match(/Missing required environment variable: ([A-Z_]+)/)?.[1]}}
 evidence.steps.push(value);await save();assert.equal(result.failed,undefined,`child ${task} failed`);assert.equal(value.passed,true,`child ${task} did not pass`)
 return value
}
async function checkout(commit,name,runtime){
 const path=join(work,name);await mkdir(path);const archive=join(work,`${name}.tar`)
 await invoke('git',['archive','--format=tar',`--output=${archive}`,commit,'package.json','server/src','src'])
 await invoke('tar',['-xf',archive,'-C',path]);await rm(archive)
 const deps=join(path,'node_modules');await mkdir(deps)
 for(const entry of await readdir(join(root,'node_modules'))){
  if(entry==='@lyyzka')continue
  await symlink(resolve(root,'node_modules',entry),join(deps,entry))
 }
 await mkdir(join(deps,'@lyyzka'));await symlink(runtime,join(deps,'@lyyzka/lingxios'))
 await writeFile(join(path,'restore-runtime-public.mjs'),"export * from '@lyyzka/lingxios'\nexport {createWorker} from '@lyyzka/lingxios/worker'\n")
 return path
}
async function unpack(tar,destination,integrity){
 const data=await readFile(tar);assert.equal('sha512-'+createHash('sha512').update(data).digest('base64'),integrity)
 await mkdir(destination);await invoke('tar',['-xzf',tar,'-C',destination]);return join(destination,'package')
}
const quote=name=>'"'+name.replaceAll('"','""')+'"'
async function inventory(db,definition){
 const tables=definition??(await db.query(`SELECT n.nspname AS schema,c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname IN('public','lingxios') AND c.relkind IN('r','p') ORDER BY 1,2`)).rows
 const result=[]
 for(const table of tables){
  const columns=table.columns??(await db.query(`SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 ORDER BY ordinal_position`,[table.schema,table.name])).rows.map(r=>r.column_name)
  const row=`jsonb_build_array(${columns.map(quote).join(',')})::text`
  const data=(await db.query(`SELECT count(*)::int AS count,md5(COALESCE(string_agg(md5(${row}),'' ORDER BY md5(${row})),'')) AS digest FROM ${quote(table.schema)}.${quote(table.name)}`)).rows[0]
  result.push({...table,columns,...data})
 }
 return result
}
async function tool(args,{command,onSnapshot}={}){
 const name=`restore216-tool-${nonce}-${randomBytes(3).toString('hex')}`;tools.add(name)
 const common=['run','--rm','--pull=never','--name',name,'--label',`lingxi.restore216-owner=${owner}`,'--network',`container:${container}`,
 '--user',`${process.getuid()}:${process.getgid()}`,'--memory','256m','--tmpfs','/var/lib/postgresql/data:rw,size=768m','--mount',`type=bind,source=${join(work,'backup')},target=/rehearsal`,'-e','POSTGRES_PASSWORD','-e','PGPASSWORD']
 const env={PATH:process.env.PATH,POSTGRES_PASSWORD:decodeURIComponent(input.password),PGPASSWORD:decodeURIComponent(input.password)}
 if(!command)return invoke('docker',[...common,'--entrypoint','pg_restore',pgImage,...args],{env,timeout:120000})
 return new Promise((done,reject)=>{
  const processChild=spawn('docker',[...common,'--entrypoint','sh',pgImage,'-ec',command,'local-rehearsal',args[0]],{env,stdio:['ignore','pipe','pipe']})
  let stdout='',stderr='',seen=false,action=Promise.resolve()
  const timer=setTimeout(()=>processChild.kill('SIGTERM'),120000)
  processChild.stdout.on('data',chunk=>{stdout+=chunk;if(onSnapshot&&!seen&&stdout.includes('MEMORY_BACKUP_SNAPSHOT_READY=1')){seen=true;action=onSnapshot()}})
  processChild.stderr.on('data',chunk=>{stderr+=chunk})
  processChild.on('error',error=>{clearTimeout(timer);reject(error)})
  processChild.on('exit',async code=>{clearTimeout(timer);try{await action;done({code,stdout,stderr,seen})}catch(error){reject(error)}})
 })
}
try{
 evidence.driverHashes={main:hash(await readFile(fileURLToPath(import.meta.url))),step:hash(await readFile(join(root,'scripts/independent-memory-restore-step.mjs')))}
 const plan=await buildMemoryBackupPlan({sourceSha:SOURCE,attempt:`independent-${nonce}`})
 const sourceInputs=['package.json','package-lock.json','server/package.json','server/package-lock.json','server/src/db','server/src/modules/memory/public.ts']
 assert.equal((await invoke('git',['diff','--name-only',SOURCE,APP,'--',...sourceInputs])).stdout,'')
 evidence.source={runtime:plan.source.runtime.runtime,schema:12,product:46,schemaHash:plan.source.runtime.schemaHash,tarIntegrity:plan.source.runtime.integrity,tarSha256:hash(await readFile(options['--source-tar'])),migrationInventoryHash:hash(JSON.stringify(plan.source.migrations))}
 work=await mkdtemp(join(tmpdir(),'restore216-owned-'));await mkdir(join(work,'backup'),{mode:0o700})
 const sourceRuntime=await unpack(options['--source-tar'],join(work,'source-runtime'),plan.source.runtime.integrity)
 assert.equal(JSON.parse(await readFile(join(sourceRuntime,'package.json'),'utf8')).version,'3.5.6')
 assert.equal(hash(await readFile(join(sourceRuntime,'db/schema.sql'))),plan.source.runtime.schemaHash)
 let targetRuntime=options['--target-package']
 if(options['--target-tar']){
  const registry=JSON.parse(await readFile(options['--target-registry'],'utf8'))
  assert.equal(registry.version,'3.5.8');const integrity=registry['dist.integrity']??registry.dist?.integrity
  const tarball=registry['dist.tarball']??registry.dist?.tarball
  assert.match(tarball,/^https:\/\/npm\.pkg\.github\.com\/download\/@lyyzka\/lingxios\/3\.5\.8\//)
  targetRuntime=await unpack(options['--target-tar'],join(work,'target-runtime'),integrity)
  evidence.formalTarget=true;evidence.targetTarSha256=hash(await readFile(options['--target-tar']));evidence.targetRegistry={version:registry.version,integrity,gitHead:registry.gitHead,tarball}
 }
 assert.equal(JSON.parse(await readFile(join(targetRuntime,'package.json'),'utf8')).version,'3.5.8')
 evidence.targetPackage={version:'3.5.8',schemaHash:hash(await readFile(join(targetRuntime,'db/schema.sql'))),packageJsonHash:hash(await readFile(join(targetRuntime,'package.json')))}
 const old=await checkout(SOURCE,'source',sourceRuntime),current=await checkout(evidence.targetCommit,'target',targetRuntime)
 pgImage=await docker(['inspect','--format','{{.Image}}','lingxiloop-issue196-postgres-1']);assert.match(pgImage,/^sha256:[a-f0-9]{64}$/);evidence.localImage=pgImage
 phase='create-owned-fixture'
 await invoke('docker',['run','-d','--pull=never','--name',container,'--label',`lingxi.restore216-owner=${owner}`,'--memory','768m','--tmpfs','/var/lib/postgresql/data:rw,size=768m',
 '-p','127.0.0.1::5432','-e','POSTGRES_PASSWORD','-e','POSTGRES_USER=postgres','-e','POSTGRES_DB=postgres',pgImage],{env:{PATH:process.env.PATH,POSTGRES_PASSWORD:decodeURIComponent(input.password)}})
 let ready=false;for(let n=0;n<60;n++){try{await docker(['exec',container,'pg_isready','-h','127.0.0.1','-U','postgres']);ready=true;break}catch{await new Promise(r=>setTimeout(r,250))}}assert.ok(ready)
 const ports=JSON.parse(await docker(['inspect','--format','{{json .NetworkSettings.Ports}}',container]));assert.equal(ports['5432/tcp'][0].HostIp,'127.0.0.1');evidence.port=ports['5432/tcp'][0].HostPort;assert.notEqual(evidence.port,'55432')
 const mounts=JSON.parse(await docker(['inspect','--format','{{json .Mounts}}',container]))
 const tmpfs=JSON.parse(await docker(['inspect','--format','{{json .HostConfig.Tmpfs}}',container]))
 assert.equal(tmpfs['/var/lib/postgresql/data'],'rw,size=768m')
 assert.equal(await docker(['exec',container,'stat','-f','-c','%T','/var/lib/postgresql/data']),'tmpfs')
 assert.ok(mounts.every(m=>m.Type!=='volume'))
 evidence.fixtureStorage={dataTmpfs:true,persistentVolumes:0}
 admin=new Pool({connectionString:dbURL('postgres'),max:1});evidence.postgresVersion=(await admin.query('SHOW server_version')).rows[0].server_version
 await admin.query(`CREATE DATABASE ${quote(sourceDatabase)}`)
 phase='source-bootstrap'
 const boot=await child('bootstrap',options['--negative-source-control']?current:old,sourceDatabase)
 evidence.sourceObserved=boot.provenance
 assert.equal(boot.provenance.native,12);assert.equal(boot.provenance.product,46);assert.equal(boot.provenance.runtime,'3.5.6');assert.equal(boot.provenance.hash,plan.source.runtime.schemaHash)
 phase='source-seed';await child('seed',old,sourceDatabase)
 source=new Pool({connectionString:dbURL(sourceDatabase),max:1})
 const before=await inventory(source);evidence.sourceRows=before.reduce((n,t)=>n+t.count,0);evidence.sourceTables=before.length;evidence.sourceContentHash=hash(JSON.stringify(before))
 phase='snapshot-backup-and-isolated-restore'
 const command=`export POSTGRES_DB='${sourceDatabase}'\nexport POSTGRES_USER=postgres\n`+plan.command.replaceAll('/var/lib/postgresql/data/memory-upgrade-backups','/rehearsal').replaceAll('-h postgres','-h 127.0.0.1')
 evidence.backupCommand={reviewedHash:plan.commandHash,localAdaptedHash:hash(command),adaptations:['owned backup bind path','owned loopback database/network','synthetic existing local credentials only']}
 const backed=await tool([plan.commandHash],{command,onSnapshot:()=>source.query('INSERT INTO public.restore_snapshot_control VALUES(2)')})
 evidence.backupProcess={exitCode:backed.code,snapshotMarker:backed.seen,stderrHash:hash(backed.stderr)};assert.equal(backed.code,0);assert.equal(backed.seen,true)
 // Local envelope only: reuse parser validation without claiming a Komodo update.
 const verification=parseMemoryBackupReceipt(plan,{_id:{$oid:'a'.repeat(24)},status:'Complete',success:true,logs:[{stdout:backed.stdout}]})
 evidence.backup={transport:'local-subprocess-not-komodo',dumpHash:verification.dumpSha256,restoreCountsEqual:true,restoreProvenanceEqual:true,helperRestoreRemoved:verification.isolatedDatabaseRemoved,sourceSnapshotControl:verification.countsBefore.find(row=>row[1]==='restore_snapshot_control')[2]}
 assert.equal((await source.query('SELECT count(*)::int AS n FROM public.restore_snapshot_control')).rows[0].n,2)
 assert.equal(evidence.backup.sourceSnapshotControl,1)
 assert.equal((await admin.query('SELECT count(*)::int AS n FROM pg_database WHERE datname=$1',[plan.isolatedDatabase])).rows[0].n,0)
 const dump=join(work,'backup',SOURCE,plan.attempt,'product.dump');assert.equal(hash(await readFile(dump)),verification.dumpSha256)
 phase='restore-for-real-upgrade'
 await admin.query(`CREATE DATABASE ${quote(targetDatabase)} TEMPLATE template0`)
 await tool(['-h','127.0.0.1','-U','postgres','-d',targetDatabase,'--no-owner','--no-privileges','--exit-on-error',`/rehearsal/${SOURCE}/${plan.attempt}/product.dump`])
 target=new Pool({connectionString:dbURL(targetDatabase),max:1})
 const restored=await inventory(target);assert.deepEqual(restored,before)
 evidence.restore={allTableCountsAndHashesEqual:true,restoredTables:restored.length,restoredContentHash:hash(JSON.stringify(restored)),snapshotExcludedLaterSourceCommit:true}
 phase='real-upgrade'
 await child('upgrade',current,targetDatabase)
 const preserved=before.filter(t=>!['schema_version','schema_migrations','lingxios_installation'].includes(t.name))
 const after=await inventory(target,preserved);assert.deepEqual(after,preserved)
 evidence.upgradeOldRows={tables:preserved.length,oldColumnsHashesEqual:true,hash:hash(JSON.stringify(after)),
 retained:after.filter(t=>['agent_memories','agent_memory_versions','agent_memory_scopes','agent_os_sessions'].includes(t.name)).map(t=>({table:t.name,count:t.count,digest:t.digest}))}
 phase='old-instance-refusal'
 await child('old-refusal',old,targetDatabase)
 phase='public-backfill-boundaries'
 await child('backfill',current,targetDatabase)
 evidence.passed=true;phase='complete'
}catch(error){evidence.failedPhase=phase;evidence.errorName=error?.name??'Error';evidence.errorCode=/^[A-Z0-9_]+$/.test(error?.code??'')?error.code:undefined;evidence.failureLocation=String(error?.stack??'').split('\n').find(line=>line.includes('independent-memory-restore.mjs'))?.replace(root,'<checkout>/');process.exitCode=1}
finally{
 await save()
 await Promise.allSettled([source?.end(),target?.end(),admin?.end()])
 try{
  for(const name of tools){
   const found=await docker(['ps','-aq','--filter',`name=^/${name}$`])
   if(found){assert.equal(await docker(['inspect','--format','{{index .Config.Labels "lingxi.restore216-owner"}}',name]),owner);await docker(['rm','-f',name])}
  }
  evidence.cleanup.ownedToolContainersRemoved=true
  const found=await docker(['ps','-aq','--filter',`name=^/${container}$`])
  if(found){assert.equal(await docker(['inspect','--format','{{index .Config.Labels "lingxi.restore216-owner"}}',container]),owner);await docker(['rm','-f',container])}
  evidence.cleanup.ownedContainerRemoved=(await docker(['ps','-aq','--filter',`name=^/${container}$`]))===''
  if(work){assert.ok(dirname(work)===tmpdir()&&work.split('/').at(-1).startsWith('restore216-owned-'));await rm(work,{recursive:true,force:true});evidence.cleanup.temporaryArchivesRemoved=await stat(work).then(()=>false,()=>true)}
  evidence.cleanup.noOwnedContainersRemain=(await docker(['ps','-aq','--filter',`label=lingxi.restore216-owner=${owner}`]))===''
 }catch(error){evidence.cleanup.errorCode=error?.code??error?.name;evidence.passed=false;process.exitCode=1}
 if(!evidence.cleanup.noOwnedContainersRemain){evidence.passed=false;process.exitCode=1}
 evidence.finishedAt=new Date().toISOString();evidence.elapsedMs=Math.round(performance.now()-started)
 delete evidence.port
 await save();console.log(JSON.stringify({passed:evidence.passed,formalTarget:evidence.formalTarget,failedPhase:evidence.failedPhase,steps:evidence.steps.length,cleanup:evidence.cleanup,receiptHash:hash(await readFile(receipt))}))
}
