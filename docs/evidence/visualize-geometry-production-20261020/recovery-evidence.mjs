// Offline binding of the actual accepted recovery, never an old 36+1 receipt.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {hash} from '/workspace/LingxiLoop-product49-host-release/scripts/host-release.mjs';
const DIR='/workspace/recovery49';
export const RECOVERY_ACCEPTANCE_HASH='7d3db54a8d348f69a20b282a521ab2e0f847eb79b67f8abcebfc361d5adc2ea5';
export async function readAcceptedRecovery(){
 const acceptanceRaw=await readFile(DIR+'/final-acceptance.json');
 assert.equal(hash(acceptanceRaw),RECOVERY_ACCEPTANCE_HASH,'Recovery acceptance bytes changed');
 const acceptance=JSON.parse(acceptanceRaw);
 assert.equal(acceptance.format,'interrupted-product49-recovery-acceptance/v1');assert.equal(acceptance.passed,true);assert.equal(acceptance.candidate,'cf4a299bcfb44d7e7ed74a250ea1404588a4e901');
 assert.equal(acceptance.recoveryNativeReceiptCount,12);assert.equal(acceptance.healthyContainerCount,4);assert.equal(acceptance.nativeSchema,13);assert.equal(acceptance.productSchema,49);assert.equal(acceptance.runtime,'3.5.8');
 assert.deepEqual(acceptance.inputs.map(i=>i.name).sort(),['resume.mjs','precheck.json','execution.json','public-health.json'].sort());
 const raw={};for(const i of acceptance.inputs){raw[i.name]=await readFile(DIR+'/'+i.name);assert.equal(hash(raw[i.name]),i.sha256,'Accepted recovery input changed');}
 const recovery=JSON.parse(raw['execution.json']),pub=JSON.parse(raw['public-health.json']);
 assert.equal(recovery.format,'product49-interrupted-release-continuation/v1');assert.equal(recovery.execute,true);assert.equal(recovery.complete,true);assert.equal(recovery.events.at(-1)?.phase,'complete');
 const terminal=recovery.events.filter(e=>e.phase==='komodo'&&e.status==='complete');assert.equal(terminal.length,12);assert.equal(new Set(terminal.map(e=>e.updateId)).size,12);
 assert.equal(pub.passed,true);assert.equal(pub.public.length,4);assert.ok(pub.public.every(r=>r.ok===true&&r.status===200));
 return {acceptanceRaw,acceptance,recoveryRaw:raw['execution.json'],recovery};
}
