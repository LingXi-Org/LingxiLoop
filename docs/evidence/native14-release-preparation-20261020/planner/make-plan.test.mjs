import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {
  assertInputs, assertCi, assertFullAudit, assertAcceptedInputHashes,
  assertLineageRecord, readSourceEvidence, readFormalRelease, buildFreshBackup, makePlan,
  SOURCE, SOURCE_COMPOSE, SOURCE_ACCEPTANCE_SHA, SOURCE_PRODUCTION_SHA,
  SOURCE_AUDIT_SHA, SOURCE_FILES, FORMAL_TAR_SHA, DRIVER_ROOT,
} from './make-plan.mjs';
import {assertHostComposeChange} from '/workspace/LingxiLoop-native14-host-maintenance/scripts/host-release-compose.mjs';

const run=promisify(execFile),target='a'.repeat(40),prep='b'.repeat(40),final='c'.repeat(40);
const ciUrl='https://github.com/LingXi-Org/LingxiLoop/actions/runs/123456789';
const required=['checks (server)','checks (deploy-contract)','integration',
  'publish (lingxiloop-server, server, server/docker/lingxiloop-server.Dockerfile, .)'];
const ci=()=>({headSha:target,status:'completed',conclusion:'success',url:ciUrl,
  jobs:[...required.map(name=>({name,status:'completed',conclusion:'success'})),
    ...['deploy','update-manifests','rollout'].map(name=>({name,status:'completed',conclusion:'skipped'}))]});
const inputs=()=>({
  format:'native14-offline-plan-inputs/v1',targetCommit:target,
  sourceAcceptance:{path:'/workspace/geometry-release/final-acceptance.json',sha256:SOURCE_ACCEPTANCE_SHA},
  sourceProduction:{path:'/workspace/geometry-release/production-after.json',sha256:SOURCE_PRODUCTION_SHA},
  sourceAudit:{path:'/workspace/geometry-image-qualification/image-audit/receipt.json',sha256:SOURCE_AUDIT_SHA},
  targetAudit:{path:'/unused/synthetic-audit.json',sha256:'d'.repeat(64)},
  publishCi:{path:'/unused/synthetic-ci.json',sha256:'e'.repeat(64)},publishCiUrl:ciUrl,
  preparationComposeCommit:prep,targetComposeCommit:final,branch:'release/native14-test',
  backupAttempt:'native14-test-only',
});
test('all unknown target inputs are mandatory; no implicit target or operation',async()=>{
  assert.doesNotThrow(()=>assertInputs(inputs()));
  for(const key of ['targetCommit','targetAudit','publishCi','publishCiUrl',
    'preparationComposeCommit','targetComposeCommit','branch','backupAttempt']){
    const x=inputs();x[key]=null;assert.throws(()=>assertInputs(x));
  }
  await assert.rejects(makePlan({...inputs(),targetCommit:null}));
});
test('exact successful CI rejects wrong SHA, missing/duplicate jobs and rollout',()=>{
  assert.doesNotThrow(()=>assertCi(ci(),target,ciUrl));
  for(const mutate of [
    x=>{x.headSha=SOURCE},x=>{x.status='in_progress'},
    x=>{x.jobs[0].conclusion='skipped'},x=>{x.jobs.pop()},
    x=>{x.jobs.push({...x.jobs[0]})},
    x=>{x.jobs.find(j=>j.name==='rollout').conclusion='success'},
  ]){const x=ci();mutate(x);assert.throws(()=>assertCi(x,target,ciUrl));}
});
test('full source audit passes; partial/layer/package/formal reference mutations fail',async()=>{
  const a=JSON.parse(await readFile('/workspace/geometry-image-qualification/image-audit/receipt.json'));
  const tar=a.referenceSha256.formalRuntimeTar;
  assert.doesNotThrow(()=>assertFullAudit(a,SOURCE,tar));
  for(const mutate of [
    x=>{x.scope='metadata only'},x=>{x.layers.pop()},x=>{x.layers[0].diffId='missing'},
    x=>{x.packageComparisons[0].matches=false},
    x=>{x.packageComparisons[0].mismatchedPaths.push('synthetic')},
    x=>{x.referenceSha256.formalRuntimeTar=FORMAL_TAR_SHA},
  ]){const x=structuredClone(a);mutate(x);assert.throws(()=>assertFullAudit(x,SOURCE,tar));}
});
test('every acceptance input is bound; duplicate/omitted/path-traversal input rejected',async()=>{
  const accepted=JSON.parse(await readFile('/workspace/geometry-release/final-acceptance.json'));
  const raw=Object.fromEntries(await Promise.all(SOURCE_FILES.map(async n=>[n,await readFile('/workspace/geometry-release/'+n)])));
  assert.doesNotThrow(()=>assertAcceptedInputHashes(accepted,raw));
  const changed={...raw,'terminal-receipts.json':Buffer.from('{}')};
  assert.throws(()=>assertAcceptedInputHashes(accepted,changed));
  for(const mutate of [
    x=>x.inputs.pop(),x=>x.inputs.push(x.inputs[0]),
    x=>{x.inputs[0].name='../plan.json'},
  ]){const x=structuredClone(accepted);mutate(x);assert.throws(()=>assertAcceptedInputHashes(x,raw));}
});
test('actual accepted source is replayed with four healthy containers and all six hashes',async()=>{
  const result=await readSourceEvidence(inputs());
  assert.equal(result.source.sha,SOURCE);
  assert.equal(result.provenance.acceptedInputs.length,6);
  assert.equal(result.provenance.healthyContainers,4);
  assert.equal(result.provenance.nativeTerminalReceipts,34);
});
test('actual formal tar and installed public resources match 3.6.0/native14/protocol11',async()=>{
  const f=await readFormalRelease();
  assert.equal(f.release.runtime,'3.6.0');assert.equal(f.release.schema,14);
  assert.equal(f.release.protocol,11);assert.equal(f.provenance.tarSha256,FORMAL_TAR_SHA);
});
test('public backup plans bind nonce to unique attempt and DB without executing',async()=>{
  const a=await buildFreshBackup('offline-test'),b=await buildFreshBackup('offline-test');
  assert.equal(a.profile,'native13-product49');assert.equal(a.source.sha,SOURCE);
  assert.equal(a.source.runtime.runtime,'3.5.8');assert.equal(a.source.runtime.schema,13);
  assert.equal(a.source.productVersion,49);assert.equal(a.migrationRehearsal,'not-performed');
  assert.notEqual(a.nonce,b.nonce);assert.notEqual(a.backupDir,b.backupDir);
  assert.notEqual(a.isolatedDatabase,b.isolatedDatabase);
  assert.equal(a.attempt,'offline-test-'+a.nonce);
  assert.ok(a.backupDir.endsWith('/'+a.attempt));
  assert.ok(a.isolatedDatabase.endsWith('_'+a.nonce));
  await assert.rejects(buildFreshBackup('x'.repeat(64)));
});
test('Compose refs require one exact parent, two app-only changes and suppression flags',()=>{
  const paths=['lingxiloop-app-a','lingxiloop-app-b'].map(n=>'deploy/komodo/'+n+'/compose.yml');
  const r={commit:prep,parents:[SOURCE_COMPOSE],paths,message:'prepare [skip ci] [skip deploy]'};
  assert.doesNotThrow(()=>assertLineageRecord(r,prep,SOURCE_COMPOSE));
  for(const mutate of [
    x=>x.parents.push(final),x=>{x.parents=[target]},x=>x.paths.push('package.json'),
    x=>{x.message='[skip deploy]'},x=>{x.paths.pop()},
  ]){const x=structuredClone(r);mutate(x);assert.throws(()=>assertLineageRecord(x,prep,SOURCE_COMPOSE));}
});
test('actual Compose parser permits only runtime tag/pull changes and rejects policy mutation',async()=>{
  const text=(await run('git',['show',SOURCE_COMPOSE+':deploy/komodo/lingxiloop-app-a/compose.yml'],{cwd:DRIVER_ROOT})).stdout;
  const prepared=text.replaceAll(SOURCE,target).replaceAll('pull_policy: never','pull_policy: always');
  assert.equal(assertHostComposeChange(text,prepared,SOURCE,target,'always'),true);
  assert.throws(()=>assertHostComposeChange(text,prepared+'\nname: synthetic-policy-change\n',SOURCE,target,'always'));
});
test('template invocation refuses unknown inputs without making an output directory',async()=>{
  const dir='/workspace/native14-production-release/planner/must-not-exist';
  await assert.rejects(access(dir));
  const result=await run(process.execPath,[new URL('./make-plan.mjs',import.meta.url).pathname,
    '--input',new URL('./plan-input.template.json',import.meta.url).pathname,'--output-dir',dir])
    .then(()=>({ok:true}),e=>({code:e.code,stderr:e.stderr}));
  assert.equal(result.code,1);assert.match(result.stderr,/Plan not created/);
  await assert.rejects(access(dir));
});
