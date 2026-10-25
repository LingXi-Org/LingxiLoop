// Offline only. No Docker, HTTP, credential store or environment-file reads.
import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {spawnSync} from 'node:child_process'
import {resolve,isAbsolute} from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {isDeepStrictEqual as equal} from 'node:util'
import {assertImageIdentity,verifyOciProof} from '../../release-host/image-identity.mjs'
import {validateContract,validatePolicy} from '../../release-host/adapter.mjs'
import {canonical,hash} from '../../release-host/journal.mjs'
export const APP_SHA='197e2568d46de349bb3ce0a26aefbadaae8f4723'
const NODE='/opt/lingxi-release/node-v22.23.3-linux-x64/bin/node',POLICY='/etc/lingxi-release/policy.json',SECRET='/etc/lingxi-release/secrets/'
const HEX=/^[a-f0-9]{64}$/,DIGEST=/^sha256:[a-f0-9]{64}$/
const check=(value,code)=>{if(!value)throw Error(code)}
const sha=value=>createHash('sha256').update(value).digest('hex')
const roles={lingxiloop:'web',worker:'worker','open-notebook':'component',wukongim:'component',gateway:'component'}
const definitions={a:{'main-runtime-a':['main-runtime','lingxiloop-app-a',['lingxiloop','worker']],wukongim:['wukongim','lingxiloop-core-state',['wukongim']]},b:{'main-runtime-b':['main-runtime','lingxiloop-app-b',['lingxiloop','worker']],notebook:['open-notebook','lingxiloop-knowledge-agent',['open-notebook']],gateway:['gateway','lingxiloop-app-b',['gateway']]}}
const resources=id=>id.startsWith('main-runtime')?['main-runtime','main-db']:id==='gateway'?['main-runtime','main-ingress']:[id]
function migrations(rows){check(Array.isArray(rows)&&rows.length===57&&rows.every((r,i)=>r.version===i+1&&/^[a-z0-9_]+$/.test(r.name)&&HEX.test(r.checksum)),'MIGRATION_INVENTORY_UNQUALIFIED');return rows.map(({version,name,checksum})=>({version,name,checksum}))}
export function deriveRuntimeContract(metadata,source){
 check(metadata?.sourceSha===APP_SHA&&source?.commit===APP_SHA&&source.runtimeDependency==='3.8.12','SOURCE_RUNTIME_UNQUALIFIED')
 const r=metadata.releaseVersions
 check(r?.runtime==='3.8.12'&&r.schema===14&&r.controlPlane===11&&r.kernel===2&&r.assistantMessage===2&&r.publicText===3&&r.runTrace===1&&HEX.test(metadata.nativeSchemaHash),'PUBLISHED_RUNTIME_TUPLE_UNQUALIFIED')
 const ledger=migrations(metadata.migrations)
 check(equal(ledger,migrations(source.migrations))&&source.caseSoftDeleteVerified===true,'SOURCE_MIGRATION_CHECKSUM_MISMATCH')
 const contract={nativeSchema:14,productSchema:57,api:`public-text-${r.publicText}-assistant-${r.assistantMessage}-trace-${r.runTrace}`,worker:`lingxios-${r.runtime}`,checkpoint:`kernel-${r.kernel}-schema-${r.schema}`,control:`control-plane-${r.controlPlane}`,lingxios:r.runtime,capabilities:[`native-schema-${metadata.nativeSchemaHash}`,`product-ledger-${hash(ledger).slice(7)}`,`case-soft-delete-${ledger[56].checksum}`]}
 validateContract(contract);return contract
}
function normalizedMounts(rows){
 check(Array.isArray(rows),'MOUNT_INVENTORY_MISSING')
 const result=rows.map(m=>{const type=m.Type??m.type,source=type==='volume'?(m.Name??m.name):m.Source??m.source,target=m.Destination??m.target,readOnly=m.RW===undefined?m.readOnly:!m.RW
 check(['volume','bind'].includes(type)&&typeof source==='string'&&source.length>0&&typeof target==='string'&&isAbsolute(target)&&typeof readOnly==='boolean','MOUNT_INVENTORY_UNQUALIFIED')
 return {type,source,target,readOnly}}).sort((a,b)=>a.target<b.target?-1:a.target>b.target?1:0)
 check(new Set(result.map(m=>m.target)).size===result.length,'DUPLICATE_MOUNT_TARGET');return result
}
const helper=(file,action,timeoutMs=30000)=>({argv:[NODE,'--experimental-sqlite',`/opt/lingxi-release/current/scripts/release-host/${file}`,POLICY,action],timeoutMs})
const ingress=(id,state=false)=>({url:`https://release-b.lingxilearn.cn/ingress${state?`?target=${id}`:''}`,tokenFile:SECRET+'ingress-executor-token',accessClientIdFile:SECRET+'access-client-id',accessClientSecretFile:SECRET+'access-client-secret'})
function publicImage(image){return Object.fromEntries(['kind','ref','digest','indexDigest','platformDigest','configDigest','os','architecture','variant','diffIds'].filter(k=>image[k]!==undefined).map(k=>[k,structuredClone(image[k])]))}
function cleanComponentFacts(id,f){
 if(id==='notebook'){
  check(f.metadata?.files?.length>0&&f.metadata.files.every(x=>isAbsolute(x.path)&&!x.path.includes('..')&&HEX.test(x.sha256)),'NOTEBOOK_METADATA_UNQUALIFIED')
  const st=f.storage;check(st?.kind==='notebook-rag-surreal-v2'&&st.schemaVersion===1&&[st.namespace,st.database,st.controlDatabase].every(v=>/^[A-Za-z][A-Za-z0-9_]{0,95}$/.test(v))&&DIGEST.test(st.databaseInfoHash),'NOTEBOOK_STORAGE_UNQUALIFIED')
  const storage=Object.fromEntries(['kind','schemaVersion','namespace','database','controlDatabase','databaseInfoHash'].map(k=>[k,st[k]]))
  if(st.generation){check(/^[A-Za-z][A-Za-z0-9_]{0,95}$/.test(st.generation.active_database)&&st.generation.phase==='active'&&Number.isSafeInteger(st.generation.revision)&&st.generation.revision>=0,'NOTEBOOK_GENERATION_UNQUALIFIED');storage.generation={active_database:st.generation.active_database,phase:'active',revision:st.generation.revision}}
  return {...f,metadata:{files:f.metadata.files.map(({path,sha256})=>({path,sha256}))},storage}
 }
 const fields=id==='wukongim'?['buildInfoSha256','upstreamCommit','raftstoreFixCommit','binarySha256','healthzExit']:['version','versionOutputSha256','configurationSha256','syntaxExit','healthzExit']
 const metadata=Object.fromEntries(fields.map(k=>[k,f.metadata?.[k]]))
 if(id==='wukongim')check(['buildInfoSha256','binarySha256'].every(k=>HEX.test(metadata[k]))&&['upstreamCommit','raftstoreFixCommit'].every(k=>/^[a-f0-9]{40}$/.test(metadata[k]))&&metadata.healthzExit===0,'WUKONG_METADATA_UNQUALIFIED')
 else check(/^\d+\.\d+\.\d+$/.test(metadata.version)&&['versionOutputSha256','configurationSha256'].every(k=>HEX.test(metadata[k]))&&metadata.syntaxExit===0&&metadata.healthzExit===0,'GATEWAY_METADATA_UNQUALIFIED')
 return {...f,metadata,storageEvidence:{kind:'audited-writer-and-original-volume',coldSchemaInspected:false}}
}
function componentContract(id,facts,mounts){
 const metadataHash=hash(facts.metadata).slice(7)
 let contract
 if(id==='notebook')contract={nativeSchema:0,productSchema:facts.storage.schemaVersion,api:`notebook-rag-${facts.readiness.schemaVersion}`,worker:`notebook-code-${metadataHash}`,checkpoint:`surreal-${facts.surreal.version}-storage-${hash(facts.storage).slice(7)}`,control:`notebook-ready-${facts.readiness.profile}-${facts.readiness.schemaVersion}`,capabilities:[`notebook-storage-${hash(facts.storage).slice(7)}`,`notebook-code-${metadataHash}`]}
 else if(id==='wukongim')contract={nativeSchema:0,productSchema:0,api:`wukong-build-${facts.metadata.buildInfoSha256}`,worker:`raftstore-fix-${facts.metadata.raftstoreFixCommit}`,checkpoint:`wukong-writer-${facts.metadata.binarySha256}`,control:`wukong-ready-${facts.metadata.buildInfoSha256}`,capabilities:[`wukong-writer-${facts.metadata.binarySha256}`,`wukong-original-mounts-${hash(mounts).slice(7)}`]}
 else contract={nativeSchema:0,productSchema:0,api:`nginx-${facts.metadata.version}`,worker:`nginx-build-${facts.metadata.versionOutputSha256}`,checkpoint:`nginx-config-${facts.metadata.configurationSha256}`,control:`nginx-config-${facts.metadata.configurationSha256}`,capabilities:[`nginx-config-${facts.metadata.configurationSha256}`,`nginx-original-mounts-${hash(mounts).slice(7)}`]}
 validateContract(contract);return contract
}
export function generateAdoption(evidence,{intendedOpsSha}={}){
 check(intendedOpsSha===undefined||/^[a-f0-9]{40}$/.test(intendedOpsSha),'INVALID_INTENDED_OPS_SHA')
 const pending=[],add=(code,target,detail)=>pending.push({code,target,detail}),policies={},components={},imageEvidence={},profiles={},preserved={}
 add('INSTALLED_OPS_AND_POLICY_RECEIPTS_REQUIRED','environment','An intended SHA is not proof of installed executor bytes or policy readback.')
 add('ZERO_IN_FLIGHT_HANDOFF_REQUIRED','environment','No old-publisher stop/zero-in-flight handoff receipt is present in these facts.')
 add('ACCEPTED_RELEASE_ID_SEQUENCE_REQUIRED','environment','Allocate accepted release identity/sequence only during the serialized handoff.')
 let db,contract
 try{
  db=evidence.database.state;check(evidence.database.status==='Complete'&&evidence.database.success===true&&db.readOnly===true&&db.fullVisibility===true&&db.nativeSchema===14&&db.installedSchema===14&&db.productSchema===57&&db.migrationCount===57&&db.runtime==='3.8.12'&&db.protocolVersion===11&&HEX.test(db.schemaHash),'DATABASE_SNAPSHOT_UNQUALIFIED')
  migrations(db.migrations)
 }catch(error){add(error.message,'database','The independent read-only schema/checksum snapshot is not qualified.');db=null}
 for(const side of ['a','b']){
  const host=evidence.hosts[side],inventory=host.inventory,targets=host.profile.receipt?.targets??host.profile.targets
  check(inventory?.version===1&&inventory.root===true&&inventory.architecture==='x86_64'&&targets&&(host.profile.receipt??host.profile).complete===true,'HOST_FACTS_UNQUALIFIED')
  preserved[side]=inventory.containers.map(c=>({container:c.name,project:c.labels['com.docker.compose.project'],service:c.labels['com.docker.compose.service'],mounts:normalizedMounts(c.mounts)}))
  const policy={version:1,listen:{host:'127.0.0.1',port:17951},stateDirectory:'/var/lib/lingxi-release',tokenFile:'/run/credentials/lingxi-release-host.service/executor-token',dockerBinary:'/usr/bin/docker',artifactTransport:'r2',acceptedOpsShas:intendedOpsSha?[intendedOpsSha]:[],archive:{baseUrl:'https://release.lingxilearn.cn',tokenFile:SECRET+'executor-token',timeoutMs:60000},targets:{}}
  policies[side]={readyForInstallation:false,installed:false,policy}
  for(const [id,[adapter,project,services]] of Object.entries(definitions[side])){
   const f=targets[id]
   try{
    const directory=`/etc/komodo/stacks/${project}/deploy/komodo/${project}`
    check(f?.status==='observed'&&f.project===project&&f.composeFile===directory+'/compose.yml'&&f.environmentFile===directory+'/.env'&&DIGEST.test(f.configurationHash),'TARGET_FACTS_UNQUALIFIED')
    check(equal(Object.keys(f.services).sort(),[...services].sort()),'TARGET_SERVICE_SCOPE_MISMATCH')
    const local={adapter,project,composeFile:f.composeFile,envFile:f.environmentFile,services:{},controls:{}}
    const images={},mounts={}
    for(const service of services){
     const fact=f.services[service],found=inventory.containers.filter(c=>c.labels['com.docker.compose.project']===project&&c.labels['com.docker.compose.service']===service)
     check(found.length===1&&fact.id===found[0].id&&fact.localImageId===found[0].imageId&&fact.state?.running===true&&fact.state?.health==='healthy'&&fact.state?.restarting===false&&DIGEST.test(fact.runtimeConfigurationHash),'CONTAINER_FACTS_MISMATCH')
     mounts[service]=normalizedMounts(fact.mounts);check(equal(mounts[service],normalizedMounts(found[0].mounts)),'COMPLETE_MOUNT_INVENTORY_MISMATCH')
     local.services[service]={role:roles[service],mounts:mounts[service]}
     const candidates=Object.entries(evidence.registry).filter(([,image])=>[image.indexDigest,image.platformDigest,image.configDigest].includes(fact.localImageId))
     check(candidates.length===1,'CANONICAL_IMAGE_PROOF_MISSING')
     const [proofKey,image]=candidates[0];verifyOciProof(image);assertImageIdentity(inventory.images[fact.localImageId],image)
     images[service]=publicImage(image)
     imageEvidence[image.configDigest]={qualified:true,localImageId:fact.localImageId,registryProofKey:proofKey,ociProofHashes:Object.fromEntries(Object.entries(image.ociProof).map(([k,v])=>[k,`sha256:${sha(Buffer.from(v,'base64'))}`]))}
    }
    let targetContract
    if(adapter==='main-runtime'){
     const packaged=host.metadata.runtimes.filter(r=>r.project===project)
     check(packaged.length===1&&f.runtime.sourceSha===packaged[0].metadata.sourceSha&&f.services.lingxiloop.id.startsWith(packaged[0].container)&&equal(packaged[0].metadata.releaseVersions,f.runtime.releaseVersions)&&equal(migrations(packaged[0].metadata.migrations),migrations(f.runtime.migrations))&&packaged[0].metadata.nativeSchemaHash===f.runtime.nativeSchemaHash,'RUNTIME_PACKAGE_FACTS_MISMATCH')
     targetContract=deriveRuntimeContract({...f.runtime,sourceSha:packaged[0].metadata.sourceSha},evidence.source)
     check(db&&f.runtime.nativeSchemaHash===db.schemaHash&&equal(migrations(f.runtime.migrations),migrations(db.migrations)),'DATABASE_PACKAGE_LEDGER_MISMATCH')
     if(contract)check(equal(contract,targetContract),'RUNTIME_CONTRACT_MISMATCH');contract=targetContract
     local.databaseOwner=side==='a';local.migration={service:'db-migrate',imageService:'lingxiloop'};local.qualifiedRollingContracts=[]
     for(const action of ['state','barrier','readiness'])local.controls[action]=helper('local-control.mjs',action)
     if(side==='a')for(const action of ['backup','backupObserve','restoreVerify','restoreVerifyObserve','migrate','migrateObserve'])local.controls[action]=helper('database-tools.mjs',action,1800000)
     local.controls.ingress=ingress(id);local.controls.ingressState=ingress(id,true);local.readinessUrl=null
     add('LOCAL_READINESS_ENDPOINT_REQUIRED',id,'Bind and verify the actual host HTTP readiness route; no URL is guessed from a port number.')
     policy.database={transport:'cached-client',clientImage:f.services.lingxiloop.localImageId,clientWorkdir:'/app',envFile:f.environmentFile,profiles:{[`${db.nativeSchema}:${db.productSchema}:${db.schemaHash}`]:{contract:targetContract,migrationsHash:hash(migrations(db.migrations)),protocolVersion:db.protocolVersion,requiredCapabilities:targetContract.capabilities}}}
     if(side==='a'){
      const postgres=inventory.containers.filter(c=>c.labels['com.docker.compose.project']==='lingxiloop-core-state'&&c.labels['com.docker.compose.service']==='postgres')
      if(postgres.length===1)policy.database.container=postgres[0].name
      add('DATABASE_BACKUP_LOGIN_IDENTITY_REQUIRED',id,'Read-only cached-client evidence can use existing envFile; backup/restore additionally needs independently proven PostgreSQL user and database names, absent from this fact set.')
     }
    }else{
     const clean=cleanComponentFacts(id,f)
     targetContract=componentContract(id,clean,mounts)
     const image=Object.values(images)[0],metadata=clean.metadata
     // Exact metadata hashes are public facts; no runtime environment is copied.
     const profile={kind:id==='notebook'?'notebook-rag':id==='gateway'?'gateway':'wukongim',contract:targetContract,metadata,storage:id==='notebook'?clean.storage:id==='wukongim'?{...clean.storageEvidence,mounts}:undefined,allowedStopExitCodes:[]}
     profiles[id]={imageProfiles:{[image.configDigest]:profile}}
     if(id==='gateway'){
      local.gateway={imageProfiles:{[image.configDigest]:{contract:targetContract,metadata}}}
      add('GATEWAY_HOT_DRAIN_NOT_INSTALLED',id,'Observed mounts are empty and hotDrainVerified=false; no ingress template/output mount or loaded generation listener is proved. Do not invent a hot-drain policy.')
     }else{
      local.component={imageProfiles:{[image.configDigest]:profile},dependencies:{}}
      add('COMPONENT_STOP_EXIT_CODES_REQUIRED',id,'Normal bounded shutdown exit codes require explicit qualification; empty allowlist deliberately blocks changed-image shutdown acceptance.')
      if(id==='notebook'){
       check(f.readiness?.status==='ready'&&f.readiness.profile==='rag'&&f.storage?.schemaVersion===1&&f.pendingCommands===0,'NOTEBOOK_STORAGE_UNQUALIFIED')
       const surreal=f.surreal;check(surreal&&surreal.state?.health==='healthy'&&surreal.version&&surreal.network,'SURREAL_DEPENDENCY_UNQUALIFIED')
       const found=inventory.containers.find(c=>c.id===surreal.id);check(found&&equal(normalizedMounts(found.mounts),normalizedMounts(surreal.mounts)),'SURREAL_MOUNT_INVENTORY_MISMATCH')
       local.component.surreal={dependency:'surrealdb',network:surreal.network}
       profiles[id].dependencyTemplate={project,service:'surrealdb',mounts:normalizedMounts(surreal.mounts),version:surreal.version,versionOutputSha256:surreal.versionOutputSha256,observedLocalImageId:surreal.localImageId,image:null}
       add('SURREAL_CANONICAL_IMAGE_GRAPH_REQUIRED',id,'Complete dependency mounts/version are preserved, but no independent Surreal OCI index/platform/config graph exists in registry-proofs.json.')
      }
     }
    }
    policy.targets[id]=local
    const volumes={};for(const[service,list]of Object.entries(mounts))for(const m of list)volumes[`${service}:${m.target}`]=m.source
    if(id==='notebook')for(const m of profiles.notebook.dependencyTemplate.mounts)volumes[`surrealdb:${m.target}`]=m.source
    components[id]={readyForAcceptance:false,releaseId:null,appSha:adapter==='main-runtime'?APP_SHA:null,sequence:null,adapter,resources:resources(id),dependsOn:[],fromReleaseId:null,hosts:[side],artifact:{kind:'image',digest:Object.values(images)[0].indexDigest},contract:targetContract,configuration:{version:f.configurationHash.slice(7),secretRefs:[],volumes},hostPlan:{version:1,mode:'maintenance',sourceMode:'image',images,configurationHash:f.configurationHash,recovery:{images:structuredClone(images),configurationHash:f.configurationHash,contract:targetContract},contract:targetContract},verification:{readiness:[],businessProbe:null},configurationEvidence:{composePath:f.composeFile,envPath:f.environmentFile,configurationHash:f.configurationHash,serviceRuntimeHashes:Object.fromEntries(services.map(s=>[s,f.services[s].runtimeConfigurationHash]))}}
    if(adapter!=='main-runtime')add('COMPONENT_APPLICATION_COMMIT_ATTESTATION_REQUIRED',id,'Canonical image identity is proved; these image metadata facts do not declare a product application commit.')
    add('BUSINESS_PROBE_BINDING_REQUIRED',id,'Controller named readiness/business probes and observed route coverage are not in these facts.')
   }catch(error){add(/^[A-Z][A-Z0-9_]+$/.test(error.code??error.message)?(error.code??error.message):'TARGET_QUALIFICATION_FAILED',id,'Target draft omitted because an exact source, image, storage or configuration proof failed.')}
  }
  if(intendedOpsSha)validatePolicy(policy)
 }
 if(db){const count=db.otherClients;if(count!==0)add('DATABASE_NOT_DRAINED','database',`The recorded snapshot has otherClients=${Number.isSafeInteger(count)?count:'unknown'}; do not reuse it as zero-writer handoff evidence.`)}
 add('OCI_GRAPH_REFERENCE_ATTACHMENT_REQUIRED','images','OCI graphs were verified in memory; generated templates retain only digest references so no image Config.Env bytes are copied. Attach the existing exact proof blobs through the integrator before containerd identity checks.')
 add('R2_ARCHIVE_AND_ROUNDTRIP_RECEIPTS_REQUIRED','images','Registry graph proof is not an R2 archive/part/daemon-roundtrip receipt. Future images need their exact immutable archive identities.')
 return {version:1,ready:false,installed:false,policies,accepted:{ready:false,value:null,componentTemplates:components},runtimeQualification:contract?{contract,sourceCommit:APP_SHA,nativeSchemaHash:db.schemaHash,migrations:migrations(db.migrations),migrationsHash:hash(migrations(db.migrations)),protocolVersion:db.protocolVersion,drained:false}:null,componentProfileTemplates:profiles,imageEvidence,preservedInventory:preserved,pending}
}
export function loadEvidence(directory='/workspace/scratch/handoff-495'){
 const read=name=>JSON.parse(readFileSync(resolve(directory,name),'utf8'))
 const hosts=Object.fromEntries(['a','b'].map(side=>[side,{inventory:read(`host-${side}-inventory.json`),profile:read(`host-${side}-profile-facts.json`),metadata:read(`host-${side}-runtime-metadata.json`)}]))
 const repo=fileURLToPath(new URL('../../../',import.meta.url))
 const git=args=>{const result=spawnSync('git',args,{cwd:repo,encoding:'utf8',shell:false,maxBuffer:4*1024*1024});check(result.status===0,'IMMUTABLE_SOURCE_UNAVAILABLE');return result.stdout}
 const pkg=JSON.parse(git(['show',`${APP_SHA}:server/package.json`])),rows=migrations(hosts.a.metadata.runtimes[0].metadata.migrations)
 const sourceMigrations=rows.map(({version,name})=>({version,name,checksum:sha(git(['show',`${APP_SHA}:server/src/db/migrations/${String(version).padStart(4,'0')}_${name}.sql`]))}))
 const last=git(['show',`${APP_SHA}:server/src/db/migrations/0057_case_soft_delete.sql`])
 const queries=git(['grep','-l','-F','deleted_at IS NULL',APP_SHA,'--','server/src'])
 return {hosts,registry:read('registry-proofs.json'),database:read('independent-database-state.json'),source:{commit:APP_SHA,runtimeDependency:pkg.dependencies?.['@lyyzka/lingxios'],migrations:sourceMigrations,caseSoftDeleteVerified:/ALTER TABLE organization_cases ADD COLUMN deleted_at timestamptz/.test(last)&&queries.includes('/agent-runtime/')}}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{console.log(JSON.stringify(generateAdoption(loadEvidence(process.argv[2]),{intendedOpsSha:process.argv[3]}),null,2))}catch{console.error('ADOPTION_EVIDENCE_UNQUALIFIED');process.exitCode=1}}
