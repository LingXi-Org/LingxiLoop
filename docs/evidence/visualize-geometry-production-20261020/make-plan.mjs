// Offline only: no plan is written until actual recovered source evidence is qualified.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {pathToFileURL} from 'node:url';
import {resolve,isAbsolute} from 'node:path';
import {sealHostPlan,validateHostPlan,hash,assertSameSchema} from '/workspace/LingxiLoop-product49-host-release/scripts/host-release.mjs';
import {releaseDescriptor} from '/workspace/LingxiLoop-product49-host-release/scripts/schema-upgrade-maintenance.mjs';
import {qualify} from './qualify-recovered-source.mjs';
const DIR='/workspace/geometry-release',ROOT='/workspace/LingxiLoop-product49-host-release',run=promisify(execFile);
const SOURCE='cf4a299bcfb44d7e7ed74a250ea1404588a4e901',TARGET='7fe5b16e08dbe6634feb701d64e26c28475b917e';
const PREP='54a95e640d068f938a4b52ca1cc622a9290af588',FINAL='1c2ef95cb5f1a491236b92076177035d752c681a',BRANCH='release/visualize-geometry-production-20261020';
const read=async p=>{const bytes=await readFile(p);return {bytes,value:JSON.parse(bytes)}};
const git=async args=>(await run('git',args,{cwd:ROOT,encoding:'utf8',maxBuffer:2*1024*1024})).stdout;
export async function makePlan(inputs){
 assert.deepEqual(Object.keys(inputs).sort(),['targetAudit','ci','ciUrl','targetComposeCommit','preparationComposeCommit','branch'].sort());
 assert.ok(isAbsolute(inputs.targetAudit)&&isAbsolute(inputs.ci));assert.equal(inputs.ciUrl,'https://github.com/LingXi-Org/LingxiLoop/actions/runs/39466348087');assert.equal(inputs.targetComposeCommit,FINAL);assert.equal(inputs.preparationComposeCommit,PREP);assert.equal(inputs.branch,BRANCH);
 assert.equal((await git(['rev-parse','HEAD'])).trim(),'52ee0d12130f0f4c2b36ec8191275d46d30c0907');assert.equal(await git(['status','--porcelain']),'');
 const accepted=await read(DIR+'/source/qualification.json'),sourceAudit=await read(DIR+'/source/image-audit.json');
 const [recoveryRaw,afterRaw,metadataRaw]=await Promise.all([readFile('/workspace/recovery49/execution.json'),readFile(DIR+'/source/production-after.json'),readFile(DIR+'/source/oci-metadata.json')]);
 const regenerated=await qualify({recoveryRaw,afterRaw,metadataRaw,now:Date.parse(accepted.value.at)});
 assert.deepEqual(regenerated.acceptance,accepted.value);assert.deepEqual(regenerated.auditBytes,sourceAudit.bytes);
 assert.equal(accepted.value.format,'recovered-source-qualification/v1');assert.equal(sourceAudit.value.fullLayerAudit,false);
 const source=accepted.value.descriptor;assert.equal(source.sha,SOURCE);
 const ci=await read(inputs.ci);assert.equal(ci.value.headSha,TARGET);assert.equal(ci.value.status,'completed');assert.equal(ci.value.conclusion,'success');assert.equal(ci.value.url,inputs.ciUrl);
 assert.ok(ci.value.jobs.some(j=>j.name==='publish (lingxiloop-server, server, server/docker/lingxiloop-server.Dockerfile, .)'&&j.conclusion==='success'));
 for(const name of ['checks (server)','checks (deploy-contract)','integration'])assert.equal(ci.value.jobs.find(j=>j.name===name)?.conclusion,'success');
 for(const name of ['deploy','update-manifests','rollout'])assert.equal(ci.value.jobs.find(j=>j.name===name)?.conclusion,'skipped');
 const targetAudit=await read(inputs.targetAudit),a=targetAudit.value;
 assert.equal(hash(targetAudit.bytes),'6160cd5c7d4ce2ca859c93de7ecf524288f076efdb4031539462a33510f0991d');
 assert.equal(a.passed,true);assert.equal(a.repository,'ghcr.io/lingxi-org/lingxiloop-server');assert.equal(a.sourceCommit,TARGET);assert.equal(a.layerCount,22);assert.equal(a.layers.length,22);
 assert.equal(a.scope,'full linux/amd64 layers, streaming digest/diff-ID verification and merged rootfs inventory; no layer or file bodies persisted');
 assert.ok(a.packageComparisons?.length===2&&a.packageComparisons.every(p=>p.matches===true&&p.actualFiles===p.expectedFiles&&p.mismatchedPaths.length===0));
 const image={indexDigest:a.indexDigest,configDigest:a.configDigest,manifestDigest:a.linuxAmd64ManifestDigest,diffIds:a.layers.map(l=>l.diffId),auditSha256:hash(targetAudit.bytes)};
 const target={...await releaseDescriptor(TARGET,source),image};assertSameSchema(source,target);
 const stacks=[];
 for(const original of accepted.value.stacks){
  const row={...original,target:original.source},stack=row.stack;
  if(stack!=='lingxiloop-core-state'){
   assert.equal(row.source.commit,'4a5513d5c8805deaeb7771f522b0426dafbfe7e2');
   row.target={commit:FINAL,branch:BRANCH,sha256:hash(await git(['show',`${FINAL}:deploy/komodo/${stack}/compose.yml`])),autoPull:false,extraArgs:['--no-deps','--pull','never']};
   row.preparation={commit:PREP,sha256:hash(await git(['show',`${PREP}:deploy/komodo/${stack}/compose.yml`]))};
  }
  stacks.push(row);
 }
 assert.equal((await git(['rev-parse',PREP+'^'])).trim(),'4a5513d5c8805deaeb7771f522b0426dafbfe7e2');assert.equal((await git(['rev-parse',FINAL+'^'])).trim(),PREP);
 for(const ref of [PREP,FINAL]){const msg=await git(['show','-s','--format=%B',ref]);assert.ok(msg.includes('[skip ci]')&&msg.includes('[skip deploy]'));}
 const plan=sealHostPlan({format:'same-schema-host-release/v1',createdAt:new Date().toISOString(),source,target,sourceAcceptanceSha256:hash(accepted.bytes),qualification:{commit:TARGET,conclusion:'success',ciUrl:inputs.ciUrl},stacks});
 await validateHostPlan(plan,{acceptance:accepted.bytes,sourceAudit:sourceAudit.bytes,targetAudit:targetAudit.bytes});
 return {plan,targetAuditBytes:targetAudit.bytes,provenance:{sourceAcceptanceSha256:hash(accepted.bytes),targetAuditSha256:hash(targetAudit.bytes),ciSha256:hash(ci.bytes)}};
}
async function main(){assert.equal(process.argv.length,3);assert.ok(isAbsolute(process.argv[2]));const {plan,targetAuditBytes,provenance}=await makePlan(JSON.parse(await readFile(process.argv[2])));await mkdir(DIR+'/image-audit',{recursive:true,mode:0o700});await writeFile(DIR+'/image-audit/receipt.json',targetAuditBytes,{flag:'wx',mode:0o600});await writeFile(DIR+'/plan.json',JSON.stringify(plan,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify({planHash:plan.planHash,source:plan.source.sha,target:plan.target.sha,product:49,native:13,expectedNativeReceipts:34,...provenance}));}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)main().catch(()=>{console.error('Plan not created: required actual qualification/CI/audit missing or inconsistent.');process.exitCode=1});
