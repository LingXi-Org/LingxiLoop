import {isDeepStrictEqual as equal} from 'node:util'
import {createTransport} from './schema-upgrade-komodo.mjs'
import {releaseDescriptor,assertInstalledTarget} from './schema-upgrade-maintenance.mjs'
import {assertImageIdentity} from './host-release.mjs'
import {MODEL_TARGET,MODEL_APPS,MODEL_CORE,MODEL_CONFIG_FORMAT,modelHash,patchModelEnvironment,sealModelConfigPlan,validateModelConfigPlan} from './host-release-model-config.mjs'
import {createModelConfigOperations,modelContainerPolicyHash,modelTargetPolicyHash} from './host-release-model-config-komodo.mjs'
const hex=/^[a-f0-9]{64}$/,check=(v,m)=>{if(!v)throw Error(m)},parse=b=>JSON.parse(b.toString('utf8')),key=r=>r.stack+':'+r.service
const sha=b=>modelHash(b),own=(v,names)=>Object.fromEntries(names.map(k=>[k,v?.[k]]))
export function modelSourceProof(acceptance){
 const a=typeof acceptance==='object'&&!Buffer.isBuffer(acceptance)?acceptance:parse(acceptance)
 check(a?.format==='public-text-host-acceptance/v1'&&a.passed===true&&Object.keys(a.checks??{}).length>0&&Object.values(a.checks).every(v=>v===true),'Successful actual public-text source acceptance required')
 const stacks=a.evidence?.observed?.stacks,readers=a.readerContainers,containers=a.evidence?.observed?.containers
 check(Array.isArray(stacks)&&stacks.length===3&&Array.isArray(readers)&&readers.length===4&&Array.isArray(containers)&&containers.length===4,'Full source stack and container policy evidence required')
 return {candidate:a.candidate,stacks:stacks.map(r=>({stack:r.stack,id:r.id,configSha256:r.configSha256,composeSha256:r.ref?.sha256??r.composeSha256})),containers:readers.map(r=>{const c=containers.find(c=>key(c)===key(r));return {...own(r,['stack','service','id','imageId']),policySha256:c?.policy?.configurationSha256??c?.configurationSha256}})}
}
export function validateModelKnowledgeEvidence(plan,files){
 check(sha(files.knowledgePlan)===plan.knowledge.manifestSha256&&sha(files.knowledgeFence)===plan.knowledge.fenceSha256,'Knowledge plan/fence bytes changed')
 const p=parse(files.knowledgePlan),f=parse(files.knowledgeFence),a=p?.result,b=f?.result
 check(p?.complete===true&&p.action==='plan'&&a?.format==='rag-shadow-plan/v1'&&hex.test(a.sha256??'')&&a.target_model===MODEL_TARGET.OPENAI_EMBEDDING_MODEL&&typeof a.namespace==='string'&&typeof a.source_database==='string'&&typeof a.target_database==='string'&&a.source_database!==a.target_database&&Number.isSafeInteger(a.source_revision)&&a.source_revision>=0&&Number.isSafeInteger(a.reserved_input_tokens)&&a.reserved_input_tokens>=0&&typeof a.reserved_cost_cny==='string'&&a.reserved_cost_cny.length<=64&&/^(0|[1-9]\d*)(?:\.\d+)?$/.test(a.reserved_cost_cny)&&Number.isFinite(Number(a.reserved_cost_cny)),'Complete finite shadow migration plan required')
 check(['sources','notebooks','references','chunks','commands'].every(k=>Number.isSafeInteger(a.counts?.[k])&&a.counts[k]>=0)&&['scope_sha256','binding_manifest_sha256','source_sha256','source_vectors_sha256','source_contract_sha256'].every(k=>hex.test(a[k]??'')),'Complete shadow scope, source and budget bindings required')
 check(f?.complete===true&&f.action==='fence'&&b?.format==='rag-shadow-fence/v1'&&b.phase==='fenced'&&hex.test(b.sha256??'')&&b.plan_sha256===a.sha256&&b.source_sha256===a.source_sha256&&b.migration_id===a.migration_id&&b.source_database===a.source_database&&b.target_database===a.target_database&&b.active_database===a.source_database&&b.revision===a.source_revision&&equal(b.counts,a.counts),'Actual matching old-generation fence receipt required')
 const image=plan.knowledge.probe.image, audit=parse(files.knowledgeImageAudit),digest=/^sha256:[a-f0-9]{64}$/
 check(sha(files.knowledgeImageAudit)===image.auditSha256&&audit.format==='cloud-knowledge-oci-full-audit/v1'&&audit.passed===true&&audit.sourceCommit===image.reference.slice(image.reference.lastIndexOf(':')+1)&&audit.indexDigest===image.indexDigest&&audit.configDigest===image.configDigest&&audit.linuxAmd64ManifestDigest===image.manifestDigest&&audit.layers?.length===image.diffIds.length&&equal(audit.layers.map(r=>r.diffId),image.diffIds)&&audit.layers.every(r=>digest.test(r.digest??'')&&['compressedBytes','expandedBytes','entries'].every(k=>Number.isSafeInteger(r[k])&&r[k]>0)),'Complete matching knowledge OCI all-layer audit required')
 check(['inventorySha256','dockerfileSha256','uvLockSha256'].every(k=>hex.test(audit[k]??''))&&audit.sourceComparisons?.length>0&&audit.sourceComparisons.every(r=>r.matches===true&&hex.test(r.sha256??'')&&typeof r.path==='string'&&typeof r.target==='string')&&audit.sourceComparisons.some(r=>r.path==='third_party/open-notebook/open_notebook/rag/shadow.py')&&audit.pythonDistributions?.length>20&&audit.pythonDistributions.every(r=>typeof r.name==='string'&&typeof r.version==='string'&&hex.test(r.metadataSha256??''))&&['surrealdb','fastapi','surreal-commands','openai','pydantic','uvicorn'].every(n=>audit.pythonDistributions.some(r=>r.name===n)),'Knowledge source and locked Python runtime audit required')
 return {namespace:a.namespace,sourceDatabase:a.source_database,targetDatabase:a.target_database,planSha256:a.sha256,sourceRevision:a.source_revision,counts:a.counts,reservedInputTokens:a.reserved_input_tokens,reservedCostCny:a.reserved_cost_cny}
}
export async function validateModelConfigEvidence(plan,files){
 validateModelConfigPlan(plan)
 check(sha(files.acceptance)===plan.sourceAcceptanceSha256&&sha(files.audit)===plan.sourceAuditSha256,'Source acceptance or audit bytes changed')
 const proof=modelSourceProof(files.acceptance),audit=parse(files.audit)
 check(proof.candidate===plan.release.sha&&audit.passed===true&&audit.sourceCommit===plan.release.sha&&audit.indexDigest===plan.release.image.indexDigest&&audit.configDigest===plan.release.image.configDigest&&audit.linuxAmd64ManifestDigest===plan.release.image.manifestDigest&&equal(audit.layers?.map(r=>r.diffId),plan.release.image.diffIds)&&audit.formalRuntimeIntegrity===plan.release.integrity&&audit.packageComparisons?.length>0&&audit.packageComparisons.every(r=>r.matches===true&&r.actualFiles===r.expectedFiles&&r.actualFiles>0)&&audit.sourceComparisons?.length>0&&audit.sourceComparisons.every(r=>r.matches===true),'Complete matching all-layer and formal-runtime audit required')
 check('sha256:'+sha(files.imageConfig)===plan.release.image.configDigest,'Audited source image config bytes changed')
 for(const row of plan.stacks){const old=proof.stacks.find(r=>r.stack===row.stack);check(old?.id===row.id&&old.configSha256===row.sourceConfigSha256&&old.composeSha256===row.composeSha256,'Stack plan is not the accepted exact source')}
 for(const row of plan.containers){const old=proof.containers.find(r=>key(r)===key(row));check(old?.id===row.id&&old.imageId===row.imageId&&old.policySha256===row.sourcePolicySha256,'Container plan is not the accepted exact source')}
 const derived=await releaseDescriptor(plan.release.sha,plan.release);check(equal(derived,own(plan.release,Object.keys(derived))),'Committed formal package or migration bytes changed');await assertInstalledTarget(plan.release)
 return validateModelKnowledgeEvidence(plan,files)
}

export async function collectModelConfigPlan({draft,files,apiKey,apiSecret,signal,transport,fetcher=fetch,onProgress=async()=>{}}){
 check(draft&&equal(Object.keys(draft).sort(),['knowledge','release','sourceModels']),'Only release/source-model/knowledge input fields are permitted')
 let refusal=null
 const tracedFetcher=async(url,init)=>{const r=await fetcher(url,init);if([401,403].includes(r.status))refusal={httpStatus:r.status,operation:new URL(url).pathname.split('/').at(-1)};return r}
 const raw=transport??createTransport({apiKey,apiSecret,signal,fetcher:tracedFetcher,onProgress,confirmTerminal:true}),guarded=async fn=>{refusal=null;try{return await fn()}catch(error){throw Object.assign(error,refusal??{})}},t={read:(op,q)=>guarded(()=>raw.read(op,q)),refreshStackCache:stack=>guarded(()=>raw.refreshStackCache(stack))}
 const proof=modelSourceProof(files.acceptance),rows=[],containers=[]
 check(proof.candidate===draft.release?.sha,'Fresh accepted source commit required')
 for(const [i,stack] of [...MODEL_APPS,MODEL_CORE].entries()){
  const before=proof.stacks.find(r=>r.stack===stack);check(before&&hex.test(before.configSha256??'')&&hex.test(before.composeSha256??''),'Source full configuration unavailable')
  await t.refreshStackCache(stack);const detail=await t.read('GetStack',{stack});check(detail?._id?.$oid===before.id&&modelHash(JSON.stringify(detail.config))===before.configSha256,'Source configuration drift before planning')
  const row={stack,server:i===1?'shanghai-b':'shanghai-a',id:before.id,sourceConfigSha256:before.configSha256,targetConfigSha256:stack===MODEL_CORE?before.configSha256:modelHash(JSON.stringify({...detail.config,environment:patchModelEnvironment(detail.config.environment)})),composeSha256:before.composeSha256};rows.push(row)
  if(stack===MODEL_CORE)continue
  const image=await t.read('InspectImage',{server:row.server,image:'accel.way2api.fun/ghcr.io/lingxi-org/lingxiloop-server:'+draft.release.sha});assertImageIdentity(image,draft.release.image)
  const services=await t.read('ListStackServices',{stack})
  for(const service of ['lingxiloop','worker']){
   const old=proof.containers.find(r=>r.stack===stack&&r.service===service),found=services.filter(r=>r.service===service);check(old&&found.length===1&&found[0].container?.id===old.id,'Accepted source container unavailable')
   const c=await t.read('InspectContainer',{server:row.server,container:old.id}),sourcePolicySha256=modelContainerPolicyHash(c);check(c.Id===old.id&&c.Image===old.imageId&&sourcePolicySha256===old.policySha256,'Accepted source container policy drift')
   containers.push({stack,service,id:old.id,imageId:old.imageId,sourcePolicySha256,targetPolicySha256:modelTargetPolicyHash(c)})
  }
 }
 const k=draft.knowledge
 check(k&&equal(Object.keys(k).sort(),['configSha256','containerId','id','imageId','probe','server','stack']),'Exact prior knowledge resource and audited probe identity required')
 const plan=sealModelConfigPlan({format:MODEL_CONFIG_FORMAT,createdAt:new Date().toISOString(),release:draft.release,sourceAcceptanceSha256:sha(files.acceptance),sourceAuditSha256:sha(files.audit),sourceModels:draft.sourceModels,targetModels:MODEL_TARGET,stacks:rows,containers,knowledge:{mode:'stopped',...k,manifestSha256:sha(files.knowledgePlan),fenceSha256:sha(files.knowledgeFence)}})
 const knowledge=await validateModelConfigEvidence(plan,files),ops=createModelConfigOperations({plan,imageConfig:files.imageConfig.toString('utf8'),knowledgePlan:files.knowledgePlan.toString('utf8'),apiKey,apiSecret,signal,transport,fetcher,onProgress})
 const observed=await ops.assertBoundary({stopped:new Set(),configured:new Set(),deployed:new Map()}),state=await ops.state(),liveFence=await ops.verifyKnowledgeFence()
 const {assertCompatibleState}=await import('./host-release.mjs');assertCompatibleState(state,plan.release)
 return {plan,observed:{containers:observed,state,knowledge:{...knowledge,liveFence}}}
}
