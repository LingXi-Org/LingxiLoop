import assert from 'node:assert/strict'
import {readFile,writeFile,realpath} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {execFileSync} from 'node:child_process'
const root='/workspace/LingxiLoop-formal-runtime380-pin'
const sha=bytes=>createHash('sha256').update(bytes).digest('hex')
const raw=await readFile('/workspace/runtime380-release/package-verification.json')
assert.equal(sha(raw),'f784cf95175b25d5e5edcd6eddb3fa234d189b03ad314302580bec216881b2ff')
const receipt=JSON.parse(raw),registryRaw=await readFile('/workspace/runtime380-release/registry.json'),registry=JSON.parse(registryRaw)
assert.equal(sha(registryRaw),receipt.registrySha256)
assert.equal(registry.version,'3.8.0');assert.equal(registry.gitHead,'9ae65079085f196870ece41500472a333f9abfbf')
assert.equal(registry.dist.integrity,receipt.integrity)
const entry=import.meta.resolve('@lyyzka/lingxios')
const actualRoot=await realpath(root+'/node_modules/@lyyzka/lingxios')
assert.equal(actualRoot,'/workspace/public-run-trace-contract/formal380/node_modules/@lyyzka/lingxios')
const {releaseVersions,packageResources}=await import(entry)
assert.deepEqual(releaseVersions,receipt.versions)
assert.equal(sha(await readFile(packageResources().schema)),receipt.schemaHash)
const locks=[]
for(const prefix of ['', 'server/']){
 const pkg=JSON.parse(await readFile(root+'/'+prefix+'package.json','utf8'))
 const lock=JSON.parse(await readFile(root+'/'+prefix+'package-lock.json','utf8'))
 const current=lock.packages['node_modules/@lyyzka/lingxios']
 assert.equal(pkg.dependencies['@lyyzka/lingxios'],'3.8.0')
 assert.equal(current.version,'3.8.0');assert.equal(current.integrity,registry.dist.integrity);assert.equal(current.resolved,registry.dist.tarball)
 const old=JSON.parse(execFileSync('git',['show','3b8a712af056b6937e7735d9328c646b920f75d8:'+prefix+'package-lock.json'],{cwd:root,encoding:'utf8'}))
 old.packages[''].dependencies['@lyyzka/lingxios']='3.8.0'
 for(const key of ['version','resolved','integrity'])old.packages['node_modules/@lyyzka/lingxios'][key]=current[key]
 assert.deepEqual(lock,old)
 locks.push({path:prefix+'package-lock.json',sha256:sha(await readFile(root+'/'+prefix+'package-lock.json')),version:current.version,resolved:current.resolved,integrity:current.integrity})
}
const allowed=new Set(['package.json','package-lock.json','server/package.json','server/package-lock.json'])
const changed=execFileSync('git',['diff','--name-only','3b8a712af056b6937e7735d9328c646b920f75d8'],{cwd:root,encoding:'utf8'}).trim().split('\n').filter(Boolean)
assert.ok(changed.every(path=>allowed.has(path)||path.startsWith('docs/evidence/formal-runtime380-pin/')))
const output={format:'formal-runtime380-consumer/v1',verified:true,base:'3b8a712af056b6937e7735d9328c646b920f75d8',registryGitHead:registry.gitHead,packageReceiptSha256:sha(raw),versions:releaseVersions,schemaHash:receipt.schemaHash,actualPackageRoot:actualRoot,resolvedEntry:entry,locks,unrelatedLockEntriesUnchanged:true,implementationSqlLeafAndProfileUnchanged:true}
await writeFile(root+'/docs/evidence/formal-runtime380-pin/consumer-verification.json',JSON.stringify(output,null,2)+'\n')
console.log(JSON.stringify(output,null,2))
