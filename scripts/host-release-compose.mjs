import {spawnSync} from 'node:child_process'
import {isDeepStrictEqual as equal} from 'node:util'
const IMAGE='accel.way2api.fun/ghcr.io/lingxi-org/lingxiloop-server:'
const services=['db-migrate','lingxiloop','worker']
export function parsePublicCompose(source){
 if(typeof source!=='string'||Buffer.byteLength(source)>512*1024)throw Error('Invalid public Compose source')
 const r=spawnSync('docker',['compose','--env-file','/dev/null','--project-name','lingxiloop-host-preflight','--file','-','config','--no-interpolate','--no-env-resolution','--no-path-resolution','--format','json'],
  {input:source,encoding:'utf8',env:{PATH:process.env.PATH},timeout:10000,killSignal:'SIGKILL',maxBuffer:1024*1024})
 if(r.error||r.status!==0)throw Error('Public Compose validation failed')
 try{return JSON.parse(r.stdout)}catch{throw Error('Public Compose validation failed')}
}
export function assertHostComposeChange(source,target,sourceSha,targetSha,pullPolicy='never'){
 const before=parsePublicCompose(source),after=parsePublicCompose(target)
 const names=Object.keys(before.services??{}).sort()
 if(!equal(names,Object.keys(after.services??{}).sort())||!services.every(s=>names.includes(s))||names.some(s=>![...services,'gateway'].includes(s)))throw Error('Unexpected application services')
 for(const service of services){
  const a=before.services[service],b=after.services[service]
  if(a.image!==IMAGE+sourceSha||b.image!==IMAGE+targetSha||b.pull_policy!==pullPolicy||a.build||b.build)throw Error('Image pin/pull policy differs')
  // Compare everything except the two intentionally changed image fields.
  a.image=b.image;a.pull_policy=b.pull_policy
 }
 // Compose retains extension anchors; compare their non-image policy too.
 for(const config of [before,after])for(const [k,v] of Object.entries(config))if(k.startsWith('x-')&&v&&typeof v==='object'){
  if('image'in v)v.image=IMAGE+targetSha
  if('pull_policy'in v)v.pull_policy=pullPolicy
 }
 if(!equal(before,after))throw Error('Release changes environment/security/volumes or unrelated Compose policy')
 return true
}
