import { requireThat, ReleaseError } from '../../../shared/release/protocol'
import type { ReleaseEnv } from './types'

export const RETAINED_ASSETS_PATH = '/v1/retained-assets'
const MAX_FILES = 8, MAX_BYTES = 256 * 1024
type Item = { key:string; sha256:string; size:number; contentType:string }
const hex = (bytes:ArrayBuffer) => Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('')
async function boundedBody(request:Request,max:number) {
  const chunks:Uint8Array[]=[];let length=0
  const reader=request.body?.getReader();if(!reader)return new Uint8Array()
  try { for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;requireThat(length<=max,'RETAINED_BATCH_TOO_LARGE',413);chunks.push(value)} }
  catch(error){await reader.cancel().catch(()=>{});throw error}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}return bytes
}
function inventory(value:unknown):Item[] {
  requireThat(Array.isArray(value)&&value.length>0&&value.length<=MAX_FILES,'RETAINED_BATCH_REQUIRED',400)
  const items=value as Item[]
  requireThat(items.every(item=>item&&Object.keys(item).sort().join(',')==='contentType,key,sha256,size'&&
    typeof item.key==='string'&&item.key.length<=512&&/^chunks\/assets\/[\w./-]+-[\w-]{8,}\.[\w.]+$/.test(item.key)&&!item.key.split('/').some(part=>part==='.'||part==='..')&&
    /^sha256:[a-f0-9]{64}$/.test(item.sha256)&&Number.isSafeInteger(item.size)&&item.size>0&&item.size<=MAX_BYTES&&
    ['text/javascript','text/css','image/svg+xml','application/json','font/woff2','application/octet-stream'].includes(item.contentType)), 'RETAINED_ITEM_INVALID',400)
  requireThat(new Set(items.map(item=>item.key)).size===items.length&&items.reduce((n,item)=>n+item.size,0)<=MAX_BYTES,'RETAINED_BATCH_TOO_LARGE',413)
  return items
}
async function existing(bucket:R2Bucket,item:Item):Promise<boolean> {
  const object=await bucket.head(item.key);if(!object)return false
  requireThat(object.size===item.size,'IMMUTABLE_ARTIFACT_CONFLICT',409)
  if(object.checksums.sha256){requireThat('sha256:'+hex(object.checksums.sha256)===item.sha256,'IMMUTABLE_ARTIFACT_CONFLICT',409);return true}
  // Legacy REST-uploaded business assets lack SHA-256 metadata. Read and hash
  // them once in this bounded batch; never substitute ETag/MD5 for SHA-256.
  const body=await bucket.get(item.key);requireThat(body&&body.size===item.size,'IMMUTABLE_ARTIFACT_CONFLICT',409)
  requireThat('sha256:'+hex(await crypto.subtle.digest('SHA-256',await body.arrayBuffer()))===item.sha256,'IMMUTABLE_ARTIFACT_CONFLICT',409)
  return true
}
/** Existing publisher/admin only. At most 8 files/256KiB and 32 R2 subrequests. */
export async function handleRetainedAssets(request:Request,env:Pick<ReleaseEnv,'ARTIFACTS'>) {
  const url=new URL(request.url);requireThat(url.pathname===RETAINED_ASSETS_PATH&&!url.search,'NOT_FOUND',404)
  requireThat(['POST','PUT'].includes(request.method),'METHOD_NOT_ALLOWED',405)
  const write=request.method==='PUT'
  requireThat(request.headers.get('content-type')?.split(';')[0]===(write?'application/octet-stream':'application/json'),'CONTENT_TYPE_REQUIRED',415)
  const raw=await boundedBody(request,write?MAX_BYTES:8192)
  const encoded=write?request.headers.get('x-lingxi-retained-inventory')??'':new TextDecoder().decode(raw)
  requireThat(encoded.length<=8192,'RETAINED_BATCH_TOO_LARGE',413)
  let value:unknown;try{value=JSON.parse(encoded)}catch{throw new ReleaseError('RETAINED_BATCH_REQUIRED',400)}
  const items=inventory(value)
  requireThat(!write||raw.length===items.reduce((n,item)=>n+item.size,0),'RETAINED_BODY_MISMATCH',400)
  let offset=0;const results=[]
  for(const item of items){
    const reused=await existing(env.ARTIFACTS,item)
    if(!reused&&write){
      try {
        const created=await env.ARTIFACTS.put(item.key,raw.slice(offset,offset+item.size),{sha256:item.sha256.slice(7),onlyIf:{etagDoesNotMatch:'*'},customMetadata:{sha256:item.sha256.slice(7)},httpMetadata:{contentType:item.contentType,cacheControl:'public, max-age=31536000, immutable'}})
        if(created)requireThat(created.size===item.size&&created.checksums.sha256&&'sha256:'+hex(created.checksums.sha256)===item.sha256,'RETAINED_WRITE_UNCONFIRMED',502)
        // onlyIf races remain independently observed; never overwrite bytes.
        if(!created)requireThat(await existing(env.ARTIFACTS,item),'RETAINED_WRITE_UNCONFIRMED',502)
      }catch(error){if(error instanceof ReleaseError)throw error;throw new ReleaseError(/checksum|digest|length|size/i.test(String(error))?'RETAINED_BODY_MISMATCH':'RETAINED_WRITE_UNCONFIRMED',502)}
    }
    results.push({key:item.key,sha256:item.sha256,size:item.size,present:reused||write,reused});offset+=item.size
  }
  return Response.json({version:1,results},{headers:{'cache-control':'no-store'}})
}
