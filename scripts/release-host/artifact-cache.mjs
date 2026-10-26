import {createHash,randomUUID} from 'node:crypto'
import {createReadStream} from 'node:fs'
import {open,mkdir,lstat,readFile,rename,unlink,statfs} from 'node:fs/promises'
import {join,isAbsolute} from 'node:path'
import {isDeepStrictEqual as equal} from 'node:util'
import {canonical,fault,hash,identifier} from './journal.mjs'
import {validateArchive,verifyArchiveTar} from './artifact-tar.mjs'
import {archiveIdentityHash,archiveReceiptPath,assertArchiveImageIdentity,inspectQualifiedImage,verifyOciProof} from './image-identity.mjs'

const check=(value,code,message='Immutable artifact cache evidence is invalid')=>{if(!value)throw fault(code,message,409)}
const digest=value=>/^sha256:[a-f0-9]{64}$/.test(value??'')
const missing=error=>error.code==='ENOENT'
async function syncDirectory(path){const handle=await open(path,'r');try{await handle.sync()}finally{await handle.close()}}
async function privateDirectory(path){await mkdir(path,{recursive:true,mode:0o700});const info=await lstat(path);check(info.isDirectory()&&!info.isSymbolicLink()&&info.uid===process.getuid()&&(info.mode&0o077)===0,'ARTIFACT_DIRECTORY_UNSAFE')}
async function privateInfo(path){let info;try{info=await lstat(path)}catch(error){if(missing(error))return null;throw error}check(info.isFile()&&!info.isSymbolicLink()&&info.uid===process.getuid()&&(info.mode&0o077)===0,'ARTIFACT_FILE_UNSAFE');return info}
async function atomicJson(path,value){const temporary=`${path}.${randomUUID()}.tmp`,handle=await open(temporary,'wx',0o600);try{await handle.writeFile(canonical(value));await handle.sync()}finally{await handle.close()}await rename(temporary,path);await syncDirectory(join(path,'..'))}
async function jsonFile(path){const info=await privateInfo(path);if(!info)return null;check(info.size<65536,'ARTIFACT_RECEIPT_INVALID');try{return JSON.parse(await readFile(path,'utf8'))}catch{throw fault('ARTIFACT_RECEIPT_INVALID','Restricted artifact receipt is invalid',409)}}
async function fileHash(path){const hash=createHash('sha256');let size=0;for await(const chunk of createReadStream(path)){hash.update(chunk);size+=chunk.length}return{sha256:`sha256:${hash.digest('hex')}`,size}}
async function fileStamp(path){const info=await lstat(path,{bigint:true});return Object.fromEntries(['dev','ino','size','mtimeNs','ctimeNs'].map(key=>[key,info[key].toString()]))}
async function consumePart(stream,expected,write=async()=>{}){
  const iterator=stream[Symbol.asyncIterator](),deadline=Date.now()+60000,sha=createHash('sha256');let size=0
  for(;;){let timer;const next=await Promise.race([iterator.next(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(fault('ARTIFACT_UPLOAD_TIMEOUT','Artifact part did not finish within its bounded upload deadline',408)),Math.max(1,deadline-Date.now()))})]).finally(()=>clearTimeout(timer));if(next.done)break;const chunk=Buffer.from(next.value);size+=chunk.length;check(size<=expected.size,'ARTIFACT_PART_SIZE_MISMATCH');sha.update(chunk);await write(chunk)}
  check(size===expected.size&&`sha256:${sha.digest('hex')}`===expected.sha256,'ARTIFACT_PART_HASH_MISMATCH')
}
const imageMissing=error=>error.code==='IMAGE_NOT_FOUND'||error.cause?.code===1&&/No such image/.test(error.cause.stderr??'')

export class ArtifactCache{
  constructor(policy,{journal,run,afterLoad,fetcher=fetch,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){this.policy=policy;this.journal=journal;this.run=run;this.afterLoad=afterLoad;this.fetcher=fetcher;this.wait=wait;this.downloading=false;this.busy=new Set();this.loading=new Set()}
  resolve(request){
    check(request&&Object.keys(request).length===4&&Object.keys(request).every(k=>['releaseId','target','manifestHash','configDigest'].includes(k))&&identifier(request.releaseId)&&identifier(request.target)&&digest(request.manifestHash)&&digest(request.configDigest),'INVALID_ARTIFACT_REQUEST')
    check(this.policy.targets[request.target],'UNKNOWN_TARGET')
    const manifest=this.journal.manifest(request.releaseId,request.manifestHash),plan=manifest.targets?.[request.target]?.hostPlan
    const candidates=[plan,plan?.source,plan?.recovery].flatMap(d=>Object.values(d?.images??{})).filter(image=>image.configDigest===request.configDigest&&image.archive)
    check(candidates.length>0,'ARTIFACT_NOT_REGISTERED')
    const image=candidates[0];validateArchive(image)
    check(candidates.every(other=>equal(other.archive,image.archive)&&archiveIdentityHash(other)===archiveIdentityHash(image)),'ARTIFACT_IDENTITY_CONFLICT')
    return image
  }
  directory(image){return join(this.policy.stateDirectory,'artifacts',image.archive.sha256.slice(7))}
  partPath(image,index){return join(this.directory(image),`part-${index}`)}
  async partReceived(image,index){
    const path=this.partPath(image,index),info=await privateInfo(path);if(!info)return false
    const expected=image.archive.parts[index];check(info.size===expected.size,'ARTIFACT_PART_CORRUPT')
    const stamp=await fileStamp(path),receipt=await jsonFile(`${path}.json`)
    if(receipt?.version===1&&receipt.archiveSha256===image.archive.sha256&&receipt.index===index&&receipt.sha256===expected.sha256&&receipt.size===expected.size&&equal(receipt.stamp,stamp))return true
    const actual=await fileHash(path);check(actual.size===expected.size&&actual.sha256===expected.sha256&&equal(stamp,await fileStamp(path)),'ARTIFACT_PART_CORRUPT')
    await atomicJson(`${path}.json`,{version:1,archiveSha256:image.archive.sha256,index,...expected,stamp});return true
  }
  async lock(image,fn){const key=image.archive.sha256;check(!this.busy.has(key),'ARTIFACT_BUSY','Another fixed cache operation is active; query status before retrying');this.busy.add(key);try{return await fn()}finally{this.busy.delete(key)}}
  async received(image){const receivedParts=[],missingParts=[];for(let index=0;index<image.archive.parts.length;index++)(await this.partReceived(image,index)?receivedParts:missingParts).push(index);return{receivedParts,missingParts}}
  async status(request){
    const image=this.resolve(request);let identity=null,loadState='absent'
    const intent=await jsonFile(join(this.directory(image),'load.json'))
    if(intent){this.assertIntent(image,intent);loadState=intent.state}
    if(!this.loading.has(image.archive.sha256)){
      if(intent&&intent.state!=='verified'){
        try{identity=await this.lock(image,()=>this.observeLoaded(image));loadState='verified'}catch(error){if(!['ARTIFACT_LOAD_UNCERTAIN','ARTIFACT_BUSY'].includes(error.code))throw error;loadState='uncertain'}
      }else identity=await inspectQualifiedImage(this.run,image,undefined,{stateDirectory:this.policy.stateDirectory})
    }else loadState='loading'
    return{archiveSha256:image.archive.sha256,configDigest:image.configDigest,...(identity?{receivedParts:[],missingParts:[]}:await this.received(image)),imageReady:Boolean(identity),loadState,...(identity?{identity}:{})}
  }
  async put(request,index,stream){
    const image=this.resolve(request);check(Number.isSafeInteger(index)&&index>=0&&index<image.archive.parts.length,'INVALID_ARTIFACT_PART')
    return this.lock(image,async()=>{
      const directory=this.directory(image);await privateDirectory(join(this.policy.stateDirectory,'artifacts'));await privateDirectory(directory)
      const destination=this.partPath(image,index),expected=image.archive.parts[index],existing=await this.partReceived(image,index)
      if(existing){await consumePart(stream,expected);return{archiveSha256:image.archive.sha256,configDigest:image.configDigest,partIndex:index,received:true,reused:true}}
      const temporary=join(directory,`part-${index}.${randomUUID()}.tmp`),handle=await open(temporary,'wx',0o600);let committed=false
      try{
        await consumePart(stream,expected,chunk=>handle.writeFile(chunk));await handle.sync();await handle.close();await rename(temporary,destination);await syncDirectory(directory);committed=true
        await atomicJson(`${destination}.json`,{version:1,archiveSha256:image.archive.sha256,index,...expected,stamp:await fileStamp(destination)})
        return{archiveSha256:image.archive.sha256,configDigest:image.configDigest,partIndex:index,received:true,reused:false}
      }finally{if(!committed){await handle.close().catch(()=>{});await unlink(temporary).catch(()=>{})}}
    })
  }
  async downloadPolicy(){
    const archive=this.policy.archive;let base
    try{base=new URL(archive?.baseUrl)}catch{throw fault('ARTIFACT_DOWNLOAD_POLICY_INVALID','A trusted fixed HTTPS artifact root is required',422)}
    check(this.policy.artifactTransport==='r2'&&base.protocol==='https:'&&!base.username&&!base.password&&base.pathname==='/'&&!base.search&&!base.hash&&typeof archive.tokenFile==='string'&&isAbsolute(archive.tokenFile),'ARTIFACT_DOWNLOAD_POLICY_INVALID')
    const timeoutMs=archive.timeoutMs??60000
    check(Number.isInteger(timeoutMs)&&timeoutMs>=100&&timeoutMs<=300000,'ARTIFACT_DOWNLOAD_POLICY_INVALID')
    let token;try{token=(await readFile(archive.tokenFile,'utf8')).trim()}catch{throw fault('ARTIFACT_DOWNLOAD_CREDENTIAL_UNAVAILABLE','Existing local artifact credential is unavailable',503)}
    check(token.length>=32&&!/\s/.test(token),'ARTIFACT_DOWNLOAD_CREDENTIAL_INVALID')
    return{base,timeoutMs,headers:{authorization:`Bearer ${token}`}}
  }
  async downloadPart(request,image,index,transport){
    const expected=image.archive.parts[index],url=new URL(`/v1/artifact-blobs/${expected.sha256.slice(7)}`,transport.base)
    for(let attempt=0;attempt<3;attempt++){
      if(await this.partReceived(image,index))return
      const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),transport.timeoutMs);let response
      try{
        try{response=await this.fetcher(url,{method:'GET',headers:transport.headers,redirect:'manual',signal:abort.signal})}
        catch{throw Object.assign(fault('ARTIFACT_DOWNLOAD_UNAVAILABLE','Fixed artifact data GET did not complete',502),{retryable:true})}
        if([401,403].includes(response.status))throw fault('ARTIFACT_DOWNLOAD_AUTHENTICATION_FAILED','Fixed artifact data endpoint denied executor authentication',response.status)
        if(response.status>=500&&response.status<=599)throw Object.assign(fault('ARTIFACT_DOWNLOAD_UNAVAILABLE',`Fixed artifact data GET failed (HTTP ${response.status})`,502),{retryable:true})
        check(response.status===200,'ARTIFACT_DOWNLOAD_REJECTED','Fixed artifact data endpoint rejected the immutable GET')
        const length=response.headers.get('content-length')??'',encoding=response.headers.get('content-encoding')
        check(/^[1-9]\d*$/.test(length)&&Number(length)===expected.size&&response.headers.get('x-lingxi-artifact-sha256')===expected.sha256&&
          response.headers.get('content-type')?.split(';')[0].trim()==='application/octet-stream'&&(!encoding||encoding==='identity')&&response.body,'ARTIFACT_DOWNLOAD_METADATA_MISMATCH')
        try{await this.put(request,index,response.body)}catch(error){
          if(error.code==='ARTIFACT_UPLOAD_TIMEOUT'||error.name==='AbortError'||!error.code)throw Object.assign(fault('ARTIFACT_DOWNLOAD_UNAVAILABLE','Fixed artifact data stream did not complete',502),{retryable:true})
          throw error
        }
        return
      }catch(error){if(!error.retryable||attempt===2)throw error}
      finally{clearTimeout(timer);abort.abort();if(response?.body&&!response.body.locked)await response.body.cancel().catch(()=>{})}
      await this.wait(250*(attempt+1))
    }
  }
  async prepare(request){
    const image=this.resolve(request),state=await this.status(request)
    if(state.imageReady)return state.identity
    // A prior daemon intent is observed only. Fetching more bytes never grants
    // permission to replay an unknown load or replace its durable evidence.
    if(state.loadState!=='absent'||!state.missingParts.length)return this.ensure(image)
    check(!this.downloading,'ARTIFACT_DOWNLOAD_BUSY','Another fixed artifact download is active')
    this.downloading=true
    try{
      const transport=await this.downloadPolicy();await this.space(image)
      for(const index of state.missingParts)await this.downloadPart(request,image,index,transport)
    }finally{this.downloading=false}
    return this.ensure(image)
  }
  assertIntent(image,intent){check(intent.version===1&&intent.artifactHash===archiveIdentityHash(image)&&intent.archiveSha256===image.archive.sha256&&['loading','uncertain','verified'].includes(intent.state),'ARTIFACT_RECEIPT_INVALID')}
  async inspectTag(image){let rows;try{rows=JSON.parse(await this.run(['image','inspect',image.archive.tag]))}catch(error){if(imageMissing(error))return null;throw error}check(rows?.length===1,'ARTIFACT_LOADED_IDENTITY_MISMATCH');return rows[0]}
  async space(image){const info=await statfs(this.policy.stateDirectory,{bigint:true}),needed=BigInt(image.archive.size)+2n*BigInt(image.archive.uncompressedSize)+64n*1024n*1024n;check(info.bavail*info.bsize>=needed,'ARTIFACT_DISK_SPACE_REQUIRED','Before load, free space must cover the compressed archive plus two complete tar copies and safety margin')}
  async assembled(image){
    const parts=await this.received(image);check(!parts.missingParts.length,'ARTIFACT_PARTS_REQUIRED','Upload every immutable archive part before preparation')
    const directory=this.directory(image),path=join(directory,'image.tar.gz'),existing=await privateInfo(path)
    if(existing){const actual=await fileHash(path);check(actual.size===image.archive.size&&actual.sha256===image.archive.sha256,'ARTIFACT_ARCHIVE_CORRUPT');return path}
    const temporary=join(directory,`image.${randomUUID()}.tmp`),file=await open(temporary,'wx',0o600),sha=createHash('sha256');let size=0,committed=false
    try{for(let index=0;index<image.archive.parts.length;index++)for await(const chunk of createReadStream(this.partPath(image,index))){size+=chunk.length;sha.update(chunk);await file.writeFile(chunk)}check(size===image.archive.size&&`sha256:${sha.digest('hex')}`===image.archive.sha256,'ARTIFACT_ARCHIVE_CORRUPT');await file.sync();await file.close();await rename(temporary,path);await syncDirectory(directory);committed=true;return path}finally{if(!committed){await file.close().catch(()=>{});await unlink(temporary).catch(()=>{})}}
  }
  async observeLoaded(image){
    try{
      const actual=await this.inspectTag(image);check(actual,'ARTIFACT_LOAD_UNCERTAIN')
      verifyOciProof(image)
      const path=join(this.directory(image),'daemon-readback.tar');await privateDirectory(this.directory(image));await privateInfo(path)
      await this.run(['image','save','--output',path,'--platform',`${image.os}/${image.architecture}`,image.archive.tag],{timeout:900000})
      // Docker creates this file with its own umask. Restrict it before any receipt is trusted.
      const saved=await open(path,'r+');try{await saved.chmod(0o600);await saved.sync()}finally{await saved.close()}
      const roundTrip=await verifyArchiveTar(path,image,{gzip:false}),after=await this.inspectTag(image)
      check(actual.Id===after?.Id&&equal(actual.Descriptor??null,after.Descriptor??null)&&equal(actual.Config,after.Config),'ARTIFACT_LOADED_IDENTITY_MISMATCH')
      const type=actual.Descriptor?.mediaType,localIdKind=actual.Descriptor?.digest===actual.Id&&/image\.index|manifest\.list/.test(type??'')?'index':actual.Descriptor?.digest===actual.Id&&/image\.manifest|manifest\.v2/.test(type??'')?'platform':actual.Id===image.configDigest?'config':null
      const receipt={version:1,state:'verified',artifactHash:archiveIdentityHash(image),archiveSha256:image.archive.sha256,configDigest:image.configDigest,tag:image.archive.tag,localImageId:actual.Id,localIdKind,descriptor:actual.Descriptor??null,configurationHash:hash(actual.Config??{}),roundTrip:{configDigest:roundTrip.configDigest,diffIds:roundTrip.diffIds},verifiedAt:new Date().toISOString()}
      const identity=assertArchiveImageIdentity(actual,image,receipt)
      await privateDirectory(join(this.policy.stateDirectory,'artifacts','identities'));await atomicJson(archiveReceiptPath(this.policy.stateDirectory,image),receipt);await atomicJson(join(this.directory(image),'load.json'),receipt)
      await unlink(path);await syncDirectory(this.directory(image));return identity
    }catch(error){throw Object.assign(fault('ARTIFACT_LOAD_UNCERTAIN','No completed archive load/readback identity has been proven; preserve cache evidence and query status',409),{uncertain:true,cause:error})}
  }
  async ensure(image){
    validateArchive(image)
    const cached=await inspectQualifiedImage(this.run,image,undefined,{stateDirectory:this.policy.stateDirectory});if(cached)return cached
    return this.lock(image,async()=>{
      const directory=this.directory(image),intent=await jsonFile(join(directory,'load.json'))
      if(intent){this.assertIntent(image,intent);return this.observeLoaded(image)}
      await this.space(image)
      const path=await this.assembled(image);await verifyArchiveTar(path,image)
      // A completed earlier load can be adopted only through the same raw daemon-export proof.
      const existing=await this.inspectTag(image)
      const loading={version:1,state:'loading',artifactHash:archiveIdentityHash(image),archiveSha256:image.archive.sha256,configDigest:image.configDigest,startedAt:new Date().toISOString()}
      await atomicJson(join(directory,'load.json'),loading);this.loading.add(image.archive.sha256)
      try{if(!existing){await this.run(['image','load','--input',path],{timeout:900000});await this.afterLoad?.(image)}return await this.observeLoaded(image)}catch(error){await atomicJson(join(directory,'load.json'),{...loading,state:'uncertain'});throw Object.assign(fault('ARTIFACT_LOAD_UNCERTAIN','Docker load has an unresolved result; never replay it automatically',409),{uncertain:true,cause:error})}finally{this.loading.delete(image.archive.sha256)}
    })
  }
}
