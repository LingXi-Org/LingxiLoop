import { readFileSync } from 'node:fs'
export {encryptSecrets,sha256} from './crypto.mjs'
const NODE='/opt/lingxi-release/node-v22.23.3-linux-x64/bin/node'
const check=(v)=>{if(!v)throw Error('INVALID_BOOTSTRAP_INPUT')}
const quote=s=>`'${s.replaceAll("'","'\\''")}'`
function runtime(action,data){
 const crypto=readFileSync(new URL('./crypto.mjs',import.meta.url),'utf8'),host=readFileSync(new URL('./host-runtime.mjs',import.meta.url),'utf8').replace("import { keypair, decryptSecrets, sha256, secretNames } from './crypto.mjs'",'')
 const source=crypto+'\n'+host.replace('const check=(v,c)=>{if(!v)throw Error(c)}','')+`\ntry { console.log(JSON.stringify(${action}(${data===undefined?'':JSON.stringify(data)}))) } catch { console.error('BOOTSTRAP_FAILED_QUERY_RECEIPT');process.exitCode=1 }`
 return `${NODE} --input-type=module -e ${quote(source)}`
}
export function buildInstallCommand({opsSha,bundleSha256,bundleBase64}) {
 check(/^[a-f0-9]{40}$/.test(opsSha)&&/^[a-f0-9]{64}$/.test(bundleSha256))
 if(bundleBase64!==undefined)check(typeof bundleBase64==='string'&&bundleBase64.length<=1000000&&/^[A-Za-z0-9+/]+={0,2}$/.test(bundleBase64))
 const script=readFileSync(new URL('./install.py',import.meta.url),'utf8')
 const argument=JSON.stringify({opsSha,bundleSha256,...(bundleBase64?{bundleBase64}:{})})
 // Keep individual terminal input lines below the PTY canonical line limit.
 const encoded=argument.match(/.{1,96}/g).map(quote).join('\\\n')
 return `python3 -c ${quote(script)} ${encoded}`
}
export const buildPublicKeyCommand=()=>runtime('publicKey')
export function buildInventoryCommand(){return `python3 -c ${quote(readFileSync(new URL('./inventory.py',import.meta.url),'utf8'))}`}
export function buildRuntimeMetadataCommand(){return `python3 -c ${quote(readFileSync(new URL('./runtime-metadata.py',import.meta.url),'utf8'))}`}
export function buildTunnelCommand(data){
 check(data&&Object.keys(data).sort().join(',')==='action,host,origin,remoteConfigSha256,tunnelId'&&['query','install','start','enable'].includes(data.action)&&['a','b'].includes(data.host)&&data.origin==='http://127.0.0.1:17951'&&/^[a-f0-9-]{36}$/.test(data.tunnelId)&&/^[a-f0-9]{64}$/.test(data.remoteConfigSha256))
 return `python3 -c ${quote(readFileSync(new URL('./tunnel.py',import.meta.url),'utf8'))} ${quote(JSON.stringify(data))}`
}
export function buildBackendRouteCommand(data){
 check(data&&['query','apply'].includes(data.action)&&Object.keys(data).every(k=>['action','expectedHash'].includes(k))&&(data.expectedHash===undefined||/^sha256:[a-f0-9]{64}$/.test(data.expectedHash)))
 return `printf '%s' ${quote(JSON.stringify(data))} | python3 -c ${quote(readFileSync(new URL('./backend-route.py',import.meta.url),'utf8'))}`
}
export function buildCredentialCommand(envelope){check(envelope?.version===1&&/^[a-f0-9]{32}$/.test(envelope.requestId)&&JSON.stringify(envelope).length<200000&&Object.keys(envelope).sort().join(',')==='ciphertext,hostPublicKeyHash,iv,publicKey,requestId,tag,version'&&['publicKey','iv','ciphertext','tag'].every(k=>typeof envelope[k]==='string'&&/^[A-Za-z0-9+/]+={0,2}$/.test(envelope[k]))&&/^[a-f0-9]{64}$/.test(envelope.hostPublicKeyHash));return runtime('credentials',envelope)}
export function buildCredentialQueryCommand({requestId}={}){check(requestId===undefined||/^[a-f0-9]{32}$/.test(requestId));return runtime('query',requestId?{requestId}:undefined)}
export function buildInstallQueryCommand({opsSha}){
 check(/^[a-f0-9]{40}$/.test(opsSha))
 const script=readFileSync(new URL('./install.py',import.meta.url),'utf8').split("if __name__=='__main__':")[0]
 return `python3 -c ${quote(script+`\nprint(json.dumps(query_install('${opsSha}')))` )}`
}
export function buildPolicyCommand(policy){
 check(policy?.version===1&&policy.listen?.host==='127.0.0.1'&&policy.listen?.port===17951&&policy.stateDirectory==='/var/lib/lingxi-release'&&JSON.stringify(policy).length<200000)
 const source=`import {validatePolicy} from '/opt/lingxi-release/current/scripts/release-host/adapter.mjs';import {readFileSync,writeFileSync,existsSync,mkdirSync,lstatSync} from 'node:fs';import{createHash}from'node:crypto';const text=Buffer.from('${Buffer.from(JSON.stringify(policy)).toString('base64')}','base64').toString();validatePolicy(JSON.parse(text));mkdirSync('/etc/lingxi-release',{recursive:true,mode:0o700});const p='/etc/lingxi-release/policy.json';if(existsSync(p)){if(!lstatSync(p).isFile()||lstatSync(p).isSymbolicLink()||readFileSync(p,'utf8')!==text)throw Error('POLICY_CONFLICT')}else writeFileSync(p,text,{flag:'wx',mode:0o600});console.log(JSON.stringify({policySha256:createHash('sha256').update(text).digest('hex'),serviceStarted:false}));`
 return `${NODE} --experimental-sqlite --input-type=module -e ${quote(source)}`
}
