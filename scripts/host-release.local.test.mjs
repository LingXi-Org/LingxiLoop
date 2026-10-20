// Real local Docker contract. No production destination, no registry pull.
import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {execFileSync,spawnSync} from 'node:child_process'
import {assertHostComposeChange} from './host-release-compose.mjs'

test('effective candidate preserves all existing policy, with only immutable image and never pull changes',async()=>{
 for(const side of ['a','b']){
  const original=await readFile(new URL(`../deploy/komodo/lingxiloop-app-${side}/compose.yml`,import.meta.url),'utf8')
  const old=/lingxiloop-server:([a-f0-9]{40})/.exec(original)[1],next='e'.repeat(40)
  const target=original.replaceAll(old,next).replace('pull_policy: always','pull_policy: never')
  assert.equal(assertHostComposeChange(original,target,old,next),true)
  assert.throws(()=>assertHostComposeChange(original,target.replace('read_only: true','read_only: false'),old,next))
  assert.throws(()=>assertHostComposeChange(original,target.replace('NODE_ENV: production','NODE_ENV: other'),old,next))
  assert.throws(()=>assertHostComposeChange(original,target.replace('lingxios-homes:/var/lib/lingxios/homes','different:/var/lib/lingxios/homes'),old,next))
  assert.throws(()=>assertHostComposeChange(original,target.replaceAll('pull_policy: never','pull_policy: always'),old,next))
 }
})
test('real Compose up exact Komodo arguments override always, skip dependencies and never pull missing images',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'host-release-compose-')),project='hostrelease'+process.pid,tag=`127.0.0.1:1/host-release-contract:${process.pid}`
 const compose=join(directory,'compose.yml'),receipts=[]
 const docker=(args,expected=0)=>{
  const r=spawnSync('docker',args,{encoding:'utf8',timeout:30000,maxBuffer:1024*1024})
  receipts.push({args,status:r.status})
  assert.equal(r.error,undefined);assert.equal(r.status,expected,`${args.join(' ')}: ${r.stderr}`);return r.stdout
 }
 const args=['compose','-p',project,'-f',compose]
 try{
  // Existing local test image only; absence fails instead of silently pulling.
  docker(['image','inspect','redis:7-alpine','--format','{{.Id}}'])
  docker(['tag','redis:7-alpine',tag])
  await writeFile(compose,`services:\n  db-migrate:\n    image: ${tag}\n    pull_policy: always\n    command: ["sh", "-c", "sleep 120"]\n    network_mode: none\n  web:\n    image: ${tag}\n    pull_policy: always\n    command: ["sh", "-c", "sleep 120"]\n    network_mode: none\n    depends_on: [db-migrate]\n`)
  docker([...args,'up','-d','--no-deps','--pull','never','--','web'])
  assert.equal(docker([...args,'ps','-a','--services']).trim(),'web')
  // Native RunStackService supplies --rm/--no-tty/--no-deps, but no --pull.
  await writeFile(compose,(await readFile(compose,'utf8')).replaceAll('pull_policy: always','pull_policy: never'))
  const help=docker(['compose','run','--help']),noTTY=help.includes('--no-tty')?'--no-tty':'-T'
  // Compose2.40.3 spells this --no-TTY/-T; Komodo2.3.3 emits --no-tty,
  // supported by the production installation but not this older local CLI.
  // Record the gap rather than claiming exact native oneoff command coverage.
  receipts.push({operation:'oneoff-tty-compatibility',nativeLongFlagSupported:noTTY==='--no-tty',localFlag:noTTY})
  docker([...args,'run','--rm',noTTY,'--no-deps','--','db-migrate','true'])
  assert.equal(docker([...args,'ps','-a','--services']).trim(),'web')
  await writeFile(compose,(await readFile(compose,'utf8')).replaceAll(tag,tag+'missing'))
  const missing=spawnSync('docker',[...args,'up','-d','--no-deps','--pull','never','--','web'],{encoding:'utf8',timeout:30000})
  assert.notEqual(missing.status,0);assert.doesNotMatch(missing.stderr,/Pulling|connection refused|Get "http/)
  receipts.push({operation:'missing-cache-refused',status:missing.status})
  await writeFile(join(tmpdir(),'host-release-compose-contract.json'),JSON.stringify({passed:true,composeVersion:execFileSync('docker',['compose','version'],{encoding:'utf8'}).trim(),receipts},null,2)+'\n')
 }finally{
  spawnSync('docker',[...args,'down','--remove-orphans'],{encoding:'utf8',timeout:30000})
  spawnSync('docker',['image','rm',tag],{encoding:'utf8',timeout:30000})
  await rm(directory,{recursive:true,force:true})
 }
})
