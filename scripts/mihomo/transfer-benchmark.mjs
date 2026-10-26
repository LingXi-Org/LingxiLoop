import {readFileSync} from 'node:fs'
const quote=s=>`'${s.replaceAll("'","'\\''")}'`
export async function transferBenchmark(side,route,manifest,{env=process.env,fetcher=fetch,concurrency=1}={}) {
 if(!['a','b'].includes(side)||!['registry','r2'].includes(route))throw Error('INVALID_BENCHMARK_INPUT')
 const image=manifest.targets?.['main-runtime-'+side]?.hostPlan?.images?.lingxiloop
 if(!image?.ociProof||!image.archive?.parts?.length)throw Error('QUALIFIED_IMAGE_PROOF_REQUIRED')
 if(!env.KOMODO_API_KEY||!env.KOMODO_API_SECRET)throw Error('EXISTING_OPERATOR_CREDENTIAL_REQUIRED')
 if(![1,3].includes(concurrency))throw Error('CONCURRENCY_REFUSED')
 const encoded=Buffer.from(JSON.stringify({route,image,concurrency})).toString('base64').match(/.{1,96}/g).map(quote).join('\\\n')
 const command=`python3 -c ${quote(readFileSync(new URL('./transfer-benchmark.py',import.meta.url),'utf8'))} ${encoded}`
 const response=await fetcher('https://ops.christmas1314.xyz/terminal/execute',{method:'POST',redirect:'error',signal:AbortSignal.timeout(220000),headers:{'content-type':'application/json','x-api-key':env.KOMODO_API_KEY,'x-api-secret':env.KOMODO_API_SECRET},body:JSON.stringify({target:{type:'Server',params:{server:side==='a'?'shanghai-a':'shanghai-b'}},terminal:`issue-514-transfer-${side}-${route}`,command,init:{command:'bash',recreate:'Never'}})})
 if(!response.ok)throw Error('BENCHMARK_HTTP_'+response.status)
 const output=await response.text(),rows=output.split(/\r?\n/).map(line=>line.replace(/\x1b\[[0-9;]*[A-Za-z]/g,'').trim()).filter(line=>line.startsWith('{')&&line.endsWith('}')).flatMap(line=>{try{return[JSON.parse(line)]}catch{return[]}})
 if(rows.length!==1)throw Error('BENCHMARK_RECEIPT_UNCONFIRMED')
 return {side,...rows[0]}
}
