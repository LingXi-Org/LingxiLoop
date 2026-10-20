// Local parser contracts only; these are synthetic events, never production receipts.
import test from 'node:test';import assert from 'node:assert/strict';
import {recipe,scanNativeEvents} from './collect-terminal-receipts.mjs';
import {assertInputs} from './inputs.mjs';import {readFile} from 'node:fs/promises';
const id='0123456789abcdef01234567',stack='lingxiloop-app-a';
test('placeholder target inputs fail closed',async()=>{const input=JSON.parse(await readFile(new URL('./inputs.template.json',import.meta.url)));assert.throws(()=>assertInputs(input));});
test('static native recipe is8+35 with6 source/13 target maintenance states',()=>{assert.equal(recipe('prep').length,8);const r=recipe('release');assert.equal(r.length,35);assert.equal(r.filter(x=>x.kind==='state'&&x.descriptor==='source').length,6);assert.equal(r.filter(x=>x.kind==='state'&&x.descriptor==='target').length,13);assert.equal(r.filter(x=>x.kind==='backup').length,1);assert.equal(r.filter(x=>x.kind==='migration').length,1);});
test('unknown or outstanding native submission never passes',()=>{assert.throws(()=>scanNativeEvents([{phase:'komodo',status:'submitting',operation:'RunStackService',stack},{phase:'komodo',status:'pending',operation:'RunStackService',stack,updateId:id}]));assert.throws(()=>scanNativeEvents([{phase:'komodo',status:'uncertain',operation:'RunStackService',stack,updateId:id}]));});
test('backup ID must match its independent pending stream',()=>{const events=[{phase:'backup-native',status:'pending'},{phase:'backup-native',status:'pending',updateId:id},{phase:'backup',status:'verified',receipt:{updateId:'fedcba987654321001234567'}}];assert.throws(()=>scanNativeEvents(events,{allowBackup:true}));events.at(-1).receipt.updateId=id;const rows=scanNativeEvents(events,{allowBackup:true});assert.equal(rows.length,1);assert.equal(rows[0].id,id);assert.equal(rows[0].kind,'backup');});
test('pre-seed pending boundary is explicit; final loader shape remains strict',async()=>{
 const {assertPreSeedInputs}=await import('./inputs.mjs');
 const input=JSON.parse(await readFile(new URL('./inputs.template.json',import.meta.url)));
 // In-memory shape fixture only: no plan/audit/acceptance or real input file is created.
 input.targetCommit='1'.repeat(40);input.planSha256='2'.repeat(64);input.publishCiUrl='https://github.com/LingXi-Org/LingxiLoop/actions/runs/1';
 for(const k of ['sourceAcceptance','sourceProduction','sourceAudit','targetAudit','publishCi'])input[k].sha256='3'.repeat(64);
 assert.doesNotThrow(()=>assertPreSeedInputs(input));assert.throws(()=>assertInputs(input));
 input.canonicalSeedPrecheck.sha256='4'.repeat(64);assert.throws(()=>assertPreSeedInputs(input));assert.doesNotThrow(()=>assertInputs(input));
 input.canonicalSeedPrecheck.path='/workspace/native14-production-release/seed-precheck.json';assert.throws(()=>assertPreSeedInputs(input));assert.throws(()=>assertInputs(input));
});
