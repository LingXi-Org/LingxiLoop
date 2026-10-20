import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {sealHostPlan,validateHostPlan} from '/workspace/LingxiLoop-maintenance-host-source/scripts/host-release.mjs';
const dir='/tmp/lingxi-canvas-release-20261020',root='/workspace/LingxiLoop-maintenance-host-source',run=promisify(execFile);
const hash=b=>createHash('sha256').update(b).digest('hex'),read=async p=>({bytes:await readFile(p),value:JSON.parse(await readFile(p,'utf8'))});
const sourceAudit=await read('/tmp/lingxi-225-219-preparation/final-image-audit-result-d107/receipt.json');
const targetAudit=await read(dir+'/image-audit/receipt.json');
const acceptance=await read('/tmp/lingxi-358-production/production-host-final-acceptance.json');
const policy=(await read(dir+'/accepted-source-policy.json')).value;
const ci=(await read(dir+'/publish-ci.json')).value;
assert.equal(ci.headSha,'9a5cfda82ad105d666bf0452df1d615daf6c6a28');assert.equal(ci.conclusion,'success');assert.equal(ci.status,'completed');
assert.ok(ci.jobs.some(j=>j.name.startsWith('publish (')&&j.conclusion==='success'));
assert.ok(['deploy','update-manifests','rollout'].every(name=>ci.jobs.find(j=>j.name===name)?.conclusion==='skipped'));
const old=(await read('/tmp/lingxi-358-production/maintenance-host-plan.json')).value.target;
const {imageDigest,...formal}=old;
const image=a=>({indexDigest:a.value.indexDigest,configDigest:a.value.configDigest,manifestDigest:a.value.linuxAmd64ManifestDigest,diffIds:a.value.layers.map(l=>l.diffId),auditSha256:hash(a.bytes)});
const source={...formal,image:image(sourceAudit)},target={...formal,sha:ci.headSha,image:image(targetAudit)};
const composeHash=async(commit,stack)=>hash((await run('git',['show',`${commit}:deploy/komodo/${stack}/compose.yml`],{cwd:root,encoding:'utf8'})).stdout);
const stacks=[];
for(const stack of ['lingxiloop-app-a','lingxiloop-app-b','lingxiloop-core-state']){
 const actual=policy.stacks.find(s=>s.stack===stack);assert.ok(actual&&actual.filesOnHost&&actual.reclone===false);
 assert.equal(actual.commit,'f56db73dabbaec1e92a421bbad76c239ed8d1ae2');assert.equal(actual.branch,'release/production-358-20261020');
 const accepted={commit:actual.commit,branch:actual.branch,sha256:await composeHash(actual.commit,stack),autoPull:actual.autoPull,extraArgs:actual.extraArgs};
 assert.equal(accepted.sha256,actual.cacheComposeSha256);
 const row={stack,server:stack==='lingxiloop-app-b'?'shanghai-b':'shanghai-a',source:accepted,target:accepted};
 if(stack!=='lingxiloop-core-state'){
  row.target={commit:'f70f6d46b39d65ad3c9aad2284db9c85a0cf3600',branch:'release/canvas-production-20261020',sha256:await composeHash('f70f6d46b39d65ad3c9aad2284db9c85a0cf3600',stack),autoPull:false,extraArgs:['--no-deps','--pull','never']};
  row.preparation={commit:'fe5ce1f468989d7604cf92fc7a7742b9ba9eaab0',sha256:await composeHash('fe5ce1f468989d7604cf92fc7a7742b9ba9eaab0',stack)};
 }
 stacks.push(row);
}
const plan=sealHostPlan({format:'same-schema-host-release/v1',createdAt:new Date().toISOString(),source,target,sourceAcceptanceSha256:hash(acceptance.bytes),qualification:{commit:ci.headSha,conclusion:'success',ciUrl:'https://github.com/LingXi-Org/LingxiLoop/actions/runs/39443966923'},stacks});
await validateHostPlan(plan,{acceptance:acceptance.bytes,sourceAudit:sourceAudit.bytes,targetAudit:targetAudit.bytes});
await writeFile(dir+'/plan.json',JSON.stringify(plan,null,2)+'\n',{flag:'wx',mode:0o600});
console.log(JSON.stringify({planHash:plan.planHash,source:source.sha,target:target.sha,schema:target.schema,productVersion:target.productVersion}));
