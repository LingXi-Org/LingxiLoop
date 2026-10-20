// Resolve YAML anchors/overrides with Compose itself; never interpolate secrets
// or contact the Docker daemon. Only the three writer/migrator image pins escape.
import {spawnSync} from 'node:child_process'
const IMAGE='accel.way2api.fun/ghcr.io/lingxi-org/lingxiloop-server:'
const SERVICES=['db-migrate','lingxiloop','worker'],SHA=/^[a-f0-9]{40}$/
export function assertEffectiveComposePin(source,expected) {
 if(typeof source!=='string'||Buffer.byteLength(source)>512*1024)throw Error('Compose input invalid')
 const result=spawnSync('docker',[
  'compose','--env-file','/dev/null','--project-name','lingxiloop-schema-preflight','--file','-',
  'config','--no-interpolate','--no-env-resolution','--no-path-resolution','--format','json',
 ],{input:source,encoding:'utf8',env:{PATH:process.env.PATH},timeout:10000,killSignal:'SIGKILL',maxBuffer:1024*1024})
 // No rendered config/stderr in exceptions: it can contain environment values.
 if(result.error||result.status!==0)throw Error('Compose configuration unavailable or invalid')
 let config
 try{config=JSON.parse(result.stdout)}catch{throw Error('Compose configuration invalid')}
 const pins=SERVICES.map(service=>{
  const image=config?.services?.[service]?.image
  if(typeof image!=='string'||!image.startsWith(IMAGE)||!SHA.test(image.slice(IMAGE.length)))throw Error('Every writer and migrator needs an immutable image pin')
  return image.slice(IMAGE.length)
 })
 if(new Set(pins).size!==1||(expected!==undefined&&(!SHA.test(expected)||pins[0]!==expected)))throw Error('Effective writer and migrator image pins disagree')
 return pins[0]
}
