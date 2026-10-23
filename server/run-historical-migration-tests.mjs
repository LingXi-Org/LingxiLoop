// Test-only real historical package isolation; see its recorded failure model.
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {cp,mkdir,mkdtemp,readFile,readdir,rm,symlink,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {basename,join} from 'node:path'
import {execFile,spawn} from 'node:child_process'
import {promisify} from 'node:util'
const execute=promisify(execFile)
const HISTORICAL=new Set(['migration.test.ts','conversation-repair-provenance-migration.test.ts',
 'public-purpose-reader-migration.test.ts','run-trace-provenance-migration.test.ts','run-presentation-contract.test.ts'])
export function partitionMigrationTests(files){
 const historical=files.filter(f=>HISTORICAL.has(f)),current=files.filter(f=>!HISTORICAL.has(f))
 if(historical.length&&!current.includes('runtime-patch-provenance.test.ts'))current.push('runtime-patch-provenance.test.ts')
 return {current,historical}
}
export function assertHistoricalFixtureTarget(files,env){
 let url;try{url=new URL(env.INTEGRATION_DATABASE_URL)}catch{throw Error('Historical fixtures require a dedicated local test database')}
 assert.ok(env.NODE_ENV==='test'&&['postgres:','postgresql:'].includes(url.protocol)
  &&['127.0.0.1','localhost','postgres'].includes(url.hostname)&&url.search===''
  &&/(?:^|[_-])test(?:$|[_-])/i.test(url.pathname.slice(1))
  &&!/(?:^|[_-])(prod|production|main|live)(?:$|[_-])/i.test(url.pathname.slice(1)),
 'Historical fixtures require a dedicated local test database')
 assert.ok(files.length>0&&files.every(f=>HISTORICAL.has(f)),'Only explicitly owned historical migration files are allowed')
}
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
export async function runHistoricalMigrationTests(root,files,env=process.env){
 assertHistoricalFixtureTarget(files,env)
 const fixture=await mkdtemp(join(tmpdir(),'lingxiloop-historical-382-'))
 try{
  const record=JSON.parse(await readFile(join(root,'server/fixtures/historical-runtime-3.8.2.json'),'utf8'))
  assertHistoricalRecord(record)
  env={...env,DATABASE_URL:env.INTEGRATION_DATABASE_URL,DOTENV_CONFIG_PATH:join(fixture,'.no-fixture-env')}
  // npm uses the existing environment token through the existing config; no
  // credential or .env file is copied into this disposable fixture.
  let archive
  try{
   const result=await execute('npm',['pack',record.resolved,'--ignore-scripts','--json','--pack-destination',fixture,
    '--userconfig',join(root,'.npmrc'),'--loglevel','error','--fetch-retries=0','--fetch-timeout=60000'],
   {cwd:fixture,env,timeout:90_000,maxBuffer:2*1024*1024})
   const rows=JSON.parse(result.stdout);assert.equal(rows.length,1);archive=rows[0].filename
   assert.ok(typeof archive==='string'&&basename(archive)===archive&&archive.endsWith('.tgz'))
   assertHistoricalArtifact(await readFile(join(fixture,archive)),record)
  }catch{throw Error('Exact historical runtime archive could not be verified; historical tests were not skipped')}
  const packageRoot=join(fixture,'node_modules/@lyyzka/lingxios')
  await mkdir(packageRoot,{recursive:true})
  await execute('tar',['-xzf',join(fixture,archive),'-C',packageRoot,'--strip-components=1'],{timeout:30_000})
  const actual=JSON.parse(await readFile(join(packageRoot,'package.json'),'utf8'))
  assert.equal(actual.name,'@lyyzka/lingxios');assert.equal(actual.version,record.version)
  // Copy current source, so the historical tests cover today's migration code.
  await cp(join(root,'server/src'),join(fixture,'server/src'),{recursive:true})
  await cp(join(root,'src'),join(fixture,'src'),{recursive:true})
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
