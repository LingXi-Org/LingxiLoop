import {runArtifactRealm} from './artifact-realm'
import {cachedSvgImage,rememberSvgImage} from './svg-image-cache'

let enabled=false,active=false
interface Pending {key:string;source:string;fontFamily?:string;signal:AbortSignal;resolve(value:string):void;reject(error:unknown):void;cancel():void}
const queued:Pending[]=[]
export const svgImageRecoveryEnabled=()=>enabled
export const enableSvgImageRecovery=()=>{enabled=true}

/** A poisoned parent ESM graph lasts for this document's lifetime. Keep the
 * user's recovery choice beyond component/cache eviction; run one realm at a time. */
export function recoverSvgImage(source:string,fontFamily:string|undefined,signal:AbortSignal):Promise<string> {
  signal.throwIfAborted()
  return new Promise((resolve,reject)=>{
    const job:Pending={key:`${fontFamily??''}\0${source}`,source,fontFamily,signal,resolve,reject,cancel:()=>{
      const index=queued.indexOf(job)
      if(index!==-1){queued.splice(index,1);reject(signal.reason??new DOMException('已取消图形加载','AbortError'))}
    }}
    signal.addEventListener('abort',job.cancel,{once:true});queued.push(job);drain()
  })
}
function drain():void {
  if(active)return
  const job=queued.shift();if(!job)return
  if(job.signal.aborted){job.signal.removeEventListener('abort',job.cancel);job.reject(job.signal.reason);drain();return}
  active=true
  const cached=cachedSvgImage(job.key)
  const pending=cached?Promise.resolve(cached):runArtifactRealm({type:'svg-font-image',source:job.source,fontFamily:job.fontFamily},{signal:job.signal})
  void pending.then(url=>{job.signal.throwIfAborted();rememberSvgImage(job.key,url);job.resolve(url)},job.reject).catch(job.reject).finally(()=>{job.signal.removeEventListener('abort',job.cancel);active=false;drain()})
}
