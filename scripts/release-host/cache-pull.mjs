// Cache-only retries never replay a container, migration or ingress operation.
export function transientPull(error) {
  if(error?.code!=='DOCKER_COMMAND_FAILED')return false
  const detail=String(error.cause?.stderr??'')
  if(/unauthorized|forbidden|denied|authentication|certificate|x509|manifest unknown|not found|\b40[134]\b/i.test(detail))return false
  return error.cause?.killed===true||/unexpected eof|\beof\b|timed? ?out|timeout|connection reset|temporary failure|\b50[234]\b/i.test(detail)
}
export async function prepareCache({op,image,direction,context,run,inspect,now=Date.now,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}) {
  const started=Date.parse(op.createdAt??op.created_at??'')
  const deadline=(Number.isFinite(started)?started:now())+900000
  let last
  for(let attempt=0;attempt<2;attempt++) {
    if(attempt){await wait(2000);const observed=await inspect();if(observed)return observed}
    const remaining=deadline-now()
    if(remaining<=0)throw last??Object.assign(Error('Preparation budget exhausted'),{code:'PREPARATION_DEADLINE_EXCEEDED'})
    try {
      await context.step(`pull:${direction}:${image.configDigest??image.localImageId}${attempt?':retry:1':''}`,
        ()=>run(['image','pull','--quiet','--platform',`${image.os}/${image.architecture}`,image.ref],{timeout:Math.min(300000,remaining)}),{sideEffect:false})
    } catch(error) {
      last=error
      const observed=await inspect();if(observed)return observed
      if(!transientPull(error)||attempt===1||deadline-now()<=2000)throw error
      continue
    }
    const observed=await inspect()
    if(observed)return observed
    throw Object.assign(Error('Downloaded artifact is absent'),{code:'IMAGE_MISSING'})
  }
  throw last
}
