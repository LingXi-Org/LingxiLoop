import {createHash} from 'node:crypto'
import {isDeepStrictEqual as equal} from 'node:util'
import {readFile,lstat} from 'node:fs/promises'
import {join} from 'node:path'
import {fault,hash} from './journal.mjs'
const digest=value=>/^sha256:[a-f0-9]{64}$/.test(value??'')
const indexTypes=new Set(['application/vnd.oci.image.index.v1+json','application/vnd.docker.distribution.manifest.list.v2+json'])
const manifestTypes=new Set(['application/vnd.oci.image.manifest.v1+json','application/vnd.docker.distribution.manifest.v2+json'])
const check=(condition,message)=>{if(!condition)throw fault('IMAGE_IDENTITY_MISMATCH',message,422)}
const byteHash=bytes=>`sha256:${createHash('sha256').update(bytes).digest('hex')}`
function decodeProof(value,expected){check(typeof value==='string'&&value.length<2*1024*1024&&/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value),'Raw OCI proof must be bounded canonical base64');const bytes=Buffer.from(value,'base64');check(byteHash(bytes)===expected,'Raw OCI proof does not match its declared digest');try{return JSON.parse(bytes)}catch{throw fault('IMAGE_IDENTITY_MISMATCH','Raw OCI proof is not JSON',422)}}
export function verifyOciProof(image){
  check(image.ociProof,'Containerd image identity requires raw index/manifest/config graph proof')
  const index=decodeProof(image.ociProof.index,image.indexDigest),manifest=decodeProof(image.ociProof.manifest,image.platformDigest),config=decodeProof(image.ociProof.config,image.configDigest)
  check(index&&manifest&&config&&!Array.isArray(index)&&!Array.isArray(manifest)&&!Array.isArray(config)&&index.schemaVersion===2,'OCI proof graph envelopes are invalid')
  if(indexTypes.has(index.mediaType)){
    const platforms=(index.manifests??[]).filter(row=>row.platform?.os===image.os&&row.platform?.architecture===image.architecture&&(row.platform.variant??'')===(image.variant??''))
    check(platforms.length===1&&platforms[0].digest===image.platformDigest&&manifestTypes.has(platforms[0].mediaType),'OCI index does not uniquely bind the qualified platform manifest')
  }else check(manifestTypes.has(index.mediaType)&&image.indexDigest===image.platformDigest&&equal(index,manifest),'Single-platform image root does not equal its qualified manifest')
  check(manifestTypes.has(manifest.mediaType)&&manifest.schemaVersion===2&&manifest.config?.digest===image.configDigest,'OCI manifest does not bind the independent config digest')
  check(Array.isArray(manifest.layers)&&manifest.layers.length===image.diffIds.length&&manifest.layers.every(row=>digest(row.digest)),'OCI manifest layer inventory is invalid')
  check(config.os===image.os&&config.architecture===image.architecture&&config.rootfs?.type==='layers'&&equal(config.rootfs.diff_ids,image.diffIds),'OCI config does not bind the qualified platform/uncompressed layers')
  return{index,manifest,config}
}
export function imageProfileKey(image){return image.kind==='local-qualified'?image.localImageId:image.configDigest}
export function validateImage(image,profile){
  if(image?.kind==='local-qualified'){
    if(!profile||!digest(image.localImageId)||!['config','index','platform'].includes(image.localIdKind)||image.ref!==image.localImageId||image.indexDigest||image.platformDigest||image.configDigest||!equal(image.sourceEvidence,profile.sourceEvidence)||profile.localImageId!==image.localImageId||profile.localIdKind!==image.localIdKind||image.os!=='linux'||!['amd64','arm64'].includes(image.architecture)||!Array.isArray(image.diffIds)||!image.diffIds.length||!image.diffIds.every(digest))throw fault('LOCAL_IMAGE_UNQUALIFIED','Local images require an explicit inspected local ID/type and source qualification; unknown OCI digests must not be invented',422)
    return
  }
  if(!image||!/^(?:ghcr\.io|docker\.io)\/[a-z0-9][a-z0-9/._-]*@sha256:[a-f0-9]{64}$/.test(image.ref??'')||![image.indexDigest,image.platformDigest,image.configDigest].every(digest)||!image.ref.endsWith(`@${image.indexDigest}`)||image.os!=='linux'||!['amd64','arm64'].includes(image.architecture)||!Array.isArray(image.diffIds)||!image.diffIds.length||!image.diffIds.every(digest))throw fault('INVALID_IMAGE','Independent canonical index/platform/config/layer identities are required',422)
  if(image.ociProof)verifyOciProof(image)
}
function normalize(ref){return ref.replace(/^docker\.io\/(?:library\/)?/,'').replace(/^library\//,'')}
export function assertImageIdentity(actual,image,profile){
  validateImage(image,profile)
  check(actual&&digest(actual.Id)&&actual.Os===image.os&&actual.Architecture===image.architecture&&actual.RootFS?.Type==='layers'&&equal(actual.RootFS.Layers,image.diffIds),'Actual cached image platform or ordered uncompressed layers differ')
  const descriptor=actual.Descriptor
  if(image.kind==='local-qualified'){
    check(actual.Id===image.localImageId,'Qualified local image identity changed')
    if(image.localIdKind==='index')check(descriptor?.digest===actual.Id&&indexTypes.has(descriptor.mediaType),'Local index ID lacks matching index descriptor evidence')
    if(image.localIdKind==='platform')check(descriptor?.digest===actual.Id&&manifestTypes.has(descriptor.mediaType),'Local platform ID lacks matching manifest descriptor evidence')
    if(image.localIdKind==='config')check(!descriptor||descriptor.digest!==actual.Id||!indexTypes.has(descriptor.mediaType)&&!manifestTypes.has(descriptor.mediaType),'An index/platform descriptor cannot be relabelled as a config ID')
    return{localImageId:actual.Id,localIdKind:image.localIdKind,identity:'local-qualified'}
  }
  const graph=image.ociProof?verifyOciProof(image):null
  const repoEvidence=(actual.RepoDigests??[]).some(ref=>graph?typeof ref==='string'&&[image.indexDigest,image.platformDigest].some(id=>ref.endsWith(`@${id}`)):normalize(ref)===normalize(image.ref)||normalize(ref)===normalize(image.ref.replace(image.indexDigest,image.platformDigest)))
  check(repoEvidence,'Cached repository digest does not bind the qualified artifact graph')
  let localIdKind
  if(actual.Id===image.configDigest){
    localIdKind='config'
    if(descriptor)check(descriptor.digest===image.indexDigest&&indexTypes.has(descriptor.mediaType)||descriptor.digest===image.platformDigest&&manifestTypes.has(descriptor.mediaType),'Classic config ID has a contradictory OCI descriptor')
  }else if(actual.Id===image.indexDigest&&descriptor?.digest===actual.Id&&indexTypes.has(descriptor.mediaType)){
    check(graph,'Containerd index ID requires the full raw OCI graph');localIdKind='index'
  }else if(actual.Id===image.platformDigest&&descriptor?.digest===actual.Id&&manifestTypes.has(descriptor.mediaType)){
    check(graph,'Containerd platform ID requires the full raw OCI graph');localIdKind='platform'
  }else check(false,'Local ID does not have a proven config/index/platform descriptor relationship')
  if(graph&&descriptor){const root=descriptor.digest===image.indexDigest?graph.index:graph.manifest;const bytes=Buffer.from(descriptor.digest===image.indexDigest?image.ociProof.index:image.ociProof.manifest,'base64');check(descriptor.mediaType===root.mediaType&&(!descriptor.size||descriptor.size===bytes.length),'OCI descriptor media type/size disagrees with the graph-bound bytes')}
  const equivalentConfig=(key,a,b)=>{if(['Env','Cmd','Entrypoint','Shell'].includes(key)&&(!a||Array.isArray(a)&&!a.length)&&(!b||Array.isArray(b)&&!b.length))return true;if(['Labels','Volumes','ExposedPorts','Healthcheck'].includes(key)&&(!a||!Object.keys(a).length)&&(!b||!Object.keys(b).length))return true;if(['User','WorkingDir','StopSignal'].includes(key)&&!a&&!b)return true;return equal(a,b)}
  if(graph&&actual.Config)for(const key of ['Env','Cmd','Entrypoint','WorkingDir','User','Healthcheck','Volumes','ExposedPorts','Labels','Shell','StopSignal'])if(Object.hasOwn(graph.config.config??{},key))check(equivalentConfig(key,actual.Config[key],graph.config.config[key]),'Inspected image configuration differs from the graph-bound config blob')
  return{localImageId:actual.Id,localIdKind,indexDigest:image.indexDigest,platformDigest:image.platformDigest,configDigest:image.configDigest}
}
export function imageReferences(image){return[...new Set([image.ref,image.localImageId,image.indexDigest,image.platformDigest,image.configDigest].filter(Boolean))]}
export const archiveIdentityHash=image=>hash(Object.fromEntries(['ref','indexDigest','platformDigest','configDigest','ociProof','os','architecture','variant','diffIds'].filter(key=>image[key]!==undefined).map(key=>[key,image[key]])))
export const archiveReceiptPath=(stateDirectory,image)=>join(stateDirectory,'artifacts','identities',`${image.configDigest.slice(7)}.json`)
export function assertArchiveImageIdentity(actual,image,receipt){
  validateImage(image);const graph=verifyOciProof(image)
  check(receipt?.version===1&&receipt.state==='verified'&&receipt.artifactHash===archiveIdentityHash(image)&&receipt.configDigest===image.configDigest&&digest(receipt.archiveSha256)&&receipt.tag===`localhost/lingxi-release-cache:sha256-${image.configDigest.slice(7)}`&&receipt.roundTrip?.configDigest===image.configDigest&&equal(receipt.roundTrip.diffIds,image.diffIds),'Archive identity requires its exact root-owned completed load/roundtrip receipt')
  check(actual&&actual.Id===receipt.localImageId&&actual.Os===image.os&&actual.Architecture===image.architecture&&actual.RootFS?.Type==='layers'&&equal(actual.RootFS.Layers,image.diffIds)&&equal(actual.Descriptor??null,receipt.descriptor)&&actual.RepoTags?.includes(receipt.tag),'Archive-loaded image platform, tag, descriptor or ordered rootfs changed')
  const kind=actual.Descriptor?.digest===actual.Id&&indexTypes.has(actual.Descriptor.mediaType)?'index':actual.Descriptor?.digest===actual.Id&&manifestTypes.has(actual.Descriptor.mediaType)?'platform':actual.Id===image.configDigest?'config':null
  check(kind&&kind===receipt.localIdKind&&hash(actual.Config??{})===receipt.configurationHash,'Archive-loaded image local ID/configuration no longer matches daemon readback evidence')
  for(const key of ['Env','Cmd','Entrypoint','WorkingDir','User','Healthcheck','Volumes','ExposedPorts','Labels','Shell','StopSignal'])if(Object.hasOwn(graph.config.config??{},key)){
    const a=actual.Config?.[key],b=graph.config.config[key],empty=v=>v===undefined||v===null||v===''||Array.isArray(v)&&!v.length||typeof v==='object'&&v!==null&&!Object.keys(v).length
    check(equal(a,b)||empty(a)&&empty(b),'Archive-loaded image configuration disagrees with the OCI config')
  }
  return{localImageId:actual.Id,localIdKind:kind,identity:'archive-verified',indexDigest:image.indexDigest,platformDigest:image.platformDigest,configDigest:image.configDigest,archiveSha256:receipt.archiveSha256}
}
async function receiptFor(image,stateDirectory){
  if(!stateDirectory||image.kind==='local-qualified')return null
  const path=archiveReceiptPath(stateDirectory,image);let info
  try{info=await lstat(path)}catch(error){if(error.code==='ENOENT')return null;throw error}
  check(info.isFile()&&!info.isSymbolicLink()&&info.uid===process.getuid()&&(info.mode&0o077)===0&&info.size<65536,'Archive identity receipt must be private and owned by the executor user')
  try{return JSON.parse(await readFile(path,'utf8'))}catch{throw fault('IMAGE_IDENTITY_MISMATCH','Archive identity receipt is invalid',422)}
}
export async function inspectQualifiedImage(run,image,profile,{stateDirectory}={}){
  validateImage(image,profile)
  const receipt=await receiptFor(image,stateDirectory)
  if(receipt){let rows;try{rows=JSON.parse(await run(['image','inspect',receipt.localImageId]))}catch(error){if(!(error.code==='IMAGE_NOT_FOUND'||error.cause?.code===1&&/No such image/.test(error.cause.stderr??'')))throw error}if(rows){check(rows.length===1,'Archive receipt must resolve exactly one image');return assertArchiveImageIdentity(rows[0],image,receipt)}}
  for(const reference of imageReferences(image)){
    let rows
    try{rows=JSON.parse(await run(['image','inspect',reference]))}catch(error){if(error.code==='IMAGE_NOT_FOUND'||error.cause?.code===1&&/No such image/.test(error.cause.stderr??''))continue;throw error}
    check(rows?.length===1,'Image inspection did not resolve exactly one local artifact')
    try{return assertImageIdentity(rows[0],image,profile)}catch(error){
      // A saved image can retain the config ID but lose registry RepoDigests. Its fixed cache tag
      // is only a hint to perform the independent archive readback; it grants no image identity.
      if(image.archive&&error.code==='IMAGE_IDENTITY_MISMATCH'&&rows[0].RepoTags?.includes(image.archive.tag))continue
      throw error
    }
  }
  return null
}
