import {readFileSync} from 'node:fs'
import {nativeSource} from './native-operator.mjs'
const quote=s=>`'${s.replaceAll("'","'\\''")}'`
export function dockerCommand(side,action,expectedHash){
 if(!['a','b'].includes(side)||!['query','apply','restore','query-corrected','apply-corrected','restore-corrected'].includes(action)||(action.startsWith('query')?expectedHash!==undefined:!(/^[a-f0-9]{64}$/).test(expectedHash??'')))throw Error('INVALID_DOCKER_MAINTENANCE_INPUT')
 return `python3 -c ${quote(nativeSource()+readFileSync(new URL('./docker-proxy.py',import.meta.url),'utf8'))} ${quote(JSON.stringify({host:side,action,expectedHash}))}`
}
export async function dockerOperation(side,action,{expectedHash,env=process.env,fetcher=fetch}={}){
 const command=dockerCommand(side,action,expectedHash)
 if(!env.KOMODO_API_KEY||!env.KOMODO_API_SECRET)throw Error('EXISTING_OPERATOR_CREDENTIAL_REQUIRED')
 const response=await fetcher('https://ops.christmas1314.xyz/terminal/execute',{method:'POST',redirect:'error',signal:AbortSignal.timeout(150000),headers:{'content-type':'application/json','x-api-key':env.KOMODO_API_KEY,'x-api-secret':env.KOMODO_API_SECRET},body:JSON.stringify({target:{type:'Server',params:{server:side==='a'?'shanghai-a':'shanghai-b'}},terminal:`issue-514-docker-${side}-${action}`,command,init:{command:'bash',recreate:'Never'}})})
 if(!response.ok)throw Error('DOCKER_MAINTENANCE_HTTP_'+response.status)
 const rows=(await response.text()).split(/\r?\n/).map(line=>line.replace(/\x1b\[[0-9;]*[A-Za-z]/g,'').trim()).filter(line=>line.startsWith('{')&&line.endsWith('}')).flatMap(line=>{try{return[JSON.parse(line)]}catch{return[]}})
 if(rows.length!==1)throw Error('DOCKER_RECEIPT_UNCONFIRMED_QUERY_BEFORE_RETRY')
 return {side,action,receipt:rows[0]}
}
