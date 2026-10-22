// Failure model: Windows core.autocrlf can alter pinned SQL/vendor bytes even
// when Git reports no source changes. Exercise a real fresh Git checkout.
import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp, mkdir, copyFile, readFile, readdir, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {dirname, join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {execFileSync} from 'node:child_process'

test('Windows autocrlf checkout preserves pinned seed, migration and vendor bytes',async()=>{
 const root=resolve(dirname(fileURLToPath(import.meta.url)),'..')
 const directory=await mkdtemp(join(tmpdir(),'lingxiloop-checkout-bytes-'))
 const fixture=join(directory,'repo'),output=join(directory,'checkout')
 const vendor=JSON.parse(await readFile(join(root,'third_party/zcode/manifest.json'),'utf8'))
 const migrations=(await readdir(join(root,'server/src/db/migrations'))).filter(x=>x.endsWith('.sql'))
 const paths=['scripts/public-text-seed-check.sql',...migrations.map(x=>'server/src/db/migrations/'+x),...vendor.files.map(x=>'third_party/zcode/'+x.path)]
 const git=args=>execFileSync('git',args,{cwd:fixture,stdio:['ignore','pipe','pipe']})
 try{
  await mkdir(fixture);await mkdir(output)
  for(const path of ['.gitattributes',...paths]){
   await mkdir(dirname(join(fixture,path)),{recursive:true})
   await copyFile(join(root,path),join(fixture,path))
  }
  git(['init','--quiet'])
  git(['-c','core.autocrlf=false','add','--','.'])
  // Export to a fresh directory so Git cannot reuse cached worktree stat data.
  git(['-c','core.autocrlf=true','checkout-index','--all','--prefix='+output.replaceAll('\\','/')+'/'])
  for(const path of paths)assert.deepEqual(await readFile(join(output,path)),await readFile(join(root,path)),path)
 }finally{
  assert.equal(dirname(directory),resolve(tmpdir()))
  await rm(directory,{recursive:true,force:true})
 }
})
