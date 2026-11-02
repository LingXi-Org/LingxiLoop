// Test-only exact published source isolation. No SDK patching or product adoption.
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {execFile} from 'node:child_process'
import {cp,mkdir,mkdtemp,readFile,readdir,rm,symlink,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {basename,isAbsolute,join} from 'node:path'
import {promisify} from 'node:util'
const execute=promisify(execFile)

export const withFormal19TestFixture=(root,env,run)=>withFormalRuntimeTestFixture(root,env,'3.8.19',run)
export const withFormal20TestFixture=(root,env,run)=>withFormalRuntimeTestFixture(root,env,'3.8.20',run)
async function withFormalRuntimeTestFixture(root,env,version,run){
 assert.ok(['3.8.19','3.8.20'].includes(version))
 const userconfig=env.LINGXILOOP_TEST_PACKAGE_USERCONFIG??join(root,'.npmrc')
 const url=new URL(env.INTEGRATION_DATABASE_URL??'')
 assert.equal(env.NODE_ENV,'test')
 assert.ok(['postgres:','postgresql:'].includes(url.protocol)&&['127.0.0.1','localhost','postgres'].includes(url.hostname)&&!url.search)
 assert.match(url.pathname,/(?:^|_)test(?:_|$)/);assert.doesNotMatch(url.pathname,/(?:^|[_-])(prod|production|main|live)(?:$|[_-])/i)
 assert.equal(env.DATABASE_URL,env.INTEGRATION_DATABASE_URL)
 const record=JSON.parse(await readFile(join(root,`server/fixtures/runtime-patch-source-${version}.json`),'utf8'))
 assert.equal(record.version,version)
 const prefix=`https://npm.pkg.github.com/download/@lyyzka/lingxios/${version}/`
 assert.ok(record.resolved.startsWith(prefix));assert.match(record.resolved.slice(prefix.length),/^[a-f0-9]{40}$/)
 const fixture=await mkdtemp(join(tmpdir(),`lingxi-actual-formal${version}-test-`))
 try{
  let archive=env[version==='3.8.19'?'LINGXILOOP_RUNTIME_PATCH_19_SOURCE_ARCHIVE':'LINGXILOOP_RUNTIME_PATCH_20_SOURCE_ARCHIVE']
  if(archive)assert.ok(isAbsolute(archive))
  else{
   const packed=await execute('npm',['pack',record.resolved,'--ignore-scripts','--json','--pack-destination',fixture,'--userconfig',userconfig,'--loglevel','error','--fetch-retries=0','--fetch-timeout=60000'],{cwd:root,env,timeout:90000,maxBuffer:2*1024*1024})
   const [entry]=JSON.parse(packed.stdout);assert.equal(basename(entry.filename),entry.filename);archive=join(fixture,entry.filename)
  }
  assert.equal('sha512-'+createHash('sha512').update(await readFile(archive)).digest('base64'),record.integrity,`formal${version} source archive integrity changed`)
  for(const path of ['server/src','src','shared','server/scripts','server/fixtures'])await cp(join(root,path),join(fixture,path),{recursive:true})
  // Historical formal19 fixtures contain the exact product60 source inventory.
  if(version==='3.8.19')await rm(join(fixture,'server/src/db/migrations/0061_slides_workspaces.sql'),{force:true})
  const modules=join(fixture,'node_modules'),sdk=join(modules,'@lyyzka/lingxios');await mkdir(sdk,{recursive:true})
  await execute('tar',['-xzf',archive,'--strip-components=1','-C',sdk],{timeout:30000})
  assert.equal(JSON.parse(await readFile(join(sdk,'package.json'),'utf8')).version,record.version)
  for(const name of await readdir(join(root,'node_modules')))if(!name.startsWith('.')&&name!=='@lyyzka')await symlink(join(root,'node_modules',name),join(modules,name),'junction')
  for(const name of await readdir(join(root,'node_modules/@lyyzka')))if(name!=='lingxios')await symlink(join(root,'node_modules/@lyyzka',name),join(modules,'@lyyzka',name),'junction')
  const key='@lyyzka/lingxios',manifest={name:`verified-formal${version}-test-source`,private:true,type:'module',dependencies:{[key]:record.version}}
  const lock={lockfileVersion:3,packages:{'':manifest,['node_modules/'+key]:record}}
  for(const prefix of ['', 'server/']){
   await writeFile(join(fixture,prefix+'package.json'),JSON.stringify(manifest)+'\n')
   await writeFile(join(fixture,prefix+'package-lock.json'),JSON.stringify(lock)+'\n')
  }
  return await run(fixture,{...env,DOTENV_CONFIG_PATH:'/dev/null',LINGXILOOP_TEST_PACKAGE_USERCONFIG:userconfig})
 }finally{await rm(fixture,{recursive:true,force:true})}
}
