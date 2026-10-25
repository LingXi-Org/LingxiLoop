import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {generateAdoption,deriveRuntimeContract,APP_SHA} from './adopt-profile.mjs'
import {qualifyDatabaseEvidence} from '../../release-host/local-control.mjs'
const sha=x=>createHash('sha256').update(x).digest('hex'),h=x=>'sha256:'+sha(x)
function image(label){
 const diffIds=[h(label+'layer')],config={os:'linux',architecture:'amd64',rootfs:{type:'layers',diff_ids:diffIds},config:{Env:['NEVER_COPY=environment-sentinel']}}
 const raw=c=>JSON.stringify(c),configDigest=h(raw(config)),manifest={schemaVersion:2,mediaType:'application/vnd.oci.image.manifest.v1+json',config:{digest:configDigest},layers:[{digest:h(label+'compressed')}]},platformDigest=h(raw(manifest)),index={schemaVersion:2,mediaType:'application/vnd.oci.image.index.v1+json',manifests:[{digest:platformDigest,mediaType:manifest.mediaType,platform:{os:'linux',architecture:'amd64'}}]},indexDigest=h(raw(index))
 return {kind:'image',ref:`ghcr.io/lingxi-org/${label}@${indexDigest}`,digest:indexDigest,indexDigest,platformDigest,configDigest,os:'linux',architecture:'amd64',diffIds,ociProof:Object.fromEntries(Object.entries({index,manifest,config}).map(([k,v])=>[k,Buffer.from(raw(v)).toString('base64')]))}
}
function fixture(){
 const ledger=Array.from({length:57},(_,i)=>({version:i+1,name:i===56?'case_soft_delete':`migration_${i+1}`,checksum:sha(`sql${i+1}`)})),nativeHash=sha('native-schema')
 const metadata={sourceSha:APP_SHA,releaseVersions:{runtime:'3.8.12',schema:14,controlPlane:11,kernel:2,assistantMessage:2,publicText:3,runTrace:1},nativeSchemaHash:nativeHash,migrations:ledger}
 const registry=Object.fromEntries(['server','notebook','wukong','gateway'].map(name=>[name,image(name)])),hosts={}
 const volume=(name,target)=>({Type:'volume',Name:name,Source:'/var/lib/docker/volumes/'+name+'/_data',Destination:target,RW:true})
 for(const side of ['a','b']){
  const inventory={version:1,root:true,architecture:'x86_64',containers:[],images:{},files:[]},targets={}
  const target=(id,adapter,project,services,label,mounts)=>{
   const artifact=registry[label],directory=`/etc/komodo/stacks/${project}/deploy/komodo/${project}`
   inventory.images[artifact.indexDigest]={Id:artifact.indexDigest,Os:'linux',Architecture:'amd64',RootFS:{Type:'layers',Layers:artifact.diffIds},RepoDigests:[artifact.ref],Descriptor:{digest:artifact.indexDigest,mediaType:'application/vnd.oci.image.index.v1+json',size:Buffer.from(artifact.ociProof.index,'base64').length}}
   const f={status:'observed',project,composeFile:directory+'/compose.yml',environmentFile:directory+'/.env',services:{},configurationHash:h(id+'config')};targets[id]=f
   for(const service of services){const c={id:sha(side+service+project),name:project+'-'+service+'-1',imageId:artifact.indexDigest,labels:{'com.docker.compose.project':project,'com.docker.compose.service':service},mounts:mounts[service]??[]};inventory.containers.push(c);f.services[service]={id:c.id,localImageId:c.imageId,mounts:c.mounts,state:{running:true,health:'healthy',restarting:false},runtimeConfigurationHash:h(service+'runtime')};}
   return f
  }
  const runtime=target('main-runtime-'+side,'main-runtime','lingxiloop-app-'+side,['lingxiloop','worker'],'server',{worker:[volume('original-homes-'+side,'/var/lib/lingxios/homes')]});runtime.runtime=structuredClone(metadata)
  if(side==='a'){
   const f=target('wukongim','wukongim','lingxiloop-core-state',['wukongim'],'wukong',{wukongim:[volume('original-wukong','/var/lib/wukongim')]});f.metadata={buildInfoSha256:sha('build'),upstreamCommit:'a'.repeat(40),raftstoreFixCommit:'b'.repeat(40),binarySha256:sha('binary'),healthzExit:0};f.storageEvidence={kind:'audited-writer-and-original-volume',coldSchemaInspected:false}
  }else{
   const f=target('notebook','open-notebook','lingxiloop-knowledge-agent',['open-notebook'],'notebook',{'open-notebook':[volume('notebook-data','/app/data')]});const surrealMounts=[volume('1'.repeat(64),'/data'),volume('surreal-original','/home/nonroot'),volume('2'.repeat(64),'/logs')],s={id:sha('surreal'),name:'original-surreal',imageId:h('opaque-surreal'),labels:{'com.docker.compose.project':'lingxiloop-knowledge-agent','com.docker.compose.service':'surrealdb'},mounts:surrealMounts};inventory.containers.push(s);f.surreal={id:s.id,localImageId:s.imageId,mounts:surrealMounts,state:{health:'healthy'},version:'2.6.5',network:'original-network',versionOutputSha256:sha('surreal-version')};f.readiness={status:'ready',profile:'rag',schemaVersion:1};f.storage={kind:'notebook-rag-surreal-v2',schemaVersion:1,namespace:'open_notebook',database:'active',controlDatabase:'control',databaseInfoHash:h('db-info'),generation:{active_database:'active',phase:'active',revision:1}};f.pendingCommands=0;f.metadata={files:[{path:'/app/open_notebook/rag/runtime.py',sha256:sha('code')}],DO_NOT_COPY:'metadata-sentinel'}
   const g=target('gateway','gateway','lingxiloop-app-b',['gateway'],'gateway',{});g.hotDrainVerified=false;g.metadata={version:'1.31.7',versionOutputSha256:sha('nginx-version'),configurationSha256:sha('nginx-config'),syntaxExit:0,healthzExit:0}
  }
  hosts[side]={inventory,profile:{receipt:{complete:true,targets}},metadata:{runtimes:[{project:'lingxiloop-app-'+side,container:runtime.services.lingxiloop.id.slice(0,12),metadata:structuredClone(metadata)}]}}
 }
 return {hosts,registry,source:{commit:APP_SHA,runtimeDependency:'3.8.12',migrations:ledger,caseSoftDeleteVerified:true},database:{status:'Complete',success:true,state:{runtime:'3.8.12',readOnly:true,fullVisibility:true,nativeSchema:14,installedSchema:14,productSchema:57,migrationCount:57,protocolVersion:11,schemaHash:nativeHash,migrations:ledger,otherClients:17}}}
}
test('derives nonempty exact-equality contract from published tuple and source checksum ledger',()=>{
 const e=fixture(),md=e.hosts.a.metadata.runtimes[0].metadata,c=deriveRuntimeContract(md,e.source)
 assert.equal(c.worker,'lingxios-3.8.12');assert.equal(c.control,'control-plane-11');assert.equal(c.capabilities.length,3);assert.ok(c.capabilities.every(x=>x.includes('-')))
 const bad=structuredClone(md);bad.migrations[56].checksum='f'.repeat(64);assert.throws(()=>deriveRuntimeContract(bad,e.source),/SOURCE_MIGRATION_CHECKSUM_MISMATCH/)
 const r=generateAdoption(e,{intendedOpsSha:'d'.repeat(40)});assert.equal(r.runtimeQualification.migrations.length,57);assert.equal(qualifyDatabaseEvidence(e.database.state,r.policies.a.policy.database).verified,true)
})
test('preserves complete homes and anonymous dependency mounts, excludes environment/proof payloads, never emits accepted baseline',()=>{
 const e=fixture(),r=generateAdoption(e),out=JSON.stringify(r),notebook=r.accepted.componentTemplates.notebook
 assert.deepEqual(Object.keys(r.accepted.componentTemplates).sort(),['gateway','main-runtime-a','main-runtime-b','notebook','wukongim']);assert.equal(notebook.hostPlan.sourceMode,'image');assert.equal(notebook.configuration.volumes['surrealdb:/data'],'1'.repeat(64));assert.equal(notebook.configuration.volumes['surrealdb:/logs'],'2'.repeat(64));assert.equal(r.policies.a.policy.targets['main-runtime-a'].services.worker.mounts[0].source,'original-homes-a');assert.equal(r.policies.a.policy.artifactTransport,'r2');assert.equal(r.ready,false);assert.equal(r.accepted.value,null);assert.equal(r.policies.a.installed,false);assert.equal(out.includes('metadata-sentinel'),false);assert.equal(out.includes('environment-sentinel'),false);assert.equal(out.includes(e.registry.server.ociProof.config),false);assert.ok(r.pending.some(p=>p.code==='GATEWAY_HOT_DRAIN_NOT_INSTALLED'));assert.equal(r.policies.b.policy.ingress,undefined);assert.deepEqual(r.policies.b.policy.targets.gateway.services.gateway.mounts,[])
})
test('mount and database drift omit unsafe targets and retain explicit missing evidence',()=>{
 const e=fixture();e.hosts.a.profile.receipt.targets['main-runtime-a'].services.worker.mounts=[];e.database.state.schemaHash='f'.repeat(64)
 const r=generateAdoption(e);assert.equal(r.accepted.componentTemplates['main-runtime-a'],undefined);assert.equal(r.accepted.componentTemplates['main-runtime-b'],undefined);assert.ok(r.pending.some(p=>p.code==='COMPLETE_MOUNT_INVENTORY_MISMATCH'));assert.ok(r.pending.some(p=>p.code==='DATABASE_PACKAGE_LEDGER_MISMATCH'));assert.ok(r.preservedInventory.a.some(c=>c.mounts.some(m=>m.source==='original-homes-a')))
})
