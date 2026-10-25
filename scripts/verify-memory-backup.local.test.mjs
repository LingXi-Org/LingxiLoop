// Explicit local-only PostgreSQL/Compose fixture. Never invokes Komodo or fetch.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { randomBytes, createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { Pool } from 'pg'
import { buildMemoryBackupPlan, parseMemoryBackupReceipt } from './verify-memory-backup.mjs'

const enabled=process.env.MEMORY_BACKUP_LOCAL_TEST==='1'
const local=test
const sourceSha='2ea8615c17c9ed11b769c83c699719dc01c11ee4'
const nonce=randomBytes(6).toString('hex'), database=`memory_backup_216_${nonce}_test`
const dedicatedContainer=process.env.MEMORY_BACKUP_LOCAL_CONTAINER
if(dedicatedContainer && !/^lingxiloop-memory-backup-216-[a-f0-9]{12}$/.test(dedicatedContainer))
  throw new Error('A unique dedicated local backup-test container is required')
const container=dedicatedContainer ?? 'lingxiloop-issue196-postgres-1'
const backupRoot=`${dedicatedContainer?'/var/lib/postgresql/data':'/tmp'}/memory-backup-216-${nonce}`
// A dedicated test also starts/removes one-off tool containers; this test
// envelope is separate from every generated production deadline.
const testTimeout=dedicatedContainer?60000:30000
const run=promisify(execFile), measurements=[]
let admin, source, localImage, localPassword
const exec=async(command,args=[],options={})=>run(command,args,{maxBuffer:2*1024*1024,...options})
async function planFor(attempt) {return buildMemoryBackupPlan({sourceSha,attempt:`local-${nonce}-${attempt}`})}
async function shell(plan,{onSnapshot,alter=value=>value}={}) {
  let command=plan.command.replaceAll('/var/lib/postgresql/data/memory-upgrade-backups',backupRoot)
    .replaceAll('-h postgres','-h 127.0.0.1')
  command=`export POSTGRES_DB='${database}'\nexport POSTGRES_USER=postgres\n`+alter(command)
  return new Promise((resolve,reject)=>{
    const toolName=dedicatedContainer?`memory-backup-tool-${nonce}-${randomBytes(4).toString('hex')}`:undefined
    // Production uses a one-off service container. Keep deadline signals outside
    // the database PID namespace: postgres as PID1 must not reap killed exec sh.
    const args=dedicatedContainer
      ? ['run','--rm','--name',toolName,'--pull=never','--network',`container:${container}`,'--volumes-from',container,
        '--user','postgres','--env','POSTGRES_PASSWORD','--entrypoint','sh',localImage,
        '-ec',command,'local-backup',plan.commandHash]
      : ['exec','-i','--user','postgres',container,'sh','-ec',command,'local-backup',plan.commandHash]
    const child=spawn('docker',args,{env:{...process.env,...(dedicatedContainer?{POSTGRES_PASSWORD:localPassword}:{})},stdio:['ignore','pipe','pipe']})
    let stdout='',stderr='',called=false,action=Promise.resolve()
    child.stdout.on('data',chunk=>{stdout+=chunk;if(onSnapshot&&!called&&stdout.includes('MEMORY_BACKUP_SNAPSHOT_READY=1')){called=true;action=onSnapshot()}})
    child.stderr.on('data',chunk=>{stderr+=chunk})
    child.on('error',reject)
    child.on('exit',async code=>{try{await action;resolve({code,stdout,stderr,snapshotObserved:called,toolName})}catch(error){reject(error)}})
  })
}
async function present(name) {return (await admin.query('SELECT 1 FROM pg_database WHERE datname=$1',[name])).rowCount===1}
before(async()=>{
  if(!enabled)return
  const ports=JSON.parse((await exec('docker',['inspect','--format','{{json .NetworkSettings.Ports}}',container])).stdout)
  assert.equal(ports['5432/tcp']?.length,1)
  assert.equal(ports['5432/tcp'][0].HostIp,'127.0.0.1')
  if(!dedicatedContainer)assert.equal(ports['5432/tcp'][0].HostPort,'55432')
  const connectionString=process.env.MEMORY_BACKUP_LOCAL_DATABASE_URL
  assert.ok(connectionString,'explicit synthetic local database URL required')
  const url=new URL(connectionString)
  assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,ports['5432/tcp'][0].HostPort);assert.equal(url.pathname,'/postgres')
  if(dedicatedContainer){
    localImage=(await exec('docker',['inspect','--format','{{.Image}}',container])).stdout.trim()
    assert.match(localImage,/^sha256:[a-f0-9]{64}$/)
    localPassword=decodeURIComponent(url.password)
  }
  admin=new Pool({connectionString,max:2})
  await admin.query(`CREATE DATABASE ${database}`)
  url.pathname='/'+database; source=new Pool({connectionString:url.href,max:2})
  await exec(process.execPath,['--import','tsx','server/src/migrate-bin.ts'],{env:{...process.env,DATABASE_URL:url.href,
    NODE_ENV:'test',DOTENV_CONFIG_PATH:'/dev/null'}})
  await source.query('CREATE TABLE public.memory_backup_fixture(id integer PRIMARY KEY, body text)')
  await source.query("INSERT INTO public.memory_backup_fixture SELECT n,'SYNTHETIC_MEMORY_BODY' FROM generate_series(1,10) n")
  const schema=await readFile('node_modules/@lyyzka/lingxios/db/schema.sql')
  assert.equal(createHash('sha256').update(schema).digest('hex'),(await planFor('metadata')).source.runtime.schemaHash)
})
after(async()=>{
  if(!enabled)return
  await source?.end()
  if(admin){await admin.query(`DROP DATABASE IF EXISTS ${database}`);await admin.end()}
  // Only this synthetic fixture's random directory, never a production volume.
  if(/^\/(?:tmp|var\/lib\/postgresql\/data)\/memory-backup-216-[a-f0-9]{12}$/.test(backupRoot)) await exec('docker',['exec','--user','postgres',container,'rm','-rf','--',backupRoot])
  await mkdir('artifacts/memory-backup',{recursive:true})
  await writeFile('artifacts/memory-backup/local.json',JSON.stringify({productionRequests:0,sourceDatabase:'isolated synthetic *_test',
    sourceRuntime:'3.5.6',sourceSchema:12,sourceProduct:46,migrationRehearsal:'not-performed',measurements},null,2)+'\n')
})

local('real exported snapshot restores the original counts despite a concurrent source commit; retries cannot overwrite it', {skip:!enabled,timeout:testTimeout}, async()=>{
  const plan=await planFor('snapshot'), started=performance.now()
  const result=await shell(plan,{onSnapshot:()=>source.query("INSERT INTO public.memory_backup_fixture VALUES(11,'LATER_SYNTHETIC_MEMORY')")})
  assert.equal(result.code,0,result.stdout);assert.equal(result.stderr,'');assert.equal(result.snapshotObserved,true)
  assert.ok(!result.stdout.includes('SYNTHETIC_MEMORY'))
  const receipt=parseMemoryBackupReceipt(plan,{_id:{$oid:'a'.repeat(24)},status:'Complete',success:true,logs:[{stdout:result.stdout}]})
  assert.equal(receipt.countsBefore.find(row=>row[1]==='memory_backup_fixture')[2],10)
  assert.equal((await source.query('SELECT count(*)::int AS n FROM memory_backup_fixture')).rows[0].n,11)
  assert.equal(await present(plan.isolatedDatabase),false)
  const repeated=await shell(plan)
  assert.equal(repeated.code,1);assert.match(repeated.stdout,/FAILED_STAGE=reserve-attempt/)
  measurements.push({case:'same-snapshot-and-retry',sourceRows:11,snapshotAndRestoredRows:10,isolatedDatabaseRemoved:true,
    duplicateAttemptRejected:true,elapsedMs:performance.now()-started})
})

local('preexisting restore database is never adopted or dropped', {skip:!enabled,timeout:testTimeout}, async()=>{
  const plan=await planFor('collision')
  await admin.query(`CREATE DATABASE ${plan.isolatedDatabase}`)
  try {
    const result=await shell(plan)
    assert.equal(result.code,1);assert.match(result.stdout,/FAILED_STAGE=create-isolated-database/)
    assert.equal(await present(plan.isolatedDatabase),true)
    measurements.push({case:'owned-restore-guard',preexistingDatabasePreserved:true})
  } finally {await admin.query(`DROP DATABASE ${plan.isolatedDatabase}`)}
})

local('wrong source provenance fails before dump or restore', {skip:!enabled,timeout:testTimeout}, async()=>{
  const plan=await planFor('wrong-provenance')
  await source.query("UPDATE public.lingxios_installation SET runtime_version='synthetic-wrong' WHERE singleton")
  try {
    const result=await shell(plan)
    assert.equal(result.code,1);assert.match(result.stdout,/FAILED_STAGE=snapshot/)
    assert.ok(!result.stdout.includes('SNAPSHOT_READY'));assert.equal(await present(plan.isolatedDatabase),false)
    measurements.push({case:'provenance-failure',dumpNotStarted:true,restoreNotCreated:true})
  } finally {await source.query("UPDATE public.lingxios_installation SET runtime_version='3.5.6' WHERE singleton")}
})

local('actual pg_restore failure removes only its owned database and cannot emit success', {skip:!enabled,timeout:testTimeout}, async()=>{
  const plan=await planFor('restore-failure')
  const result=await shell(plan,{alter:command=>command.replace('stage=restore\ntimeout', 'stage=restore\nprintf invalid-synthetic-dump > "$backup_dir/product.dump"\ntimeout')})
  assert.equal(result.code,1);assert.match(result.stdout,/FAILED_STAGE=restore/)
  assert.ok(!result.stdout.includes('COMPLETE=1'));assert.equal(await present(plan.isolatedDatabase),false)
  assert.equal((await source.query('SELECT count(*)::int AS n FROM memory_backup_fixture')).rows[0].n,11)
  measurements.push({case:'restore-failure',ownedDatabaseRemoved:true,sourceRows:11,successMarker:false})
})

local('capacity refusal stops before the source snapshot or isolated creation', {skip:!enabled,timeout:testTimeout}, async()=>{
  const plan=await planFor('capacity')
  const result=await shell(plan,{alter:command=>command.replace('free_bytes=$((free_kib * 1024));','free_bytes=0;')})
  assert.equal(result.code,1);assert.match(result.stdout,/FAILED_STAGE=capacity-initial/)
  assert.ok(!result.stdout.includes('SNAPSHOT_READY'));assert.equal(await present(plan.isolatedDatabase),false)
  measurements.push({case:'capacity-refusal',snapshotNotStarted:true,restoreNotCreated:true})
})

local('overall deadline interrupts a real slow restore and removes only its owned database', {skip:!enabled||!dedicatedContainer,timeout:testTimeout}, async()=>{
  const plan=await planFor('restore-deadline'), unrelated=await planFor('deadline-preexisting')
  await admin.query(`CREATE DATABASE ${unrelated.isolatedDatabase}`)
  // COPY omits stored generated columns. Dump the changed function so actual
  // pg_restore COPY blocks in PgSleep, without delaying source preparation.
  await source.query(`CREATE FUNCTION public.memory_backup_slow_value(n integer) RETURNS integer
    LANGUAGE plpgsql IMMUTABLE AS $$ BEGIN RETURN n; END $$`)
  await source.query(`CREATE TABLE public.memory_backup_slow_fixture(
    id integer PRIMARY KEY, computed integer GENERATED ALWAYS AS (public.memory_backup_slow_value(id)) STORED)`)
  await source.query('INSERT INTO public.memory_backup_slow_fixture(id) SELECT generate_series(1,20)')
  await source.query(`CREATE OR REPLACE FUNCTION public.memory_backup_slow_value(n integer) RETURNS integer
    LANGUAGE plpgsql IMMUTABLE AS $$ BEGIN PERFORM pg_sleep(1); RETURN n; END $$`)
  let restoreObserved=false
  const observer=setInterval(()=>{
    void admin.query(`SELECT 1 FROM pg_stat_activity WHERE datname=$1 AND application_name='pg_restore'
      AND state='active' AND wait_event='PgSleep'`,[plan.isolatedDatabase])
      .then(result=>{restoreObserved ||= result.rowCount>0}).catch(()=>{})
  },50)
  try {
    const started=performance.now()
    const result=await shell(plan,{alter:command=>command.replace('timeout -k 125 3900 sh -ec','timeout -k 1 5 sh -ec')})
    const elapsedMs=performance.now()-started
    assert.equal(restoreObserved,true,'the deadline must interrupt actual pg_restore COPY')
    assert.notEqual(result.code,0);assert.ok(!result.stdout.includes('COMPLETE=1'))
    const remainingTools=await exec('docker',['ps','-a','--filter',`name=^/${result.toolName}$`,'--format','{{.ID}}'])
    assert.equal(remainingTools.stdout.trim(),'','the one-off tool container and its processes must be gone')
    const active=(await admin.query('SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=$1',[plan.isolatedDatabase])).rows[0].n
    assert.equal(active,0,'no surviving restore connection after the outer deadline')
    assert.equal(await present(plan.isolatedDatabase),false,'only this invocation\'s created DB must be cleaned')
    assert.equal(await present(unrelated.isolatedDatabase),true,'preexisting DB must remain')
    assert.equal((await source.query('SELECT count(*)::int AS n FROM memory_backup_slow_fixture')).rows[0].n,20)
    const retained=plan.backupDir.replace('/var/lib/postgresql/data/memory-upgrade-backups',backupRoot)+'/product.dump'
    await exec('docker',['exec','--user','postgres',container,'test','-s',retained])
    measurements.push({case:'overall-deadline-during-restore',restoreObserved,remainingRestoreBackends:active,
      isolatedDatabaseRemoved:true,preexistingDatabasePreserved:true,sourceRows:20,dumpRetained:true,
      toolContainerRemoved:true,successMarker:false,elapsedMs})
  } finally {
    clearInterval(observer)
    // Red-test cleanup only: these full random names belong to this fixture.
    await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()',[plan.isolatedDatabase])
    await admin.query(`DROP DATABASE IF EXISTS ${plan.isolatedDatabase}`)
    await admin.query(`DROP DATABASE ${unrelated.isolatedDatabase}`)
    await source.query('DROP TABLE public.memory_backup_slow_fixture')
    await source.query('DROP FUNCTION public.memory_backup_slow_value(integer)')
  }
})
