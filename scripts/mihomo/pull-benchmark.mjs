import {readFileSync} from 'node:fs'
const quote=s=>`'${s.replaceAll("'","'\\''")}'`
export async function pullBenchmark(side,manifest,{env=process.env,fetcher=fetch,observe=false}={}){
 if(!['a','b'].includes(side))throw Error('INVALID_BENCHMARK_HOST')
 const image=manifest?.targets?.['main-runtime-'+side]?.hostPlan?.images?.lingxiloop
 if(!image?.ociProof||!image.configDigest||!image.platformDigest)throw Object.assign(Error('QUALIFIED_IMAGE_PROOF_REQUIRED'),{code:'QUALIFIED_IMAGE_PROOF_REQUIRED'})
 if(!env.KOMODO_API_KEY||!env.KOMODO_API_SECRET)throw Error('EXISTING_OPERATOR_CREDENTIAL_REQUIRED')
 const encoded=Buffer.from(JSON.stringify(image)).toString('base64').match(/.{1,96}/g).map(quote).join('\\\n')
 const command=`python3 -c ${quote(readFileSync(new URL('./pull-benchmark.py',import.meta.url),'utf8'))} ${encoded}${observe?' query':''}`
 const response=await fetcher('https://ops.christmas1314.xyz/terminal/execute',{method:'POST',redirect:'error',signal:AbortSignal.timeout(220000),headers:{'content-type':'application/json','x-api-key':env.KOMODO_API_KEY,'x-api-secret':env.KOMODO_API_SECRET},body:JSON.stringify({target:{type:'Server',params:{server:side==='a'?'shanghai-a':'shanghai-b'}},terminal:`issue-514-pull-${side}`,command,init:{command:'bash',recreate:'Never'}})})
 if(!response.ok)throw Object.assign(Error('PULL_HTTP_'+response.status),{code:'PULL_HTTP_'+response.status})
 const rows=(await response.text()).split(/\r?\n/).map(line=>line.replace(/\x1b\[[0-9;]*[A-Za-z]/g,'').trim()).filter(line=>line.startsWith('{')&&line.endsWith('}')).flatMap(line=>{try{return[JSON.parse(line)]}catch{return[]}})
 if(rows.length!==1)throw Error('PULL_OUTCOME_UNCERTAIN_QUERY_BEFORE_RETRY')
 return {side,...rows[0]}
}
