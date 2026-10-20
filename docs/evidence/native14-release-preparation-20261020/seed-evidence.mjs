// Reuse the seed owner's pure contract; the canonical query is not rerun here.
import assert from 'node:assert/strict';
import {validateSeedReceipt,parseSeedUpdate,hash,FORMAT} from './seed/seed-contract.mjs';
const fields=['readOnly','fullVisibility','canonicalSha256','counts','equal','native'];
export const seedParsed=receipt=>Object.fromEntries(fields.map(k=>[k,receipt[k]]));
export function assertSeedProof({plan,planRaw,execution,seedRaw,input,sourceProductionRaw,coreStackId}){
 assert.equal(input.canonicalSeedPrecheck.contract,FORMAT);assert.equal(hash(seedRaw),input.canonicalSeedPrecheck.sha256);const receipt=JSON.parse(seedRaw);
 validateSeedReceipt({plan,planRaw,receipt,executionStartedAt:execution.startedAt,coreStackId});assert.equal(receipt.sourceProductionSha256,hash(sourceProductionRaw));
 assert.ok(!receipt.events.some(e=>['failed','uncertain'].includes(e.status)),'Seed unknown/failure path cannot qualify');
 const events=receipt.events.filter(e=>e.phase==='komodo');assert.deepEqual(events.map(e=>e.status),['submitting','pending','complete']);assert.ok(events.every(e=>e.operation==='RunStackService'&&e.stack==='lingxiloop-core-state'));for(const e of events.slice(1))assert.equal(e.updateId,receipt.native.id);
 return receipt;
}
export function confirmSeedUpdate(update,receipt,coreStackId){const parsed=parseSeedUpdate(update,{expectedId:receipt.native.id,coreStackId});assert.deepEqual(parsed,seedParsed(receipt));return parsed;}
