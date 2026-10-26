import {join} from 'node:path'
import {ArtifactCache} from '../artifact-cache.mjs'
import {artifactFixture} from './artifact.mjs'
import {fault,hash} from '../journal.mjs'

// Isolated child fixture: persist one real part, then exit before any load.
const directory=process.argv[2],f=artifactFixture(),request={releaseId:'artifact-fetch',target:'main-runtime-a',manifestHash:hash('registered'),configDigest:f.image.configDigest}
const manifest={targets:{'main-runtime-a':{hostPlan:{images:{web:f.image}}}}},policy={stateDirectory:directory,artifactTransport:'r2',archive:{baseUrl:'https://release.test',tokenFile:join(directory,'existing-executor-token')},targets:{'main-runtime-a':{}}}
const cache=new ArtifactCache(policy,{journal:{manifest:()=>manifest},run:async()=>{throw fault('IMAGE_NOT_FOUND','missing')},fetcher:async url=>{
  const index=f.image.archive.parts.findIndex(p=>String(url).endsWith(p.sha256.slice(7)))
  if(index!==0)process.exit(23)
  return new Response(f.parts[0],{headers:{'content-type':'application/octet-stream','content-length':String(f.parts[0].length),'x-lingxi-artifact-sha256':f.image.archive.parts[0].sha256}})
}})
await cache.prepare(request)
