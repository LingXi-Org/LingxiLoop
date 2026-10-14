// Disposable PostgreSQL + HTTP Komodo fixture: no production credentials or remote execution.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp,readdir,copyFile,rm,mkdir,writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join,sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import pg from 'pg'
import { prepareForumRollout } from '../../scripts/prepare-forum-rollout.mjs'
import { syncKomodoConfig } from '../../scripts/sync-komodo-config.mjs'
const execute=promisify(execFile)
const dbName='lingxiloop_forum_rollout_test'
const connection='postgresql://postgres:lingxiloop-e2e-local@127.0.0.1:55432/'
Object.assign(process.env,{NODE_ENV:'test',DOTENV_CONFIG_PATH:'__no_dotenv__',DATABASE_URL:connection+dbName,REDIS_URL:'redis://127.0.0.1:56379/4',OPENAI_API_KEY:'local-fixture',OPENAI_BASE_URL:'http://127.0.0.1:1/v1',OPEN_NOTEBOOK_ENABLED:'false',GITHUB_SHA:'b'.repeat(40),GITHUB_RUN_ID:'123',GITHUB_RUN_ATTEMPT:'1'})
const admin=new pg.Client({connectionString:connection+'postgres'});await admin.connect()
await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);await admin.query(`CREATE DATABASE ${dbName}`)
const db=new pg.Pool({connectionString:connection+dbName})
const directory=await mkdtemp(join(tmpdir(),'forum-rollout-'))
const {migrateDatabase}=await import('../../server/src/db/migrate.ts')
const {pool}=await import('../../server/src/db/pool.ts')
const calls=[];let failBackup=false
let config={repo:'fixture/repo',linked_repo:'',files_on_host:false,file_contents:''}, failPreview=false, corruptConfig=false
const server=createServer(async(req,res)=>{
  try {
    let body='';for await(const part of req)body+=part
    const data=JSON.parse(body),operation=req.url.split('/').at(-1)
    calls.push({operation,stack:data.stack,services:data.services})
    if (['GetResourceSync','UpdateResourceSync','RefreshResourceSyncPending'].includes(operation)) {
      if(operation==='UpdateResourceSync') config={...data.config,file_contents:corruptConfig?'mismatched':data.config.file_contents}
      res.setHeader('content-type','application/json')
      res.end(JSON.stringify({_id:{$oid:'sync-fixture'},config,info:{pending_error:failPreview?'fixture error':null,pending_deploy_error:null,remote_errors:[]}}))
      return
    }
    let stdout='',success=true
    if(operation==='RunStackService') {
      assert.equal(data.stack,'lingxiloop-core-state');assert.equal(data.service,'postgres');assert.equal(data.detach,false)
      let command=data.command[1].replaceAll('-h postgres','-h 127.0.0.1').replace('/var/lib/postgresql/data/forum-upgrade-backups/','/tmp/forum-upgrade-backups/')
      if(failBackup&&command.includes('pg_dump')) {success=false;stdout='fixture backup failure'}
      else {
        try {({stdout}=await execute('docker',['exec','-u','postgres','-e',`POSTGRES_DB=${dbName}`,'-e','POSTGRES_USER=postgres','lingxiloop-e2e-postgres-1','sh','-ec',command],{maxBuffer:10_000_000}))}
        catch(error) {success=false;console.error('Local PostgreSQL command failed:', error.stderr)}
      }
    } else assert.ok(['StopStack','StartStack'].includes(operation))
    res.setHeader('content-type','application/json');res.end(JSON.stringify({_id:{$oid:String(calls.length)},status:'Complete',success,logs:[{stdout}]}))
  }catch(error){res.statusCode=500;res.end(String(error))}
})
try {
  const source=new URL('../../server/src/db/migrations/',import.meta.url)
  for(const file of await readdir(source))if(Number(file.slice(0,4))<=39)await copyFile(new URL(file,source),join(directory,file))
  await migrateDatabase(db,pathToFileURL(directory+sep))
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  const url=new URL(`http://127.0.0.1:${server.address().port}`),headers={'content-type':'application/json'}
  const resourceSource='[[stack]]\nname="fixture"\n[[procedure]]\nname="fixture-rollout"\n'
  await syncKomodoConfig({url,headers,source:resourceSource})
  assert.equal(config.repo,'');assert.equal(config.file_contents,resourceSource)
  failPreview=true
  await assert.rejects(syncKomodoConfig({url,headers,source:resourceSource}),/preview failed/)
  failPreview=false;corruptConfig=true
  await assert.rejects(syncKomodoConfig({url,headers,source:resourceSource}),/does not match/)
  corruptConfig=false
  assert.equal(calls.some(call=>call.operation==='StopStack'),false)
  calls.length=0
  await assert.rejects(prepareForumRollout({url,headers,verifyOnly:true}),/without applying migration 0040/)
  calls.length=0
  await prepareForumRollout({url,headers})
  assert.deepEqual(calls.filter(c=>c.operation==='StopStack').map(c=>[c.stack,c.services]),[
    ['lingxiloop-app-b',['lingxiloop']],['lingxiloop-app-a',['lingxiloop']],['lingxiloop-app-b',['worker']],['lingxiloop-app-a',['worker']]])
  assert.equal(calls.filter(c=>c.operation==='StartStack').length,0)
  const successfulCalls=calls.length;calls.length=0
  const backupRoot=`/tmp/forum-upgrade-backups/${process.env.GITHUB_SHA}`
  const firstHash=(await execute('docker',['exec','lingxiloop-e2e-postgres-1','sha256sum',`${backupRoot}/123-1/product.dump`])).stdout
  process.env.GITHUB_RUN_ATTEMPT='2'
  await prepareForumRollout({url,headers})
  assert.equal((await execute('docker',['exec','lingxiloop-e2e-postgres-1','sha256sum',`${backupRoot}/123-1/product.dump`])).stdout,firstHash)
  await execute('docker',['exec','lingxiloop-e2e-postgres-1','test','-s',`${backupRoot}/123-2/product.dump`])
  calls.length=0;failBackup=true
  await assert.rejects(prepareForumRollout({url,headers}),/did not complete successfully/)
  assert.equal(calls.filter(c=>c.operation==='StartStack').length,4)
  const recoveryCalls=calls.length;calls.length=0;failBackup=false
  await migrateDatabase(db)
  await prepareForumRollout({url,headers})
  assert.deepEqual(calls.map(c=>c.operation),['RunStackService'])
  await prepareForumRollout({url,headers,verifyOnly:true})
  await mkdir('artifacts/forum',{recursive:true})
  await writeFile('artifacts/forum/rollout-rehearsal.json',JSON.stringify({passed:true,successfulCalls,recoveryCalls,schema40SkipsMaintenance:true,realPgDumpRestore:true,postMigrationCountsVerified:true,configurationTransferVerified:true,configurationFailuresPrecedeMaintenance:true,retriedReleasePreservesFirstBackup:true,limitations:['Komodo stop/start is recorded by a local HTTP fixture; production update state is verified separately.']},null,2))
  console.log('Forum rollout rehearsal passed: real backup/restore, ordered drain, failure recovery and schema-40 no-op')
}finally{
  server.close();await db.end();await pool.end();await admin.query(`DROP DATABASE ${dbName} WITH (FORCE)`);await admin.end();await rm(directory,{recursive:true,force:true})
}
