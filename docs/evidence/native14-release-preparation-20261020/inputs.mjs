// Offline evidence loading. No missing target value is inferred from a branch.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {isAbsolute} from 'node:path';
import {execFileSync} from 'node:child_process';
import {hash,validateHostPlanShape,NATIVE_SCHEMA_FORMAT} from '/workspace/LingxiLoop-native14-host-maintenance/scripts/host-release.mjs';
import {validateMemoryBackupPlan} from '/workspace/LingxiLoop-native14-host-maintenance/scripts/verify-memory-backup.mjs';
export const DIR='/workspace/native14-production-release',ROOT='/workspace/LingxiLoop-native14-host-maintenance',HEAD='19422466f8463a3a1099c6fbfdd3b92d0228e1b5',SOURCE='7fe5b16e08dbe6634feb701d64e26c28475b917e';
function assertCommonInputs(input){
 assert.equal(input.format,'native14-production-inputs/v1');assert.match(input.targetCommit??'',/^[a-f0-9]{40}$/);assert.notEqual(input.targetCommit,SOURCE);assert.match(input.planSha256??'',/^[a-f0-9]{64}$/);assert.match(input.publishCiUrl??'',/^https:\/\/github\.com\/LingXi-Org\/LingxiLoop\/actions\/runs\/\d+$/);
 for(const k of ['sourceAcceptance','sourceProduction','sourceAudit','targetAudit','publishCi']){assert.ok(isAbsolute(input[k]?.path??''));assert.match(input[k]?.sha256??'',/^[a-f0-9]{64}$/);}
}
function assertSeedPath(input){assert.equal(input.canonicalSeedPrecheck?.path,DIR+'/seed/receipt.json');assert.equal(input.canonicalSeedPrecheck?.contract,'native14-seed-precheck-receipt/v1');}
export function assertInputs(input){assertCommonInputs(input);assertSeedPath(input);assert.match(input.canonicalSeedPrecheck.sha256??'',/^[a-f0-9]{64}$/);}
export function assertPreSeedInputs(input){assertCommonInputs(input);assertSeedPath(input);assert.equal(input.canonicalSeedPrecheck.sha256,null,'Pre-seed input must be explicitly pending, never a fake success hash');}
async function loadInputsForStage(stage){
 const raw=await readFile(DIR+'/inputs.json'),input=JSON.parse(raw);(stage==='before-seed'?assertPreSeedInputs:assertInputs)(input);
 assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim(),HEAD);assert.equal(execFileSync('git',['status','--porcelain'],{cwd:ROOT,encoding:'utf8'}),'');
 const planRaw=await readFile(DIR+'/plan.json');assert.equal(hash(planRaw),input.planSha256);const plan=JSON.parse(planRaw);validateHostPlanShape(plan);assert.equal(plan.format,NATIVE_SCHEMA_FORMAT);assert.equal(plan.source.sha,SOURCE);assert.equal(plan.target.sha,input.targetCommit);assert.equal(plan.qualification.ciUrl,input.publishCiUrl);await validateMemoryBackupPlan(plan.backup);
 const evidence={};for(const key of ['sourceAcceptance','sourceProduction','sourceAudit','targetAudit','publishCi',...(stage==='before-seed'?[]:['canonicalSeedPrecheck'])]){const bytes=await readFile(input[key].path);assert.equal(hash(bytes),input[key].sha256);evidence[key]=bytes;}
 assert.equal(hash(evidence.sourceAcceptance),plan.sourceAcceptanceSha256);
 const accepted=JSON.parse(evidence.sourceAcceptance),before=JSON.parse(evidence.sourceProduction),ci=JSON.parse(evidence.publishCi);
 assert.equal(accepted.passed,true);assert.equal(accepted.candidate,SOURCE);assert.ok(Object.keys(accepted.checks??{}).length&&Object.values(accepted.checks).every(x=>x===true));assert.equal(accepted.inputs?.find(i=>i.name==='production-after.json')?.sha256,hash(evidence.sourceProduction));assert.equal(before.verified,true);assert.equal(before.candidate,SOURCE);
 assert.equal(ci.headSha,input.targetCommit);assert.equal(ci.status,'completed');assert.equal(ci.conclusion,'success');assert.equal(ci.url,input.publishCiUrl);assert.ok(ci.jobs?.some(j=>j.name==='publish (lingxiloop-server, server, server/docker/lingxiloop-server.Dockerfile, .)'&&j.conclusion==='success'));
 for(const key of ['source','target']){const audit=JSON.parse(evidence[key+'Audit']),d=plan[key];assert.equal(audit.passed,true);assert.equal(audit.repository,'ghcr.io/lingxi-org/lingxiloop-server');assert.equal(audit.sourceCommit,d.sha);assert.equal(hash(evidence[key+'Audit']),d.image.auditSha256);assert.equal(audit.indexDigest,d.image.indexDigest);assert.equal(audit.configDigest,d.image.configDigest);assert.equal(audit.linuxAmd64ManifestDigest,d.image.manifestDigest);assert.deepEqual(audit.layers.map(l=>l.diffId),d.image.diffIds);assert.match(audit.scope,/full linux\/amd64 layers, streaming digest\/diff-ID verification/);}
 return {input,inputRaw:raw,plan,planRaw,evidence};
}

// Deliberately separate exports: production postflight callers cannot opt out of seed proof.
export const loadInputs=()=>loadInputsForStage('postflight');
export const loadPreSeedInputs=()=>loadInputsForStage('before-seed');
