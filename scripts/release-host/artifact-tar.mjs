import {createHash} from 'node:crypto'
import {createReadStream} from 'node:fs'
import {stat} from 'node:fs/promises'
import {Readable,Transform} from 'node:stream'
import {pipeline} from 'node:stream/promises'
import {createGunzip} from 'node:zlib'
import {isDeepStrictEqual as equal} from 'node:util'
import {fault} from './journal.mjs'
import {verifyOciProof} from './image-identity.mjs'

export const MAX_PART=8*1024*1024,MAX_ARCHIVE=8*1024**3,MAX_TAR=16*1024**3
const digest=value=>/^sha256:[a-f0-9]{64}$/.test(value??'')
const check=(value,code='ARCHIVE_INVALID')=>{if(!value)throw fault(code,'Image archive does not satisfy the fixed offline artifact contract',422)}
const hasher=()=>createHash('sha256'),finish=value=>`sha256:${value.digest('hex')}`
export function validateArchive(image){
  const a=image?.archive
  check(a&&image.kind!=='local-qualified'&&a.version===1&&a.format==='docker-save+gzip'&&digest(a.sha256)&&Number.isSafeInteger(a.size)&&a.size>0&&a.size<=MAX_ARCHIVE&&Number.isSafeInteger(a.uncompressedSize)&&a.uncompressedSize>=1024&&a.uncompressedSize<=MAX_TAR&&a.tag===`localhost/lingxi-release-cache:sha256-${image.configDigest?.slice(7)}`&&Array.isArray(a.parts)&&a.parts.length>0&&a.parts.length<=2048,'INVALID_IMAGE_ARCHIVE')
  check(a.parts.every(p=>p&&digest(p.sha256)&&Number.isSafeInteger(p.size)&&p.size>0&&p.size<=MAX_PART)&&a.parts.reduce((n,p)=>n+p.size,0)===a.size,'INVALID_IMAGE_ARCHIVE')
  verifyOciProof(image)
  return a
}
class Reader{
  constructor(stream){this.iterator=stream[Symbol.asyncIterator]();this.buffer=Buffer.alloc(0);this.ended=false}
  async read(n){const chunks=[];let total=0;while(total<n){if(!this.buffer.length){const next=await this.iterator.next();if(next.done){this.ended=true;break}this.buffer=Buffer.from(next.value)}const count=Math.min(n-total,this.buffer.length);chunks.push(this.buffer.subarray(0,count));this.buffer=this.buffer.subarray(count);total+=count}return Buffer.concat(chunks,total)}
  async *take(n){while(n){const chunk=await this.read(Math.min(65536,n));check(chunk.length>0);n-=chunk.length;yield chunk}}
}
const text=(b,start,length)=>{const raw=b.subarray(start,start+length),end=raw.indexOf(0);return raw.subarray(0,end<0?raw.length:end).toString('utf8')}
const octal=(b,start,length)=>{const v=text(b,start,length).trim();check(/^[0-7]*$/.test(v));const n=parseInt(v||'0',8);check(Number.isSafeInteger(n)&&n>=0);return n}
function safeName(value,directory){
  const name=directory?value.replace(/\/$/,''):value
  check(name.length>0&&name.length<=255&&!name.startsWith('/')&&!name.includes('\\')&&!name.includes('\0')&&name.split('/').every(p=>p&&p!=='.'&&p!=='..'))
  check(/^(?:manifest\.json|repositories|index\.json|oci-layout|blobs(?:\/sha256(?:\/[a-f0-9]{64})?)?|[a-f0-9]{64}(?:\.json|\/(?:json|VERSION|layer\.tar))?)$/.test(name))
  return name
}
async function parseTar(stream,image){
  const reader=new Reader(stream),entries=new Map();let count=0,totalExpanded=0,totalCaptured=0,ended=false
  for(;;){
    const header=await reader.read(512);check(header.length===512)
    if(header.every(byte=>byte===0)){const second=await reader.read(512);check(second.length===512&&second.every(byte=>byte===0));for(;;){const trailing=await reader.read(65536);if(!trailing.length)break;check(trailing.every(byte=>byte===0))}ended=true;break}
    let sum=0;for(let i=0;i<512;i++)sum+=i>=148&&i<156?32:header[i];check(sum===octal(header,148,8))
    const type=String.fromCharCode(header[156]),directory=type==='5';check(directory||type==='0'||type==='\0')
    check(!text(header,157,100),'ARCHIVE_LINK_FORBIDDEN')
    const prefix=text(header,345,155),name=safeName((prefix?`${prefix}/`:'')+text(header,0,100),directory),size=octal(header,124,12)
    check(!entries.has(name)&&++count<=4096&&size<=MAX_TAR);if(directory)check(size===0)
    const raw=hasher(),expanded=hasher(),captured=[];let capturedSize=0,expandedSize=0
    const first=await reader.read(Math.min(size,2));check(first.length===Math.min(size,2))
    const source=Readable.from((async function*(){if(first.length)yield first;yield*reader.take(size-first.length)})())
    const tap=new Transform({transform(chunk,encoding,done){raw.update(chunk);if(size<=2*1024*1024){totalCaptured+=chunk.length;if(totalCaptured>64*1024*1024)return done(fault('ARCHIVE_METADATA_LIMIT','Bounded archive metadata capture exceeded its fixed limit',422));capturedSize+=chunk.length;captured.push(chunk)}done(null,chunk)}})
    const consume=async input=>{for await(const chunk of input){expandedSize+=chunk.length;totalExpanded+=chunk.length;check(totalExpanded<=MAX_TAR,'ARCHIVE_LAYER_EXPANSION_LIMIT');expanded.update(chunk)}}
    try{if(first[0]===0x1f&&first[1]===0x8b)await pipeline(source,tap,createGunzip(),consume);else await pipeline(source,tap,consume)}catch(error){if(error.code?.startsWith('ARCHIVE_'))throw error;throw fault('ARCHIVE_INVALID','Compressed archive member is invalid',422)}
    const padding=await reader.read((512-size%512)%512);check(padding.length===(512-size%512)%512&&padding.every(byte=>byte===0))
    entries.set(name,{rawHash:finish(raw),diffHash:finish(expanded),size,expandedSize,...(capturedSize?{bytes:Buffer.concat(captured,capturedSize)}:{})})
  }
  check(ended)
  const decode=name=>{const item=entries.get(name);check(item?.bytes&&item.bytes.length<=2*1024*1024);try{return JSON.parse(item.bytes)}catch{throw fault('ARCHIVE_INVALID','Image archive metadata is invalid',422)}}
  const manifest=decode('manifest.json');check(Array.isArray(manifest)&&manifest.length===1)
  const record=manifest[0];check(record&&Object.keys(record).every(key=>['RepoTags','Config','Layers','LayerSources'].includes(key))&&Array.isArray(record.RepoTags)&&equal(record.RepoTags,[image.archive.tag])&&typeof record.Config==='string'&&Array.isArray(record.Layers)&&record.Layers.length===image.diffIds.length)
  safeName(record.Config,false);check(entries.get(record.Config)?.rawHash===image.configDigest,'ARCHIVE_CONFIG_MISMATCH')
  const config=decode(record.Config),graph=verifyOciProof(image);check(equal(config,graph.config),'ARCHIVE_CONFIG_MISMATCH')
  check(record.Layers.every((name,index)=>{safeName(name,false);return entries.get(name)?.diffHash===image.diffIds[index]}),'ARCHIVE_LAYERS_MISMATCH')
  if(record.LayerSources)for(const[id,source]of Object.entries(record.LayerSources)){const at=image.diffIds.indexOf(id);check(at>=0&&source&&Object.keys(source).every(key=>['mediaType','size','digest'].includes(key))&&source.digest===entries.get(record.Layers[at]).rawHash&&source.size===entries.get(record.Layers[at]).size,'ARCHIVE_LAYER_SOURCE_INVALID')}
  // Every other file must be inert metadata or a graph-addressed blob. No second image/rootfs can hide in the tar.
  const used=new Set(['manifest.json','repositories','index.json','oci-layout',record.Config,...record.Layers])
  const graphBlobs=new Set([image.indexDigest,image.platformDigest,image.configDigest,...graph.manifest.layers.map(row=>row.digest)].map(id=>`blobs/sha256/${id.slice(7)}`))
  if(entries.has('repositories')){const repository=decode('repositories'),at=image.archive.tag.lastIndexOf(':'),name=image.archive.tag.slice(0,at),tag=image.archive.tag.slice(at+1);check(equal(Object.keys(repository),[name])&&equal(Object.keys(repository[name]),[tag])&&/^[a-f0-9]{64}$/.test(repository[name][tag]),'ARCHIVE_REPOSITORIES_INVALID')}
  if(entries.has('oci-layout'))check(decode('oci-layout').imageLayoutVersion==='1.0.0','ARCHIVE_OCI_LAYOUT_INVALID')
  if(entries.has('index.json')){
    const visit=(descriptor,depth=0)=>{
      check(depth<3&&descriptor&&digest(descriptor.digest)&&Number.isSafeInteger(descriptor.size)&&!descriptor.urls&&['application/vnd.oci.image.index.v1+json','application/vnd.docker.distribution.manifest.list.v2+json','application/vnd.oci.image.manifest.v1+json','application/vnd.docker.distribution.manifest.v2+json'].includes(descriptor.mediaType)&&(!descriptor.platform||descriptor.platform.os===image.os&&descriptor.platform.architecture===image.architecture),'ARCHIVE_OCI_ROOT_INVALID')
      const name=`blobs/sha256/${descriptor.digest.slice(7)}`,item=entries.get(name);check(item?.rawHash===descriptor.digest&&item.size===descriptor.size,'ARCHIVE_OCI_ROOT_INVALID');used.add(name)
      const annotations=descriptor.annotations??{},tag=image.archive.tag.slice(image.archive.tag.lastIndexOf(':')+1)
      check((!annotations['io.containerd.image.name']||annotations['io.containerd.image.name']===image.archive.tag)&&(!annotations['org.opencontainers.image.ref.name']||annotations['org.opencontainers.image.ref.name']===tag||annotations['org.opencontainers.image.ref.name']===image.archive.tag),'ARCHIVE_OCI_TAG_INVALID')
      const value=decode(name);check(value.schemaVersion===2&&value.mediaType===descriptor.mediaType,'ARCHIVE_OCI_ROOT_INVALID')
      if(Array.isArray(value.manifests)){check(value.manifests.length===1,'ARCHIVE_MULTIPLE_IMAGES');visit(value.manifests[0],depth+1)}
      else{check(value.config?.digest===image.configDigest&&value.config.size===entries.get(record.Config).size&&!value.config.urls&&Array.isArray(value.layers)&&value.layers.length===record.Layers.length&&value.layers.every((layer,index)=>layer.digest===entries.get(record.Layers[index]).rawHash&&layer.size===entries.get(record.Layers[index]).size&&!layer.urls),'ARCHIVE_OCI_ROOT_INVALID')}
    }
    const index=decode('index.json');check(index.schemaVersion===2&&Array.isArray(index.manifests)&&index.manifests.length===1,'ARCHIVE_MULTIPLE_IMAGES');visit(index.manifests[0])
  }
  for(const[name,item]of entries){
    if(/^blobs\/sha256\/[a-f0-9]{64}$/.test(name))check(item.rawHash===`sha256:${name.split('/').at(-1)}`,'ARCHIVE_BLOB_DIGEST_MISMATCH')
    if(!item.size||used.has(name)||graphBlobs.has(name)&&item.rawHash===`sha256:${name.split('/').at(-1)}`||/^[a-f0-9]{64}\/(?:json|VERSION)$/.test(name))continue
    // Docker classic storage additionally exports content-addressed v1 compatibility metadata.
    const value=item.bytes?(()=>{try{return JSON.parse(item.bytes)}catch{return null}})():null
    check(/^blobs\/sha256\/[a-f0-9]{64}$/.test(name)&&item.rawHash===`sha256:${name.split('/').at(-1)}`&&value&&/^[a-f0-9]{64}$/.test(value.id??'')&&Object.keys(value).every(key=>['id','parent','comment','created','container','container_config','docker_version','config','architecture','os','author'].includes(key))&&value.os===image.os&&value.architecture===image.architecture,'ARCHIVE_UNEXPECTED_MEMBER')
  }
  return{configDigest:image.configDigest,diffIds:image.diffIds,tag:image.archive.tag,files:count}
}
export async function verifyArchiveTar(path,image,{gzip=true,expectedSize=gzip?image.archive.size:undefined}={}){
  validateArchive(image)
  const info=await stat(path);check(info.isFile()&&(!expectedSize||info.size===expectedSize)&&info.size<=(gzip?MAX_ARCHIVE:MAX_TAR),'ARCHIVE_SIZE_MISMATCH')
  const whole=hasher();let rawSize=0,tarSize=0,result
  const raw=new Transform({transform(chunk,encoding,done){rawSize+=chunk.length;whole.update(chunk);done(null,chunk)}})
  const bounded=new Transform({transform(chunk,encoding,done){tarSize+=chunk.length;if(tarSize>MAX_TAR)return done(fault('ARCHIVE_EXPANSION_LIMIT','Image archive exceeds the fixed tar limit',422));done(null,chunk)}})
  try{await pipeline(createReadStream(path),raw,...(gzip?[createGunzip()]:[]),bounded,async input=>{result=await parseTar(input,image)})}catch(error){if(error.code?.startsWith('ARCHIVE_')||error.code==='IMAGE_IDENTITY_MISMATCH')throw error;throw fault('ARCHIVE_INVALID','Image archive decompression failed',422)}
  if(gzip)check(rawSize===image.archive.size&&finish(whole)===image.archive.sha256&&tarSize===image.archive.uncompressedSize,'ARCHIVE_HASH_MISMATCH')
  return{...result,archiveSha256:image.archive.sha256,tarSize}
}
