#!/usr/bin/env node
// Standalone read-only bootstrap facts. CLI input selects only a fixed host side, never SQL, paths or commands.
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {createHash} from 'node:crypto'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
const execute=promisify(execFile),LIMIT=8*1024*1024
const sha=bytes=>createHash('sha256').update(bytes).digest('hex')
function ordered(value){if(Array.isArray(value))return value.map(ordered);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,ordered(value[key])]));return value}
const canonical=value=>JSON.stringify(ordered(value)),hash=value=>`sha256:${sha(canonical(value))}`
const issue=code=>Object.assign(new Error(code),{code,profileFactsError:true})
const check=(value,code)=>{if(!value)throw issue(code)}
const digest=value=>/^sha256:[a-f0-9]{64}$/.test(value??''),hex=value=>/^[a-f0-9]{64}$/.test(value??'')
const dbName=value=>/^[A-Za-z][A-Za-z0-9_]{0,95}$/.test(value??'')
const containerId=value=>/^[a-f0-9]{64}$/.test(value??'')
const indexTypes=new Set(['application/vnd.oci.image.index.v1+json','application/vnd.docker.distribution.manifest.list.v2+json'])
const manifestTypes=new Set(['application/vnd.oci.image.manifest.v1+json','application/vnd.docker.distribution.manifest.v2+json'])
const ROOT='/etc/komodo/stacks'
const projects={a:[['main-runtime-a','lingxiloop-app-a',['lingxiloop','worker']],['wukongim','lingxiloop-core-state',['wukongim']]],b:[['main-runtime-b','lingxiloop-app-b',['lingxiloop','worker']],['notebook','lingxiloop-knowledge-agent',['open-notebook']],['gateway','lingxiloop-app-b',['gateway']]]}
const schemaSql="SELECT version FROM open_notebook:rag_schema; SELECT count() AS count FROM command WHERE status NOT IN ['completed','failed','canceled'] GROUP ALL; INFO FOR DB;"
const pointerSql='SELECT active_database,phase,revision FROM open_notebook:rag_active_generation;'
const discoverySql='SELECT namespace,control_database,target_database FROM open_notebook:rag_shadow_generation; SELECT control_database FROM open_notebook:rag_generation_managed;'
const RUNTIME_CODE="import{releaseVersions,packageResources}from'@lyyzka/lingxios';import{readFileSync,readdirSync}from'node:fs';import{createHash}from'node:crypto';const h=b=>createHash('sha256').update(b).digest('hex'),p='/app/server/src/db/migrations',names=readdirSync(p).filter(n=>/^\\d{4}_[a-z0-9_]+\\.sql$/.test(n)).sort();const versions=Object.fromEntries(['runtime','schema','controlPlane','kernel','assistantMessage','publicText','runTrace'].filter(k=>releaseVersions[k]!==undefined).map(k=>[k,releaseVersions[k]]));console.log(JSON.stringify({sourceSha:process.env.LINGXILOOP_COMMIT_SHA,releaseVersions:versions,nativeSchemaHash:h(readFileSync(packageResources().schema)),migrations:names.map(n=>({version:Number(n.slice(0,4)),name:n.slice(5,-4),checksum:h(readFileSync(p+'/'+n))}))}));"
async function runFixed(file,args,{captureStderr=false}={}){try{const{stdout,stderr}=await execute(file,args,{encoding:'utf8',timeout:30000,maxBuffer:LIMIT,env:{PATH:'/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'}});return captureStderr?stdout+stderr:stdout}catch{throw issue('FIXED_READ_COMMAND_FAILED')}}
function safeJson(text){check(typeof text==='string'&&Buffer.byteLength(text)<=LIMIT,'FACT_RESPONSE_TOO_LARGE');try{return JSON.parse(text)}catch{throw issue('FACT_RESPONSE_INVALID')}}
function envOf(container){return Object.fromEntries((container.Config?.Env??[]).map(value=>{const at=value.indexOf('=');check(at>0,'CONTAINER_ENVIRONMENT_INVALID');return[value.slice(0,at),value.slice(at+1)]}))}
function mountFacts(container){return(container.Mounts??[]).map(row=>({type:row.Type,name:row.Name??null,source:row.Source??null,target:row.Destination,readOnly:!row.RW,driver:row.Driver??null,mode:row.Mode??null,propagation:row.Propagation??null})).sort((a,b)=>a.target.localeCompare(b.target))}
function containerFacts(container){return{id:container.Id,localImageId:container.Image,mounts:mountFacts(container),state:{running:container.State?.Running===true,pid:container.State?.Pid??null,health:container.State?.Health?.Status??null,restarting:container.State?.Restarting===true},networks:Object.keys(container.NetworkSettings?.Networks??{}),runtimeConfigurationHash:hash({command:container.Config?.Cmd??null,entrypoint:container.Config?.Entrypoint??null,workingDirectory:container.Config?.WorkingDir??'',user:container.Config?.User??''})}}
function imageFacts(image){
  check(digest(image.Id)&&image.Os==='linux'&&['amd64','arm64'].includes(image.Architecture)&&image.RootFS?.Type==='layers'&&Array.isArray(image.RootFS.Layers)&&image.RootFS.Layers.length>0&&image.RootFS.Layers.every(digest),'IMAGE_FACTS_INCOMPLETE')
  const descriptor=image.Descriptor?{digest:image.Descriptor.digest,mediaType:image.Descriptor.mediaType,size:image.Descriptor.size}:null
  if(descriptor)check(digest(descriptor.digest)&&typeof descriptor.mediaType==='string'&&Number.isSafeInteger(descriptor.size),'IMAGE_DESCRIPTOR_INVALID')
  const kind=descriptor?.digest===image.Id&&indexTypes.has(descriptor.mediaType)?'index':descriptor?.digest===image.Id&&manifestTypes.has(descriptor.mediaType)?'platform':'requires-oci-graph'
  const repoDigests=image.RepoDigests??[];check(repoDigests.every(value=>/^[a-z0-9][a-z0-9./:_-]*@sha256:[a-f0-9]{64}$/.test(value)),'IMAGE_REPOSITORY_FACTS_INVALID')
  const revision=image.Config?.Labels?.['org.opencontainers.image.revision']
  return{localImageId:image.Id,localIdKind:kind,descriptor,repoDigests,os:image.Os,architecture:image.Architecture,diffIds:image.RootFS.Layers,sourceRevision:/^[a-f0-9]{40}$/.test(revision??'')?{status:'observed',value:revision}:{status:'unqualified',reasonCode:'IMAGE_REVISION_NOT_DECLARED'}}
}
function configurationFingerprint(config,services){
  const selected={name:config.name,services:{},volumes:config.volumes??{}}
  for(const service of [...services].sort()){
    const spec=structuredClone(config.services?.[service]);check(spec&&!spec.build&&!spec.privileged&&!spec.use_api_socket,'COMPOSE_SERVICE_UNQUALIFIED');delete spec.image;delete spec.pull_policy
    for(const key of ['ports','volumes','networks','depends_on'])if(Array.isArray(spec[key]))spec[key].sort((a,b)=>canonical(a).localeCompare(canonical(b)))
    selected.services[service]=spec
  }
  return hash(selected)
}
function configurationMatches(config,service,container){
  const actual=envOf(container)
  for(const[key,value]of Object.entries(config.services?.[service]?.environment??{}))check(value===null?!Object.hasOwn(actual,key):actual[key]===String(value),'RUNNING_COMPOSE_ENVIRONMENT_DRIFT')
  const command=config.services?.[service]?.command
  if(Array.isArray(command))check(canonical(command)===canonical(container.Config?.Cmd),'RUNNING_COMPOSE_COMMAND_DRIFT')
}
function privateIp(value){return/^10\.\d+\.\d+\.\d+$/.test(value??'')||/^192\.168\.\d+\.\d+$/.test(value??'')||/^172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(value??'')}
async function boundedJson(response){check(response?.ok,'SURREAL_METADATA_UNAVAILABLE');let size=0;const chunks=[];for await(const part of response.body){size+=part.length;check(size<=1024*1024,'SURREAL_METADATA_TOO_LARGE');chunks.push(part)}return safeJson(Buffer.concat(chunks).toString('utf8'))}
export async function collectProfileFacts(side,{run=runFixed,fetcher=fetch}={}){
  check(side==='a'||side==='b','INVALID_FACTS_SIDE')
  const docker=(args,options)=>run('/usr/bin/docker',args,options),cache=new Map(),imageCache=new Map()
  async function inspect(project,service){
    const key=`${project}:${service}`;if(cache.has(key))return cache.get(key)
    const ids=(await docker(['ps','--all','--quiet','--no-trunc','--filter',`label=com.docker.compose.project=${project}`,'--filter',`label=com.docker.compose.service=${service}`])).trim().split(/\s+/).filter(Boolean)
    check(ids.length===1&&containerId(ids[0]),'CONTAINER_INVENTORY_UNCERTAIN')
    const rows=safeJson(await docker(['container','inspect',ids[0]]));check(rows.length===1,'CONTAINER_INVENTORY_UNCERTAIN')
    const value=rows[0],labels=value.Config?.Labels??{},directory=`${ROOT}/${project}/deploy/komodo/${project}`
    check(value.Id===ids[0]&&digest(value.Image)&&labels['com.docker.compose.project']===project&&labels['com.docker.compose.service']===service&&labels['com.docker.compose.project.working_dir']===directory&&labels['com.docker.compose.project.config_files']===`${directory}/compose.yml`&&(!labels['com.docker.compose.project.environment_file']||labels['com.docker.compose.project.environment_file']===`${directory}/.env`),'CONTAINER_SOURCE_PATH_UNQUALIFIED')
    cache.set(key,value);return value
  }
  async function inspectImage(localId){if(!imageCache.has(localId)){const rows=safeJson(await docker(['image','inspect',localId]));check(rows.length===1&&rows[0].Id===localId,'IMAGE_LOCAL_ID_CHANGED');imageCache.set(localId,rows[0])}return imageCache.get(localId)}
  async function base(target,project,services,result){
    const directory=`${ROOT}/${project}/deploy/komodo/${project}`,config=safeJson(await docker(['compose','--project-name',project,'--env-file',`${directory}/.env`,'--file',`${directory}/compose.yml`,'config','--format','json']))
    check(config.name===project,'COMPOSE_PROJECT_CHANGED');result.project=project;result.composeFile=`${directory}/compose.yml`;result.environmentFile=`${directory}/.env`;result.services={};result.images={}
    const selected={}
    for(const service of services){const value=await inspect(project,service);configurationMatches(config,service,value);selected[service]=value;result.services[service]=containerFacts(value);result.images[value.Image]=imageFacts(await inspectImage(value.Image));check(value.State?.Running&&!value.State?.Restarting&&value.State.Health?.Status==='healthy','SOURCE_SERVICE_NOT_HEALTHY')}
    result.configurationHash=configurationFingerprint(config,services);return selected
  }
  async function runtime(container,result){
    const metadata=safeJson(await docker(['exec','--workdir','/app',container.Id,'node','--input-type=module','-e',RUNTIME_CODE]))
    check(/^[a-f0-9]{40}$/.test(metadata.sourceSha??'')&&/^\d+\.\d+\.\d+$/.test(metadata.releaseVersions?.runtime??'')&&Number.isSafeInteger(metadata.releaseVersions?.schema)&&Number.isSafeInteger(metadata.releaseVersions?.controlPlane)&&hex(metadata.nativeSchemaHash)&&Array.isArray(metadata.migrations)&&metadata.migrations.length>0&&metadata.migrations.every((row,index)=>row.version===index+1&&/^[a-z0-9_]+$/.test(row.name??'')&&hex(row.checksum)),'RUNTIME_METADATA_UNQUALIFIED')
    const versions=Object.fromEntries(['runtime','schema','controlPlane','kernel','assistantMessage','publicText','runTrace'].filter(key=>metadata.releaseVersions[key]!==undefined).map(key=>{const value=metadata.releaseVersions[key];check(Number.isSafeInteger(value)&&value>=0||typeof value==='string'&&/^\d+(?:\.\d+){0,2}$/.test(value),'RUNTIME_VERSION_VALUE_UNQUALIFIED');return[key,value]}))
    result.runtime={sourceSha:metadata.sourceSha,releaseVersions:versions,nativeSchemaHash:metadata.nativeSchemaHash,productSchema:metadata.migrations.length,migrations:metadata.migrations}
  }
  async function wukong(container,result){
    const info=await docker(['exec',container.Id,'cat','/usr/local/share/wukongim/build-info.txt']),entries=Object.fromEntries(info.trim().split('\n').filter(line=>line.includes('=')).map(line=>{const at=line.indexOf('=');return[line.slice(0,at),line.slice(at+1)]})),binary=(await docker(['exec',container.Id,'sha256sum','/usr/local/bin/wukongim'])).trim().split(/\s+/)[0]
    check(/^[a-f0-9]{40}$/.test(entries.upstream_commit??'')&&/^[a-f0-9]{40}$/.test(entries.raftstore_fix_commit??'')&&hex(binary),'WUKONG_BUILD_PROVENANCE_UNQUALIFIED')
    await docker(['exec',container.Id,'wget','-q','-O','/dev/null','http://127.0.0.1:5001/readyz'])
    result.metadata={buildInfoSha256:sha(info),upstreamCommit:entries.upstream_commit,raftstoreFixCommit:entries.raftstore_fix_commit,binarySha256:binary,healthzExit:0};result.storageEvidence={kind:'audited-writer-and-original-volume',coldSchemaInspected:false}
  }
  async function gateway(container,result){
    await docker(['exec',container.Id,'nginx','-t'])
    const version=await docker(['exec',container.Id,'nginx','-v'],{captureStderr:true}),configuration=await docker(['exec',container.Id,'nginx','-T']),match=version.match(/\bnginx\/(\d+\.\d+\.\d+)(?:\s|$)/)
    check(match&&configuration.length>0,'GATEWAY_METADATA_UNQUALIFIED');await docker(['exec',container.Id,'wget','-q','-O','/dev/null','http://127.0.0.1:8080/healthz'])
    result.metadata={version:match[1],versionOutputSha256:sha(version),configurationSha256:sha(configuration),syntaxExit:0,healthzExit:0};result.hotDrainVerified=false
  }
  async function notebook(container,result){
    const ready=safeJson(await docker(['exec',container.Id,'curl','--fail','--silent','--show-error','http://127.0.0.1:5055/readyz']))
    check(ready.status==='ready'&&ready.profile==='rag'&&Number.isSafeInteger(ready.schema_version),'NOTEBOOK_RAG_READINESS_UNQUALIFIED')
    result.readiness={status:ready.status,profile:ready.profile,schemaVersion:ready.schema_version}
    const storage=await inspect('lingxiloop-knowledge-agent','surrealdb'),storageEnv=envOf(storage),env=envOf(container)
    result.surreal={...containerFacts(storage),image:imageFacts(await inspectImage(storage.Image))}
    check(storage.State?.Running&&storage.State.Health?.Status==='healthy','SURREAL_SOURCE_NOT_HEALTHY')
    const version=await docker(['exec',storage.Id,'/surreal','version']),versionMatch=version.match(/\b(\d+\.\d+\.\d+)(?:\s|$)/);check(versionMatch,'SURREAL_VERSION_UNQUALIFIED');result.surreal.version=versionMatch[1];result.surreal.versionOutputSha256=sha(version)
    const networks=Object.keys(container.NetworkSettings?.Networks??{}).filter(name=>storage.NetworkSettings?.Networks?.[name]&&privateIp(storage.NetworkSettings.Networks[name].IPAddress));check(networks.length===1,'SURREAL_NETWORK_AMBIGUOUS')
    const network=networks[0],address=storage.NetworkSettings.Networks[network].IPAddress,user=storageEnv.SURREAL_USER,password=storageEnv.SURREAL_PASS??storageEnv.SURREAL_PASSWORD,namespace=env.SURREAL_NAMESPACE,initialDatabase=env.OPEN_NOTEBOOK_GENERATION_CONTROL_DATABASE||env.SURREAL_DATABASE
    check(user&&password&&dbName(namespace)&&dbName(initialDatabase),'SURREAL_CONNECTION_FACTS_UNQUALIFIED')
    const query=async(database,sql)=>{check(dbName(database),'SURREAL_DATABASE_NAME_UNQUALIFIED');const rows=await boundedJson(await fetcher(`http://${address}:8000/sql`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(5000),headers:{accept:'application/json',authorization:`Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`,'surreal-ns':namespace,'surreal-db':database},body:sql}));check(Array.isArray(rows)&&rows.every(row=>row.status==='OK'),'SURREAL_QUERY_UNQUALIFIED');return rows.map(row=>row.result)}
    const[shadow,managed]=await query(initialDatabase,discoverySql);check(Array.isArray(shadow)&&shadow.length<=1&&Array.isArray(managed)&&managed.length<=1,'NOTEBOOK_GENERATION_AMBIGUOUS')
    let controlDatabase=initialDatabase
    if(shadow.length){check(shadow[0].namespace===namespace&&shadow[0].target_database===initialDatabase&&dbName(shadow[0].control_database)&&shadow[0].control_database!==initialDatabase,'NOTEBOOK_SHADOW_POINTER_UNQUALIFIED');controlDatabase=shadow[0].control_database}
    const[pointer]=await query(controlDatabase,pointerSql);check(Array.isArray(pointer)&&pointer.length<=1,'NOTEBOOK_GENERATION_AMBIGUOUS')
    let activeDatabase=initialDatabase,generation=null
    if(pointer.length){generation={active_database:pointer[0].active_database,phase:pointer[0].phase,revision:pointer[0].revision};check(generation.phase==='active'&&dbName(generation.active_database)&&Number.isSafeInteger(generation.revision)&&generation.revision>=0,'NOTEBOOK_GENERATION_UNQUALIFIED');activeDatabase=generation.active_database}
    else check(!managed.length&&!ready.active_generation,'NOTEBOOK_MANAGED_POINTER_MISSING')
    if(ready.active_generation)check(ready.active_generation.active_database===activeDatabase&&ready.active_generation.revision===generation?.revision,'NOTEBOOK_READINESS_GENERATION_DRIFT')
    const[versions,pending,info]=await query(activeDatabase,schemaSql);check(Array.isArray(versions)&&versions.length===1&&versions[0].version===ready.schema_version&&Array.isArray(pending)&&pending.length<=1&&info&&typeof info==='object'&&!Array.isArray(info),'NOTEBOOK_SCHEMA_UNQUALIFIED')
    const count=pending.length?pending[0].count:0;check(Number.isSafeInteger(count)&&count>=0,'NOTEBOOK_COMMAND_COUNT_UNQUALIFIED')
    const[after]=await query(controlDatabase,pointerSql);check(canonical(after)===canonical(pointer),'NOTEBOOK_GENERATION_CHANGED_DURING_PROBE')
    result.storage={kind:'notebook-rag-surreal-v2',schemaVersion:versions[0].version,namespace,database:activeDatabase,controlDatabase,databaseInfoHash:hash(info),...(generation?{generation,generationHash:hash(generation)}:{})};result.pendingCommands=count;result.surreal.network=network
    const files=[]
    for(const path of ['/app/open_notebook/rag/runtime.py','/app/open_notebook/rag/generation.py','/etc/supervisor/conf.d/supervisord.conf']){const value=(await docker(['exec',container.Id,'sha256sum',path])).trim().split(/\s+/)[0];check(hex(value),'NOTEBOOK_SOURCE_FILE_HASH_UNQUALIFIED');files.push({path,sha256:value})}
    result.metadata={files}
  }
  const targets={}
  for(const[target,project,services]of projects[side]){
    const result={status:'unqualified',reasonCodes:[]};targets[target]=result
    try{const selected=await base(target,project,services,result);if(target.startsWith('main-runtime'))await runtime(selected.lingxiloop,result);else if(target==='wukongim')await wukong(selected.wukongim,result);else if(target==='gateway')await gateway(selected.gateway,result);else await notebook(selected['open-notebook'],result);result.status='observed'}catch(error){result.reasonCodes=[error.profileFactsError===true&&typeof error.code==='string'&&/^[A-Z][A-Z0-9_]+$/.test(error.code)?error.code:'PROFILE_FACTS_UNQUALIFIED']}
  }
  const output={version:1,mode:'read-only-profile-facts',side,complete:Object.values(targets).every(value=>value.status==='observed'),targets}
  check(Buffer.byteLength(JSON.stringify(output))<=2*1024*1024,'FACT_OUTPUT_TOO_LARGE');return output
}
async function main(){check(process.argv.length===2,'UNEXPECTED_FACTS_ARGUMENT');let input='';for await(const chunk of process.stdin){input+=chunk;check(input.length<=16,'INVALID_FACTS_SIDE')}process.stdout.write(JSON.stringify(await collectProfileFacts(input.trim())))}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{process.stdout.write(JSON.stringify({version:1,status:'unqualified',reasonCodes:[error.profileFactsError===true?error.code:'PROFILE_FACTS_UNQUALIFIED']}));process.exitCode=1})
