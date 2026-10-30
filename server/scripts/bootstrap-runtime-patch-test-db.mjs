// Explicit local test bootstrap; never imported by product startup or deploy.
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {execFile,spawnSync} from 'node:child_process'
import {cp,mkdir,mkdtemp,readFile,readdir,rm,symlink,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {basename,isAbsolute,join,resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {promisify} from 'node:util'
import {Client} from 'pg'
import {releaseVersions} from '@lyyzka/lingxios'

const execute=promisify(execFile),root=fileURLToPath(new URL('../../',import.meta.url))
export function assertRuntimePatchTestTarget(env){
 assert.equal(env.NODE_ENV,'test','bootstrap requires explicit test mode')
 const url=new URL(env.INTEGRATION_DATABASE_URL??'')
 assert.ok(['postgres:','postgresql:'].includes(url.protocol)&&url.hostname==='127.0.0.1'
  &&['5432','15432'].includes(url.port)&&!url.search&&!url.hash,'bootstrap requires an explicit local test service port')
 const database=decodeURIComponent(url.pathname.slice(1))
 assert.match(database,/^[A-Za-z0-9_]+$/)
 assert.match(database,/(?:^|_)test(?:_|$)/)
 assert.doesNotMatch(database,/(?:^|[_-])(prod|production|main|live)(?:$|[_-])/i)
 assert.equal(env.DATABASE_URL,env.INTEGRATION_DATABASE_URL,'bootstrap database bindings must match')
 return url.toString()
}
async function main(){
 const connection=assertRuntimePatchTestTarget(process.env)
 const env={...process.env,DATABASE_URL:connection,INTEGRATION_DATABASE_URL:connection,DOTENV_CONFIG_PATH:'/dev/null'}
 const run=(code,cwd=root)=>{
  const result=spawnSync(process.execPath,['--import','tsx','--input-type=module'],{cwd,env,input:code,stdio:['pipe','inherit','inherit'],timeout:120000})
  assert.equal(result.status,0,'local test bootstrap child failed')
 }
 if(String(releaseVersions.runtime)!=='3.8.19'){
  run("import{migrateDatabase}from'./server/src/db/migrate.ts';import{pool}from'./server/src/db/pool.ts';try{await migrateDatabase()}finally{await pool.end()}")
  return
 }
 const files=(await readdir(join(root,'server/src/db/migrations'))).sort()
 assert.equal(files.length,60)
 const expected=await Promise.all(files.map(async(name,index)=>({version:index+1,name:name.slice(5,-4),checksum:createHash('sha256').update(await readFile(join(root,'server/src/db/migrations',name))).digest('hex')})))
 const db=new Client({connectionString:connection,connectionTimeoutMillis:5000})
 let fresh=false
 try{
  await db.connect()
  const tracked=(await db.query("SELECT to_regclass('public.schema_migrations') AS name")).rows[0].name
  if(tracked){
   assert.deepEqual((await db.query('SELECT version,name,checksum FROM public.schema_migrations ORDER BY version')).rows,expected)
   assert.ok(['3.8.18','3.8.19'].includes((await db.query('SELECT runtime_version FROM public.lingxios_installation WHERE singleton')).rows[0]?.runtime_version))
  }else{
   const count=(await db.query("SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','lingxios') AND c.relkind IN ('r','p','v','m','S','f')")).rows[0].n
   assert.equal(count,0,'bootstrap refuses untracked existing relations');fresh=true
  }
 }finally{await db.end()}
 if(fresh){
  const fixture=await mkdtemp(join(tmpdir(),'lingxi-formal18-product60-test-'))
  try{
   const record=JSON.parse(await readFile(join(root,'server/fixtures/runtime-patch-source-3.8.18.json'),'utf8'))
   assert.equal(record.version,'3.8.18');assert.match(record.resolved,/^https:\/\/npm\.pkg\.github\.com\/download\/@lyyzka\/lingxios\/3\.8\.18\/[a-f0-9]{40}$/)
   let archive=env.LINGXILOOP_RUNTIME_PATCH_SOURCE_ARCHIVE
   if(archive)assert.ok(isAbsolute(archive),'explicit source archive must be absolute')
   else{
    const packed=await execute('npm',['pack',record.resolved,'--ignore-scripts','--json','--pack-destination',fixture,'--userconfig',join(root,'.npmrc'),'--loglevel','error','--fetch-retries=0','--fetch-timeout=60000'],{cwd:root,env,timeout:90000,maxBuffer:2*1024*1024})
    const [entry]=JSON.parse(packed.stdout);assert.equal(basename(entry.filename),entry.filename);archive=join(fixture,entry.filename)
   }
   assert.equal('sha512-'+createHash('sha512').update(await readFile(archive)).digest('base64'),record.integrity,'formal18 source archive integrity changed')
   for(const path of ['server/src','src','shared'])await cp(join(root,path),join(fixture,path),{recursive:true})
   const modules=join(fixture,'node_modules');await mkdir(join(modules,'@lyyzka/lingxios'),{recursive:true})
   for(const name of await readdir(join(root,'node_modules')))if(name!=='@lyyzka')await symlink(join(root,'node_modules',name),join(modules,name),'junction')
   for(const name of await readdir(join(root,'node_modules/@lyyzka')))if(name!=='lingxios')await symlink(join(root,'node_modules/@lyyzka',name),join(modules,'@lyyzka',name),'junction')
   await execute('tar',['-xzf',archive,'--strip-components=1','-C',join(modules,'@lyyzka/lingxios')],{timeout:30000})
   const key='@lyyzka/lingxios',manifest={name:'verified-formal18-product60-source-fixture',private:true,type:'module',dependencies:{[key]:record.version}}
   const lock={lockfileVersion:3,packages:{'':manifest,['node_modules/'+key]:record}}
   for(const prefix of ['', 'server/']){
    await writeFile(join(fixture,prefix+'package.json'),JSON.stringify(manifest)+'\n')
    await writeFile(join(fixture,prefix+'package-lock.json'),JSON.stringify(lock)+'\n')
   }
   run("import assert from'node:assert/strict';import{releaseVersions}from'@lyyzka/lingxios';import{loadLockedRuntimePackage}from'./server/src/db/runtime-profile.ts';import{migrateDatabase}from'./server/src/db/migrate.ts';import{pool}from'./server/src/db/pool.ts';try{assert.equal(releaseVersions.runtime,'3.8.18');assert.equal((await loadLockedRuntimePackage()).runtime,'3.8.18');console.log('[integration bootstrap] verified actual formal18 source fixture');assert.equal((await migrateDatabase()).length,60)}finally{await pool.end()}",fixture)
  }finally{await rm(fixture,{recursive:true,force:true})}
 }
 run("import assert from'node:assert/strict';import{Pool}from'pg';import{loadRuntimePatchInventory,applyPublishedRuntimePatch}from'./server/src/db/runtime-patch.ts';import{loadLockedRuntimePackage,PUBLIC_PURPOSE_SCHEMA_HASH}from'./server/src/db/runtime-profile.ts';const db=new Pool({connectionString:process.env.DATABASE_URL,max:1});try{const locked=await loadLockedRuntimePackage();assert.equal(locked.runtime,'3.8.19');const migrations=await loadRuntimePatchInventory(60),source={runtime:'3.8.18',schema:14,protocol:11,schemaHash:PUBLIC_PURPOSE_SCHEMA_HASH,productVersion:60,migrations},target={...source,runtime:'3.8.19',integrity:locked.integrity,tarball:locked.tarball};const installed=(await db.query('SELECT runtime_version FROM public.lingxios_installation WHERE singleton')).rows[0]?.runtime_version;if(installed==='3.8.18')assert.equal((await applyPublishedRuntimePatch(db,source,target)).updated,1);else assert.equal(installed,'3.8.19')}finally{await db.end()}")
 run("import assert from'node:assert/strict';import{migrateDatabase}from'./server/src/db/migrate.ts';import{pool}from'./server/src/db/pool.ts';try{assert.deepEqual(await migrateDatabase(),[]);console.log('[integration bootstrap] actual formal19 CAS; current60; no target migrations')}finally{await pool.end()}")
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{
 console.error(JSON.stringify({testBootstrap:'refused',code:typeof error.code==='string'?error.code:'BOOTSTRAP_REFUSED'}));process.exitCode=1
})
