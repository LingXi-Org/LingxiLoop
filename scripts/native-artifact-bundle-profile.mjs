import assert from 'node:assert/strict'
import {relative} from 'node:path'
import {gzipSync} from 'node:zlib'

export const openingModuleRoles={
 application:['/src/main.tsx','/src/App.tsx','/src/components/GlobalInteractionProvider.tsx','/src/AuthedApp.tsx','/src/desktop/DesktopApp.tsx','/src/desktop/ChatPane.tsx'],
 native:['/src/features/artifacts/native/NativeEditor.tsx','/src/features/artifacts/native/RichTextEditor.tsx'],
}

/** Build metadata only. Actual browser transfer, Workers and timing stay separate. */
export function profileOpeningChunks(bundle,applicationRoots,nativeRoots,repositoryRoot){
 const closure=roots=>{
  const reached=new Set()
  const visit=name=>{if(reached.has(name))return;const chunk=bundle[name];assert.equal(chunk?.type,'chunk',`Missing script chunk: ${name}`);reached.add(name);chunk.imports.forEach(visit)}
  roots.forEach(visit);return reached
 }
 const application=closure(applicationRoots),native=closure(nativeRoots)
 const summarize=names=>{
  const chunks=[...names].sort(),modules=new Map(),chunkDetails=[];let codeBytes=0,gzipBytes=0
  for(const name of chunks){
   const projectModules=new Set(),dependencyPackages=new Map(),chunk=bundle[name],chunkBytes=Buffer.byteLength(chunk.code),chunkGzipBytes=gzipSync(chunk.code).length;codeBytes+=chunkBytes;gzipBytes+=chunkGzipBytes
   for(const [id,metadata]of Object.entries(chunk.modules)){
    if(!metadata.renderedLength)continue
    const file=id.replaceAll('\\','/').replace(/^\0/,'').split('?')[0],path=relative(repositoryRoot,file).replaceAll('\\','/'),dependency=file.match(/(?:^|\/)node_modules\/((?:@[^/]+\/)?[^/]+)(?:\/|$)/)?.[1]
    const label=/^(src|shared|third_party)\//.test(path)?path:dependency?`dependency:${dependency}`:'build-runtime'
    const entry=modules.get(label)??{label,moduleCount:0,renderedCodeUnits:0,originalCodeUnits:0}
    entry.moduleCount++;entry.renderedCodeUnits+=metadata.renderedLength;entry.originalCodeUnits+=metadata.originalLength??0;modules.set(label,entry)
    if(/^(src|shared|third_party)\//.test(label))projectModules.add(label)
    if(dependency){const summary=dependencyPackages.get(label)??{label,moduleCount:0,renderedCodeUnits:0,originalCodeUnits:0};summary.moduleCount++;summary.renderedCodeUnits+=metadata.renderedLength;summary.originalCodeUnits+=metadata.originalLength??0;dependencyPackages.set(label,summary)}
   }
   const dynamicImports=chunk.dynamicImports??[]
   chunkDetails.push({fileName:name,imports:[...chunk.imports],dynamicImports:dynamicImports.filter(file=>bundle[file]?.type==='chunk'),externalDynamicImportCount:dynamicImports.filter(file=>bundle[file]?.type!=='chunk').length,isDynamicEntry:!!chunk.isDynamicEntry,codeBytes:chunkBytes,gzipBytes:chunkGzipBytes,projectModules:[...projectModules].sort(),dependencyPackages:[...dependencyPackages.values()].sort((a,b)=>b.renderedCodeUnits-a.renderedCodeUnits||a.label.localeCompare(b.label))})
  }
  return{chunks,chunkDetails,codeBytes,gzipBytes,moduleCount:[...modules.values()].reduce((sum,item)=>sum+item.moduleCount,0),modules:[...modules.values()].sort((a,b)=>b.renderedCodeUnits-a.renderedCodeUnits||a.label.localeCompare(b.label)).slice(0,100)}
 }
 return{kind:'static-opening-chunk-profile',qualified:false,roots:{application:[...new Set(applicationRoots)].sort(),native:[...new Set(nativeRoots)].sort()},scope:'Static production chunks only; gzip is a local estimate, module lengths are UTF-16 code units. Warm app chunks are subtracted. Browser network, Workers, PSS and timing need the unchanged authenticated benchmark.',application:summarize(application),nativeIncremental:summarize([...native].filter(name=>!application.has(name)))}
}
