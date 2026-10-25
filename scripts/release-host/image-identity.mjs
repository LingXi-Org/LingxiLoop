import {createHash} from 'node:crypto'
import {isDeepStrictEqual as equal} from 'node:util'
import {fault} from './journal.mjs'
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
export async function inspectQualifiedImage(run,image,profile){
  validateImage(image,profile)
  for(const reference of imageReferences(image)){
    let rows
    try{rows=JSON.parse(await run(['image','inspect',reference]))}catch(error){if(error.code==='IMAGE_NOT_FOUND'||error.cause?.code===1&&/No such image/.test(error.cause.stderr??''))continue;throw error}
    check(rows?.length===1,'Image inspection did not resolve exactly one local artifact')
    return assertImageIdentity(rows[0],image,profile)
  }
  return null
}
