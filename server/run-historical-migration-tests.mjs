// Test-only real historical package isolation; see its recorded failure model.
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {cp,mkdir,mkdtemp,readFile,readdir,rm,symlink,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {basename,isAbsolute,join} from 'node:path'
import {execFile,spawn} from 'node:child_process'
import {promisify} from 'node:util'
const execute=promisify(execFile)
const PATCH54=new Set(['runtime-patch-provenance.test.ts'])
const PATCH57=new Set(['runtime-patch57-provenance.test.ts'])
const HISTORICAL=new Set(['migration.test.ts','conversation-repair-provenance-migration.test.ts',
 'public-purpose-reader-migration.test.ts','run-trace-provenance-migration.test.ts','run-presentation-contract.test.ts'])
// Historical presentation coverage needs the pre-v3 display leaves, not today's
// new UI exports. These exact public source bytes are bundled for shallow CI
// checkouts; migration, identity, tests and all other source remain current.
const PROJECTION_SOURCE='7a255c3fe95d832e77fd29c6db9a506d111d3cf2'
const PROJECTION_FILES=[
 {path:'server/src/agent-runtime/message-projection.ts',sha256:'80f0e203665a6992e9017ff424aca79b361804d8406de7ea5579020afa15aac2'},
 {path:'src/lib/nativeMessage.ts',sha256:'2e845e9763b1a1bccafc345f91a7c172cf25391f86a40d215dfed1c57b836178'},
]
// Freeze only the test fixture's real product54/57 prefix. Current production
// migrations, package manifests/locks and the strict CAS inventory stay intact.
export const copyProduct54FixtureSource=(root,fixture)=>copyProductFixtureSource(root,fixture,54)
export const copyProduct57FixtureSource=(root,fixture)=>copyProductFixtureSource(root,fixture,57)
async function copyProductFixtureSource(root,fixture,productVersion){
 const directory=join(root,'server/src/db/migrations'),names=(await readdir(directory)).sort()
 assert.ok(names.length>=productVersion&&names.every((name,index)=>new RegExp('^'+String(index+1).padStart(4,'0')+'_[a-z0-9_]+\\.sql$').test(name)),'Product fixture requires a complete contiguous source inventory')
 const prefix=names.slice(0,productVersion),allowed=new Set(prefix)
 await cp(join(root,'server/src'),join(fixture,'server/src'),{recursive:true,filter:path=>!path.startsWith(directory+'/')||allowed.has(basename(path))})
 await cp(join(root,'src'),join(fixture,'src'),{recursive:true})
 for(const path of ['package.json','package-lock.json','server/package.json','server/package-lock.json'])await cp(join(root,path),join(fixture,path))
 assert.deepEqual((await readdir(join(fixture,'server/src/db/migrations'))).sort(),prefix,`Fixture must contain exactly product${productVersion}`)
 const migrations=await Promise.all(prefix.map(async(name,index)=>{
  const bytes=await readFile(join(directory,name));assert.deepEqual(await readFile(join(fixture,'server/src/db/migrations',name)),bytes,'Product fixture migration bytes changed')
  return {version:index+1,name:name.slice(5,-4),checksum:createHash('sha256').update(bytes).digest('hex')}
 }))
 return {productVersion,migrations,sourceProductVersion:names.length}
}
export async function copyHistoricalFixtureSource(root,fixture){
 const snapshots=await Promise.all(PROJECTION_FILES.map(async row=>{
  const bytes=await readFile(join(root,'server/fixtures/historical-projection-3.8.2',row.path))
  assert.equal(createHash('sha256').update(bytes).digest('hex'),row.sha256,'Historical projection source integrity changed')
  return {...row,bytes}
 }))
 const product54=await copyProduct54FixtureSource(root,fixture)
 for(const row of snapshots)await writeFile(join(fixture,row.path),row.bytes)
 return {sourceCommit:PROJECTION_SOURCE,files:PROJECTION_FILES.map(row=>({...row})),product54}
}
export function partitionMigrationTests(files){
 const historical=files.filter(f=>HISTORICAL.has(f)),patch54=files.filter(f=>PATCH54.has(f)),patch57=files.filter(f=>PATCH57.has(f)),current=files.filter(f=>!HISTORICAL.has(f)&&!PATCH54.has(f)&&!PATCH57.has(f))
 if(historical.length&&!patch54.length)patch54.push('runtime-patch-provenance.test.ts')
 return {current,patch54,patch57,historical}
}
function assertFixtureTarget(files,env,allowed){
 let url;try{url=new URL(env.INTEGRATION_DATABASE_URL)}catch{throw Error('Historical fixtures require a dedicated local test database')}
 assert.ok(env.NODE_ENV==='test'&&['postgres:','postgresql:'].includes(url.protocol)
  &&['127.0.0.1','localhost','postgres'].includes(url.hostname)&&url.search===''
  &&/(?:^|[_-])test(?:$|[_-])/i.test(url.pathname.slice(1))
  &&!/(?:^|[_-])(prod|production|main|live)(?:$|[_-])/i.test(url.pathname.slice(1)),
 'Historical fixtures require a dedicated local test database')
 assert.ok(files.length>0&&files.every(f=>allowed.has(f)),'Only explicitly owned fixture migration files are allowed')
}
export function assertHistoricalFixtureTarget(files,env){assertFixtureTarget(files,env,HISTORICAL)}
export function assertProduct54FixtureTarget(files,env){assertFixtureTarget(files,env,PATCH54)}
function assertHistoricalRecord(record){
 assert.ok(record.version==='3.8.2'&&record.resolved?.startsWith('https://npm.pkg.github.com/download/@lyyzka/lingxios/3.8.2/'), 'Exact official historical runtime required')
 assert.match(record.integrity,/^sha512-[A-Za-z0-9+/]{86}==$/)
}
export function assertHistoricalArtifact(bytes,record){
 assertHistoricalRecord(record)
 assert.equal('sha512-'+createHash('sha512').update(bytes).digest('base64'),record.integrity,'Historical runtime archive integrity changed')
}
export function runTestChild(args,{cwd,env=process.env,timeout=600_000}={}){
 return new Promise(resolve=>{
  const child=spawn(process.execPath,args,{cwd,env,stdio:'inherit',timeout,killSignal:'SIGKILL'})
  child.once('error',()=>resolve(1));child.once('exit',code=>resolve(code??1))
 })
}
export const runProduct54MigrationTests=(root,files,env=process.env)=>runProductMigrationTests(root,files,env,54)
export const runProduct57MigrationTests=(root,files,env=process.env)=>runProductMigrationTests(root,files,env,57)
async function runProductMigrationTests(root,files,env,productVersion){
 assertFixtureTarget(files,env,productVersion===54?PATCH54:PATCH57)
 const fixture=await mkdtemp(join(tmpdir(),`lingxiloop-current-product${productVersion}-`))
 try{
  env={...env,DATABASE_URL:env.INTEGRATION_DATABASE_URL,DOTENV_CONFIG_PATH:join(fixture,'.no-fixture-env')}
  const profile=await copyProductFixtureSource(root,fixture,productVersion)
  await symlink(join(root,'node_modules'),join(fixture,'node_modules'),'junction')
  // Four actual current manifests/locks are copied verbatim; borrow the exact
  // installed formal package and dependencies read-only, without version edits.
  const lock=JSON.parse(await readFile(join(root,'server/package-lock.json'),'utf8')).packages['node_modules/@lyyzka/lingxios']
  assert.ok(lock?.version&&lock.integrity&&lock.resolved,'Current formal runtime lock required')
  const prove=`import assert from 'node:assert/strict';import{releaseVersions}from'@lyyzka/lingxios';import{loadLockedRuntimePackage}from'./server/src/db/runtime-profile.ts';import{loadRuntimePatchInventory}from'./server/src/db/runtime-patch.ts';const locked=await loadLockedRuntimePackage();assert.equal(releaseVersions.runtime,${JSON.stringify(lock.version)});assert.equal(locked.runtime,${JSON.stringify(lock.version)});assert.equal(locked.integrity,${JSON.stringify(lock.integrity)});assert.equal(locked.tarball,${JSON.stringify(lock.resolved)});assert.equal((await loadRuntimePatchInventory(${productVersion})).length,${productVersion});console.log('[integration product${productVersion}] actual formal runtime '+releaseVersions.runtime+'; exact current four manifests/locks; frozen${productVersion} migrations');`
  if(await runTestChild(['--import','tsx','--input-type=module','-e',prove],{cwd:fixture,env,timeout:30_000}))return 1
  if(profile.sourceProductVersion>productVersion){
   const reject=`import assert from 'node:assert/strict';import{loadRuntimePatchInventory}from'./server/src/db/runtime-patch.ts';await assert.rejects(loadRuntimePatchInventory(${productVersion}),/Runtime patch requires complete product${productVersion} inventory/);console.log('[integration product${productVersion}] current product${profile.sourceProductVersion} checkout correctly rejects strict production CAS inventory');`
   if(await runTestChild(['--import','tsx','--input-type=module','-e',reject],{cwd:root,env,timeout:30_000}))return 1
  }
  return await runTestChild(['--import','tsx','--experimental-test-module-mocks','--test','--test-reporter=tap','--test-concurrency=1','--test-force-exit',
   ...files.map(f=>join(fixture,'server/src/__integration__',f))],{cwd:fixture,env})
 }finally{await rm(fixture,{recursive:true,force:true})}
}
export async function runHistoricalMigrationTests(root,files,env=process.env){
 assertHistoricalFixtureTarget(files,env)
 const fixture=await mkdtemp(join(tmpdir(),'lingxiloop-historical-382-'))
 try{
  const record=JSON.parse(await readFile(join(root,'server/fixtures/historical-runtime-3.8.2.json'),'utf8'))
  assertHistoricalRecord(record)
  env={...env,DATABASE_URL:env.INTEGRATION_DATABASE_URL,DOTENV_CONFIG_PATH:join(fixture,'.no-fixture-env')}
  // npm uses the existing environment token through the existing config; no
  // credential or .env file is copied into this disposable fixture.
  let archive,archiveStage='npm-pack'
  if(env.LINGXILOOP_HISTORICAL_RUNTIME_ARCHIVE){
   const path=env.LINGXILOOP_HISTORICAL_RUNTIME_ARCHIVE;assert.ok(isAbsolute(path),'Explicit historical archive must be absolute')
   const bytes=await readFile(path);assertHistoricalArtifact(bytes,record)
   archive='validated-historical-runtime.tgz';await writeFile(join(fixture,archive),bytes,{flag:'wx'})
   console.log('[integration historical] validated archived official runtime 3.8.2 against pinned integrity; no registry request')
  }else try{
   const pack=()=>execute('npm',['pack',record.resolved,'--ignore-scripts','--json','--pack-destination',fixture,
    '--userconfig',join(root,'.npmrc'),'--loglevel','error','--fetch-retries=0','--fetch-timeout=60000'],
   {cwd:fixture,env,timeout:90_000,maxBuffer:2*1024*1024})
   let result;try{result=await pack()}catch(error){if(/\b(?:E401|401)\b/.test(error.stderr??''))result=await pack();else throw error}
   archiveStage='npm-result'
   const rows=JSON.parse(result.stdout);assert.equal(rows.length,1);archive=rows[0].filename
   assert.ok(typeof archive==='string'&&basename(archive)===archive&&archive.endsWith('.tgz'))
   archiveStage='archive-integrity';assertHistoricalArtifact(await readFile(join(fixture,archive)),record)
  }catch(error){const code=(error.stderr??'').match(/\b(?:E401|E403|E404|ENOENT|ENOSPC|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|EACCES)\b/)?.[0]??String(error.code??'verification').replace(/[^A-Z0-9_-]/gi,'').slice(0,40);throw Error('Exact historical runtime archive could not be verified ('+archiveStage+':'+code+(error.code==='ENOENT'?'; '+String(error.syscall??'')+' '+basename(error.path??''):'' )+'); historical tests were not skipped')}
  const packageRoot=join(fixture,'node_modules/@lyyzka/lingxios')
  await mkdir(packageRoot,{recursive:true})
  await execute('tar',['-xzf',join(fixture,archive),'-C',packageRoot,'--strip-components=1'],{timeout:30_000})
  const actual=JSON.parse(await readFile(join(packageRoot,'package.json'),'utf8'))
  assert.equal(actual.name,'@lyyzka/lingxios');assert.equal(actual.version,record.version)
  const projection=await copyHistoricalFixtureSource(root,fixture)
  console.log(`[integration historical] display fixture source ${projection.sourceCommit}; current migration code and tests retained`)
  const key='@lyyzka/lingxios',manifest={name:'historical-migration-fixture',private:true,type:'module',dependencies:{[key]:record.version}}
  const lock={name:manifest.name,lockfileVersion:3,packages:{'':manifest,['node_modules/'+key]:record}}
  for(const prefix of ['', 'server/']){
   await writeFile(join(fixture,prefix+'package.json'),JSON.stringify(manifest)+'\n')
   await writeFile(join(fixture,prefix+'package-lock.json'),JSON.stringify(lock)+'\n')
  }
  // Borrow unrelated installed test dependencies read-only; the historical
  // runtime itself is the verified physical package in this fixture.
  for(const name of await readdir(join(root,'node_modules'))){
   if(name.startsWith('.')||name==='@lyyzka')continue
   await symlink(join(root,'node_modules',name),join(fixture,'node_modules',name),'junction')
  }
  const prove=`import assert from 'node:assert/strict';import{releaseVersions}from'@lyyzka/lingxios';import{loadLockedRuntimePackage}from'./server/src/db/runtime-profile.ts';assert.equal(releaseVersions.runtime,'3.8.2');assert.equal((await loadLockedRuntimePackage()).runtime,'3.8.2');console.log('[integration historical] actual formal runtime 3.8.2; ${files.length} file(s)');`
  if(await runTestChild(['--import','tsx','--input-type=module','-e',prove],{cwd:fixture,env,timeout:30_000}))return 1
  return await runTestChild(['--import','tsx','--experimental-test-module-mocks','--test','--test-reporter=tap','--test-concurrency=1','--test-force-exit',
   ...files.map(f=>join(fixture,'server/src/__integration__',f))],{cwd:fixture,env})
 }finally{await rm(fixture,{recursive:true,force:true})}
}
