import { subscriptionURL, importNodes } from './refresh.mjs'

// Read only: credentials and provider nodes remain in memory. No provider file,
// service, listener, daemon setting, registry pull or TLS exception is created.
export async function probeSubscription(env=process.env,{fetcher=fetch,now=Date.now}={}){
  const startedAt=now()
  if(!env.MIHOMO_SUBSCRIPTION_URL||!env.MIHOMO_SUBSCRIPTION_ORIGIN)return{status:'blocked',error:'EXISTING_SUBSCRIPTION_REQUIRED',providerSaved:false,registryVerified:false}
  let url
  try{url=subscriptionURL(env.MIHOMO_SUBSCRIPTION_URL,env.MIHOMO_SUBSCRIPTION_ORIGIN)}catch{return{status:'blocked',error:'SUBSCRIPTION_ORIGIN_INVALID',providerSaved:false,registryVerified:false}}
  try{
    const response=await fetcher(url,{redirect:'manual',signal:AbortSignal.timeout(20000)})
    if(!response.ok){await response.body?.cancel();return{status:'unavailable',httpStatus:response.status,elapsedMs:now()-startedAt,providerSaved:false,registryVerified:false}}
    let bytes=0;const parts=[]
    for await(const part of response.body){bytes+=part.length;if(bytes>2*1024*1024)throw Error('size');parts.push(part)}
    const nodes=importNodes(Buffer.concat(parts).toString('utf8'))
    return{status:'subscription-validated',nodeCount:nodes.proxies.length,bytes,elapsedMs:now()-startedAt,providerSaved:false,registryVerified:false}
  }catch{return{status:'unavailable',error:'SUBSCRIPTION_TRANSPORT_OR_SCHEMA_FAILED',elapsedMs:now()-startedAt,providerSaved:false,registryVerified:false}}
}
