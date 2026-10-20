// Offline preparation only. This module never calls a production executor.
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {isAbsolute,resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {
  sealHostPlan,validateHostPlan,validateHostPlanShape,assertNativeSchemaUpgrade,
  APPS,CORE,RELEASE_ARGS,NATIVE_SCHEMA_FORMAT,hash,
} from '/workspace/LingxiLoop-native14-host-maintenance/scripts/host-release.mjs';
import {releaseDescriptor,assertInstalledTarget} from '/workspace/LingxiLoop-native14-host-maintenance/scripts/schema-upgrade-maintenance.mjs';
import {buildMemoryBackupPlan,validateMemoryBackupPlan} from '/workspace/LingxiLoop-native14-host-maintenance/scripts/verify-memory-backup.mjs';
import {assertHostComposeChange} from '/workspace/LingxiLoop-native14-host-maintenance/scripts/host-release-compose.mjs';

export const DRIVER_ROOT='/workspace/LingxiLoop-native14-host-maintenance';
export const DRIVER_HEAD='19422466f8463a3a1099c6fbfdd3b92d0228e1b5';
export const SOURCE='7fe5b16e08dbe6634feb701d64e26c28475b917e';
export const SOURCE_COMPOSE='1c2ef95cb5f1a491236b92076177035d752c681a';
export const SOURCE_ACCEPTANCE_SHA='d224c7d7828332d16199fa47330149496572063a0e2d05ea5d54ba5bb5d8aa02';
export const SOURCE_PRODUCTION_SHA='058efb7a8d766420b0ed4d0fcccf9b871fb61076a359fb55b36618073faaccc8';
export const SOURCE_AUDIT_SHA='6160cd5c7d4ce2ca859c93de7ecf524288f076efdb4031539462a33510f0991d';
export const FORMAL_TAR_SHA='aae419aef9b9f22f96377f420e585f0b60c2ebfee421f198864639cb50bd893d';
export const SOURCE_FILES=['plan.json','release-execution.json','image-preparation.json',
  'production-after.json','image-audit/receipt.json','terminal-receipts.json'];
const SOURCE_DIR='/workspace/geometry-release',FORMAL_DIR='/workspace/runtime360-release';
const SOURCE_DRIVER='/workspace/LingxiLoop-product49-host-release';
const SHA=/^[a-f0-9]{40}$/,HEX=/^[a-f0-9]{64}$/,DIGEST=/^sha256:[a-f0-9]{64}$/;
const CI_URL=/^https:\/\/github\.com\/LingXi-Org\/LingxiLoop\/actions\/runs\/[1-9]\d*$/;
const FULL_SCOPE='full linux/amd64 layers, streaming digest/diff-ID verification and merged rootfs inventory; no layer or file bodies persisted';
const SOURCE_RUNTIME_TAR='ee308270402b220452f8eb4e92e9c1d25a68466525f21827203bd5078a9c1bcb';
const APP_PATHS=APPS.map(stack=>`deploy/komodo/${stack}/compose.yml`);
const run=promisify(execFile);
const check=(ok,message)=>{if(!ok)throw Error(message)};
const exactKeys=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)
  &&Object.keys(v).sort().join()===keys.toSorted().join();
const git=async(args,cwd=DRIVER_ROOT)=>(await run('git',args,{
  cwd,encoding:'utf8',timeout:10000,maxBuffer:4*1024*1024,env:{PATH:process.env.PATH},
})).stdout;
async function bytes(path){
  check(isAbsolute(path),'Absolute evidence path required');
  const info=await stat(path);check(info.isFile()&&info.size<=8*1024*1024,'Evidence file missing or oversized');
  return readFile(path);
}
async function bound(ref){
  const raw=await bytes(ref.path);check(hash(raw)===ref.sha256,'Evidence bytes differ from required hash');
  return {raw,value:JSON.parse(raw)};
}
async function driverFrozen(){
  check((await git(['rev-parse','HEAD'])).trim()===DRIVER_HEAD,'Driver HEAD changed');
  check(await git(['status','--porcelain'])==='','Driver tree changed');
}
export function assertInputs(i){
  check(exactKeys(i,['format','targetCommit','sourceAcceptance','sourceProduction','sourceAudit',
    'targetAudit','publishCi','publishCiUrl','preparationComposeCommit','targetComposeCommit','branch','backupAttempt']),
  'Exact offline planner inputs required');
  check(i.format==='native14-offline-plan-inputs/v1','Unknown planner format');
  for(const key of ['targetCommit','preparationComposeCommit','targetComposeCommit'])
    check(SHA.test(i[key]??''),`Required concrete ${key}`);
  check(new Set([SOURCE,SOURCE_COMPOSE,i.targetCommit,i.preparationComposeCommit,i.targetComposeCommit]).size===5,'Distinct exact release and Compose refs required');
  for(const key of ['sourceAcceptance','sourceProduction','sourceAudit','targetAudit','publishCi'])
    check(exactKeys(i[key],['path','sha256'])&&isAbsolute(i[key].path??'')&&HEX.test(i[key].sha256??''),`Required hashed ${key}`);
  check(i.sourceAcceptance.path===SOURCE_DIR+'/final-acceptance.json'&&i.sourceAcceptance.sha256===SOURCE_ACCEPTANCE_SHA
    &&i.sourceProduction.path===SOURCE_DIR+'/production-after.json'&&i.sourceProduction.sha256===SOURCE_PRODUCTION_SHA
    &&i.sourceAudit.path==='/workspace/geometry-image-qualification/image-audit/receipt.json'&&i.sourceAudit.sha256===SOURCE_AUDIT_SHA,
  'Source must be the exact accepted geometry release');
  check(CI_URL.test(i.publishCiUrl??''),'Required exact target CI URL');
  check(/^release\/[a-z0-9][a-z0-9._-]{0,95}$/.test(i.branch??'')&&!i.branch.includes('..')
    &&!i.branch.endsWith('.')&&!i.branch.endsWith('.lock'),'Required safe release branch');
  check(/^[a-z0-9][a-z0-9-]{0,62}$/.test(i.backupAttempt??''),'Required backup attempt prefix (at most 63 characters)');
}
export function assertCi(ci,target,url){
  check(ci?.headSha===target&&ci.status==='completed'&&ci.conclusion==='success'&&ci.url===url&&CI_URL.test(url),'Exact successful target publication CI required');
  check(Array.isArray(ci.jobs)&&new Set(ci.jobs.map(j=>j.name)).size===ci.jobs.length,'Unique CI job inventory required');
  const expected={
    'checks (server)':'success','checks (deploy-contract)':'success','integration':'success',
    'publish (lingxiloop-server, server, server/docker/lingxiloop-server.Dockerfile, .)':'success',
    deploy:'skipped','update-manifests':'skipped',rollout:'skipped',
  };
  for(const [name,conclusion] of Object.entries(expected)){
    const j=ci.jobs.find(j=>j.name===name);
    check(j?.status==='completed'&&j.conclusion===conclusion,'Required CI job outcome missing or inconsistent');
  }
}
export function assertFullAudit(a,commit,runtimeTarHash){
  check(a?.passed===true&&a.repository==='ghcr.io/lingxi-org/lingxiloop-server'
    &&a.sourceCommit===commit&&a.scope===FULL_SCOPE,'Full exact-source image audit required');
  check([a.indexDigest,a.configDigest,a.linuxAmd64ManifestDigest].every(d=>DIGEST.test(d??''))
    &&HEX.test(a.inventorySha256??''),'Complete image identity required');
  check(Number.isSafeInteger(a.layerCount)&&a.layerCount>0&&Array.isArray(a.layers)&&a.layers.length===a.layerCount
    &&a.layers.every(l=>DIGEST.test(l.digest??'')&&DIGEST.test(l.diffId??'')
      &&Number.isSafeInteger(l.compressedBytes)&&l.compressedBytes>0
      &&Number.isSafeInteger(l.uncompressedTarBytes)&&l.uncompressedTarBytes>0),'Complete full-layer inventory required');
  const expected=['app/node_modules/@lyyzka/lingxios/','app/node_modules/pdfjs-dist/'];
  check(Array.isArray(a.packageComparisons)&&a.packageComparisons.length===2
    &&a.packageComparisons.map(p=>p.prefix).sort().join()===expected.sort().join()
    &&a.packageComparisons.every(p=>p.matches===true&&Number.isSafeInteger(p.expectedFiles)
      &&p.expectedFiles>0&&p.actualFiles===p.expectedFiles&&Array.isArray(p.mismatchedPaths)&&p.mismatchedPaths.length===0),
  'Full runtime/PDF package comparisons required');
  check(HEX.test(runtimeTarHash??'')&&a.referenceSha256?.formalRuntimeTar===runtimeTarHash
    &&HEX.test(a.referenceSha256?.pdfInventory??''),'Formal runtime and PDF reference provenance required');
}
const image=(audit,raw)=>({
  indexDigest:audit.indexDigest,configDigest:audit.configDigest,
  manifestDigest:audit.linuxAmd64ManifestDigest,diffIds:audit.layers.map(l=>l.diffId),auditSha256:hash(raw),
});
export function assertAcceptedInputHashes(accepted,raw){
  check(Array.isArray(accepted.inputs)&&accepted.inputs.length===SOURCE_FILES.length
    &&accepted.inputs.map(i=>i.name).sort().join()===SOURCE_FILES.toSorted().join(),'Exact six source acceptance inputs required');
  for(const entry of accepted.inputs)
    check(HEX.test(entry.sha256??'')&&raw[entry.name]&&hash(raw[entry.name])===entry.sha256,'Source acceptance input bytes changed');
}
export async function readSourceEvidence(i){
  const [acceptance,production,audit]=await Promise.all([bound(i.sourceAcceptance),bound(i.sourceProduction),bound(i.sourceAudit)]);
  const raw=Object.fromEntries(await Promise.all(SOURCE_FILES.map(async n=>[n,await bytes(join(SOURCE_DIR,n))])));
  assertAcceptedInputHashes(acceptance.value,raw);
  check(hash(raw['production-after.json'])===hash(production.raw)&&hash(raw['image-audit/receipt.json'])===hash(audit.raw),'Source evidence copies differ');
  assertFullAudit(audit.value,SOURCE,SOURCE_RUNTIME_TAR);
  const verifierProof=[
    ['verify-final-acceptance.mjs','7cf22b9a67055e2f15d239a28deb696982eb30d8faaa20a326a3e07cfb343565'],
    ['collect-terminal-receipts.mjs','5739784c0014d2770de5645731a800da2c0efefc92795885ab7dc023634d7391'],
  ];
  for(const [n,h] of verifierProof)check(hash(await bytes(join(SOURCE_DIR,n)))===h,'Reviewed source verifier changed');
  check((await git(['rev-parse','HEAD'],SOURCE_DRIVER)).trim()==='52ee0d12130f0f4c2b36ec8191275d46d30c0907'
    &&await git(['status','--porcelain'],SOURCE_DRIVER)==='','Source verifier driver changed');
  const [acceptedBytes,beforeBytes]=await Promise.all([bytes(SOURCE_DIR+'/source/qualification.json'),bytes(SOURCE_DIR+'/source/production-after.json')]);
  check(hash(acceptedBytes)===acceptance.value.sourceAcceptanceSha256
    &&hash(beforeBytes)===acceptance.value.sourceProductionReadSha256,'Earlier source proof bytes changed');
  const {verifyEvidence}=await import(pathToFileURL(SOURCE_DIR+'/verify-final-acceptance.mjs'));
  const regenerated=verifyEvidence(raw,{acceptedBytes,beforeBytes,now:Date.parse(acceptance.value.at)});
  assert.deepEqual(regenerated,acceptance.value,'Recorded acceptance does not replay');
  check(regenerated.passed===true&&regenerated.candidate===SOURCE,'Accepted source verification failed');
  const prior=JSON.parse(raw['plan.json']);validateHostPlanShape(prior);
  check(prior.planHash===regenerated.planHash&&prior.target.sha===SOURCE
    &&prior.target.runtime==='3.5.8'&&prior.target.schema===13&&prior.target.productVersion===49,'Wrong accepted source descriptor');
  assert.deepEqual(prior.target.image,image(audit.value,audit.raw));
  for(const row of prior.stacks.filter(r=>r.stack!==CORE))check(row.target.commit===SOURCE_COMPOSE,'Accepted source Compose differs');
  const containers=production.value.containers;
  check(containers.length===4&&containers.every(c=>c.healthy===true&&c.running===true&&c.restartCount===0
    &&c.restarting===false&&c.oomKilled===false&&c.imageSource===SOURCE&&c.declaredSource===SOURCE),'Four healthy accepted source containers required');
  return {source:prior.target,prior,acceptanceRaw:acceptance.raw,auditRaw:audit.raw,provenance:{
    acceptanceSha256:hash(acceptance.raw),productionSha256:hash(production.raw),auditSha256:hash(audit.raw),
    acceptedAt:regenerated.at,acceptedInputs:regenerated.inputs,
    previousAcceptanceSha256:hash(acceptedBytes),previousProductionSha256:hash(beforeBytes),
    verifier:verifierProof.map(([name,sha256])=>({name,sha256})),
    healthyContainers:4,nativeTerminalReceipts:JSON.parse(raw['terminal-receipts.json']).updates.length,
    scope:'Historical acceptance replay at recorded acceptance time; execution must recheck live state.',
  }};
}
export async function readFormalRelease(){
  const qualificationRaw=await bytes(FORMAL_DIR+'/formal-qualification.json');
  const registryRaw=await bytes(FORMAL_DIR+'/formal-registry.json');
  check(hash(qualificationRaw)==='3f42f6b3965e8af2ef15d8f6bca2c8dd1ca4dc0a41279251cf02c72a4a4a4e35'
    &&hash(registryRaw)==='396ac3a8756288654e92fd55c58f8807ca1a2891636d849080c7dc78d368a923','Formal qualification/registry bytes changed');
  const q=JSON.parse(qualificationRaw),r=JSON.parse(registryRaw);
  check(q.version==='3.6.0'&&r.version===q.version&&q.source==='bbe5d4892ea1a805f5c923611bbd91d4320e472a'
    &&q.path===FORMAL_DIR+'/lyyzka-lingxios-3.6.0.tgz'&&q.tarSha256===FORMAL_TAR_SHA
    &&r.dist.integrity===q.integrity&&r.dist.tarball===q.tarball,'Exact formal 3.6.0 proof required');
  const tar=await bytes(q.path);
  check(hash(tar)===FORMAL_TAR_SHA&&'sha512-'+createHash('sha512').update(tar).digest('base64')===q.integrity
    &&createHash('sha1').update(tar).digest('hex')===r.dist.shasum,'Actual formal tar differs from registry/qualification');
  const tarRead=async name=>(await run('tar',['-xOzf',q.path,name],{
    encoding:'buffer',timeout:10000,maxBuffer:2*1024*1024,env:{PATH:process.env.PATH},
  })).stdout;
  const [manifestRaw,schema,schema013,migration]=await Promise.all([
    tarRead('package/package.json'),tarRead('package/db/schema.sql'),
    tarRead('package/db/schema-013.sql'),tarRead('package/db/migrations/016-skill-delivery.sql'),
  ]);
  const manifest=JSON.parse(manifestRaw);
  check(manifest.name==='@lyyzka/lingxios'&&manifest.version===q.version
    &&Object.entries(q.dependencies).every(([name,version])=>manifest.dependencies?.[name]===version)
    &&hash(schema)===q.schemaHash&&hash(schema013)===q.schema013Hash&&migration.length>0,'Packaged formal resources differ');
  const release={runtime:q.version,schema:14,protocol:11,schemaHash:q.schemaHash,integrity:q.integrity,tarball:q.tarball};
  await assertInstalledTarget(release);
  return {release,provenance:{qualificationSha256:hash(qualificationRaw),registrySha256:hash(registryRaw),
    tarSha256:hash(tar),integrity:q.integrity,source:q.source,schemaHash:hash(schema),
    schema013Hash:hash(schema013),migration016Sha256:hash(migration),installedPublicResourcesVerified:true}};
}
export function assertLineageRecord(r,commit,parent){
  check(r.commit===commit&&Array.isArray(r.parents)&&r.parents.length===1&&r.parents[0]===parent,
    'Compose commit must be a direct single-parent child');
  check(Array.isArray(r.paths)&&r.paths.toSorted().join()===APP_PATHS.toSorted().join(),'Compose commit changes unrelated paths');
  check(r.message.includes('[skip ci]')&&r.message.includes('[skip deploy]'),'Compose commits must suppress legacy deployment');
}
async function lineage(commit,parent){
  const [rev,paths,message]=await Promise.all([
    git(['rev-list','--parents','-n','1',commit]),git(['diff-tree','--no-commit-id','--name-only','-r',parent,commit]),
    git(['show','-s','--format=%B',commit]),
  ]);
  const [resolved,...parents]=rev.trim().split(/\s+/),r={commit:resolved,parents,paths:paths.trim().split('\n'),message};
  assertLineageRecord(r,commit,parent);
  return {commit:r.commit,parents:r.parents,paths:r.paths};
}
export async function buildFreshBackup(attemptPrefix){
  check(/^[a-z0-9][a-z0-9-]{0,62}$/.test(attemptPrefix??''),'Safe backup attempt prefix required');
  const nonce=randomBytes(8).toString('hex');
  // The nonce scopes BOTH the backup directory and the isolated restore DB.
  // Execution also uses exclusive directory creation to reject any collision.
  const backup=await buildMemoryBackupPlan({sourceSha:SOURCE,attempt:`${attemptPrefix}-${nonce}`,nonce,profile:'native13-product49'});
  await validateMemoryBackupPlan(backup);
  return backup;
}
export async function makePlan(i){
  assertInputs(i);await driverFrozen();
  const source=await readSourceEvidence(i),formal=await readFormalRelease();
  const [ci,audit]=await Promise.all([bound(i.publishCi),bound(i.targetAudit)]);
  assertCi(ci.value,i.targetCommit,i.publishCiUrl);
  assertFullAudit(audit.value,i.targetCommit,formal.provenance.tarSha256);
  const target={...await releaseDescriptor(i.targetCommit,formal.release),image:image(audit.value,audit.raw)};
  assertNativeSchemaUpgrade(source.source,target);
  const refs=[await lineage(i.preparationComposeCommit,SOURCE_COMPOSE),await lineage(i.targetComposeCommit,i.preparationComposeCommit)];
  const stacks=[];
  for(const original of source.prior.stacks){
    const row={stack:original.stack,server:original.server,source:original.target,target:original.target};
    if(row.stack!==CORE){
      const path=`deploy/komodo/${row.stack}/compose.yml`;
      const [before,prep,final]=await Promise.all([SOURCE_COMPOSE,i.preparationComposeCommit,i.targetComposeCommit].map(ref=>git(['show',ref+':'+path])));
      check(hash(before)===row.source.sha256,'Source Compose bytes differ from accepted source');
      assertHostComposeChange(before,prep,SOURCE,i.targetCommit,'always');
      assertHostComposeChange(prep,final,i.targetCommit,i.targetCommit,'never');
      row.target={commit:i.targetComposeCommit,branch:i.branch,sha256:hash(final),autoPull:false,extraArgs:RELEASE_ARGS};
      row.preparation={commit:i.preparationComposeCommit,sha256:hash(prep)};
    }
    stacks.push(row);
  }
  const backup=await buildFreshBackup(i.backupAttempt);
  const plan=sealHostPlan({format:NATIVE_SCHEMA_FORMAT,createdAt:new Date().toISOString(),
    source:source.source,target,sourceAcceptanceSha256:hash(source.acceptanceRaw),
    qualification:{commit:i.targetCommit,conclusion:'success',ciUrl:i.publishCiUrl},stacks,backup});
  await validateHostPlan(plan,{acceptance:source.acceptanceRaw,sourceAudit:source.auditRaw,targetAudit:audit.raw});
  await driverFrozen();
  // Do not emit a plan after an input was replaced during local qualification.
  for(const key of ['sourceAcceptance','sourceProduction','sourceAudit','targetAudit','publishCi'])await bound(i[key]);
  return {plan,provenance:{format:'native14-offline-plan-provenance/v1',driver:{path:DRIVER_ROOT,commit:DRIVER_HEAD},
    source:source.provenance,formal:formal.provenance,targetCommit:i.targetCommit,
    targetAuditSha256:hash(audit.raw),publishCiSha256:hash(ci.raw),publishCiUrl:i.publishCiUrl,
    composeLineage:refs,backup:{profile:backup.profile,attempt:backup.attempt,nonce:backup.nonce,commandHash:backup.commandHash,
      execution:'not-performed',globalAttemptUniqueness:'not-queried; fresh random nonce scopes attempt and database; executor creates its directory exclusively'},
    limitations:['Offline qualification only; no current production read or backup/restore performed.',
      'Full image audit is imported evidence; this helper does not re-download layers or run the target image.',
      'Canonical seed proof and final live acceptance belong to the separate release helper gates.']}};
}
async function main(){
  const args=process.argv.slice(2);
  check(args.length===4&&args[0]==='--input'&&args[2]==='--output-dir'
    &&isAbsolute(args[1])&&isAbsolute(args[3]),'Use --input <absolute JSON> --output-dir <new absolute directory>');
  const inputRaw=await bytes(args[1]),input=JSON.parse(inputRaw);
  const result=await makePlan(input);
  const planBytes=Buffer.from(JSON.stringify(result.plan,null,2)+'\n');
  const provenance={...result.provenance,inputSha256:hash(inputRaw),planSha256:hash(planBytes),planHash:result.plan.planHash};
  // Exclusive new directory: never replace another attempt or an existing receipt.
  await mkdir(args[3],{mode:0o700});
  await writeFile(join(args[3],'provenance.json'),JSON.stringify(provenance,null,2)+'\n',{flag:'wx',mode:0o600});
  await writeFile(join(args[3],'plan.json'),planBytes,{flag:'wx',mode:0o600});
  console.log(JSON.stringify({mode:'offline-only',planHash:result.plan.planHash,planSha256:hash(planBytes),
    source:SOURCE,target:input.targetCommit,native:14,product:50,backupExecuted:false}));
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)
  main().catch(()=>{console.error('Plan not created: required exact source/formal/target CI/audit/Compose evidence missing or inconsistent. Any partial output directory must not be used.');process.exitCode=1});
