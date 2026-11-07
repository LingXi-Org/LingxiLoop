import assert from 'node:assert/strict'
import {relative} from 'node:path'
import {gzipSync} from 'node:zlib'

/** Build metadata only. Actual browser transfer, Workers and timing stay separate. */
export function profileOpeningChunks(bundle,applicationRoots,nativeRoots,repositoryRoot){
 const closure=roots=>{
  const reached=new Set()
  const visit=name=>{if(reached.has(name))return;const chunk=bundle[name];assert.equal(chunk?.type,'chunk',`Missing script chunk: ${name}`);reached.add(name);chunk.imports.forEach(visit)}
  roots.forEach(visit);return reached
 }
 const application=closure(applicationRoots),native=closure(nativeRoots)
 const summarize=names=>{
  const chunks=[...names].sort(),modules=new Map();let codeBytes=0,gzipBytes=0
  for(const name of chunks){
   const chunk=bundle[name];codeBytes+=Buffer.byteLength(chunk.code);gzipBytes+=gzipSync(chunk.code).length
   for(const [id,metadata]of Object.entries(chunk.modules)){
    if(!metadata.renderedLength)continue
    const file=id.replaceAll('\\','/').replace(/^\0/,'').split('?')[0],path=relative(repositoryRoot,file).replaceAll('\\','/'),dependency=file.match(/(?:^|\/)node_modules\/((?:@[^/]+\/)?[^/]+)(?:\/|$)/)?.[1]
    const label=/^(src|shared|third_party)\//.test(path)?path:dependency?`dependency:${dependency}`:'build-runtime'
    const entry=modules.get(label)??{label,moduleCount:0,renderedCodeUnits:0,originalCodeUnits:0}
    entry.moduleCount++;entry.renderedCodeUnits+=metadata.renderedLength;entry.originalCodeUnits+=metadata.originalLength??0;modules.set(label,entry)
   }
  }
  return{chunks,codeBytes,gzipBytes,moduleCount:[...modules.values()].reduce((sum,item)=>sum+item.moduleCount,0),modules:[...modules.values()].sort((a,b)=>b.renderedCodeUnits-a.renderedCodeUnits||a.label.localeCompare(b.label)).slice(0,100)}
 }
 return{kind:'static-opening-chunk-profile',qualified:false,scope:'Static production chunks only; gzip is a local estimate, module lengths are UTF-16 code units. Warm app chunks are subtracted. Browser network, Workers, PSS and timing need the unchanged authenticated benchmark.',application:summarize(application),nativeIncremental:summarize([...native].filter(name=>!application.has(name)))}
}
