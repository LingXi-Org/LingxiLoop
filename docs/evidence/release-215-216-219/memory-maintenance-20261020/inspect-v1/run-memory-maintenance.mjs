import assert from 'node:assert/strict';
import {executeAppMaintenance} from './native-app-maintenance.mjs';
import {guard} from './guard-accepted-target.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {isDeepStrictEqual as equal} from 'node:util';
import {validateHostPlan} from '/workspace/LingxiLoop-maintenance-host-source/scripts/host-release.mjs';
import {createHostReleaseOperations} from '/workspace/LingxiLoop-maintenance-host-source/scripts/host-release-komodo.mjs';
import {createTransport} from '/workspace/LingxiLoop-maintenance-host-source/scripts/schema-upgrade-komodo.mjs';
const dir='/tmp/lingxi-canvas-release-20261020',hash=b=>createHash('sha256').update(b).digest('hex'),get=async p=>JSON.parse(await readFile(p,'utf8'));
const mode=process.argv[2];assert.ok(['inspect','execute','status'].includes(mode));
const plan=await get(dir+'/plan.json');
const files=await validateHostPlan(plan,{acceptance:await readFile('/tmp/lingxi-358-production/production-host-final-acceptance.json'),sourceAudit:await readFile('/tmp/lingxi-225-219-preparation/final-image-audit-result-d107/receipt.json'),targetAudit:await readFile(dir+'/image-audit/receipt.json')});
const preparation=await get(dir+'/image-preparation.json');assert.equal(preparation.complete,true);assert.equal(preparation.planHash,plan.planHash);
const rawCode=await readFile('/tmp/issue216-existing-maintenance/draft.mjs','utf8');
const approved=await get(dir+'/memory-maintenance-approved.json');assert.equal(hash(rawCode),approved.codeSha256);assert.equal(approved.reviewed,true);
const schemaBytes=await readFile('/tmp/issue216-existing-maintenance/output.schema.json');assert.equal(hash(schemaBytes),approved.schemaSha256);
if(mode==='execute'){
 const inspected=await get(dir+'/memory-maintenance-inspect.json');assert.equal(inspected.verified,true);assert.equal(inspected.codeSha256,approved.codeSha256);assert.equal(inspected.mode,'inspect');assert.equal(inspected.final.operationsComplete,true);
}
const code=rawCode+'\nawait main('+JSON.stringify(mode)+');\n';
const accepted=await get(dir+'/final-acceptance.json');assert.equal(accepted.passed,true);assert.equal(accepted.candidate,plan.target.sha);
const out={startedAt:new Date().toISOString(),mode,source:plan.target.sha,codeSha256:hash(rawCode),events:[],verified:false},path=dir+'/memory-maintenance-'+mode+'.json';
await writeFile(path,JSON.stringify(out)+'\n',{flag:'wx',mode:0o600});
const record=async e=>{out.events.push({...e,at:new Date().toISOString()});await writeFile(path,JSON.stringify(out,null,2)+'\n',{mode:0o600})};
function parseRows(update){
 const prefix='ISSUE216_MAINTENANCE=';
 const lines=(update.logs??[]).flatMap(l=>typeof l.stdout==='string'?l.stdout.split(/\r?\n/):[]).filter(s=>s.startsWith(prefix));
 assert.ok(lines.length>0&&lines.length<=260&&Buffer.byteLength(lines.join('\n'))<=1024*1024);
 const rows=lines.map(l=>JSON.parse(l.slice(prefix.length)));
 // The frozen remote implementation only emits this fixed aggregate schema.
 const strings=new Set(approved.allowedValues),keys=new Set(approved.allowedKeys);
 function sanitize(v){if(v===null||typeof v==='boolean')return;if(typeof v==='number'){assert.ok(Number.isSafeInteger(v)&&v>=0);return}if(typeof v==='string'){assert.ok(strings.has(v));return}assert.ok(v&&typeof v==='object'&&!Array.isArray(v));for(const [k,x]of Object.entries(v)){assert.ok(keys.has(k));sanitize(x)}}
 for(const r of rows)sanitize(r);
 const checked=spawnSync('python3',['-c',"import json,sys,jsonschema\ntry:\n x=json.load(sys.stdin); v=jsonschema.Draft202012Validator(x['schema']); [v.validate(r) for r in x['rows']]\nexcept Exception:\n sys.exit(1)\n"],{input:JSON.stringify({schema:JSON.parse(schemaBytes),rows}),encoding:'utf8',timeout:10000,maxBuffer:4096});
 assert.equal(checked.status,0);
 return rows;
}
const terminal=u=>({id:u._id.$oid,target:u.target,operation:u.operation,status:u.status,success:u.success,startTs:u.start_ts,endTs:u.end_ts});
try{
 const t=createTransport({apiKey:process.env.KOMODO_API_KEY,apiSecret:process.env.KOMODO_API_SECRET,onProgress:record});
 const ops=createHostReleaseOperations({plan,files,transport:t,onProgress:record});
 const policyBefore=await guard({plan,transport:t,onProgress:record});await ops.verifyImages('target');const before=await ops.inspect();
 assert.ok(before.length===4&&before.every(c=>c.source===plan.target.sha&&c.running&&c.healthy&&!c.restarting&&c.restartCount===0));
 const first=await executeAppMaintenance({code,transport:t,onProgress:record,apiKey:process.env.KOMODO_API_KEY,apiSecret:process.env.KOMODO_API_SECRET});
 out.update=terminal(first);out.nativeTerminal=true;
 await writeFile(path,JSON.stringify(out,null,2)+'\n',{mode:0o600});
 const rows=parseRows(first),last=rows.at(-1);
 out.rows=rows;out.applicationOutcome=last.phase==='final'&&last.status==='complete'?'complete':last.phase==='stopped'?last.status:'unknown';
 out.confirmedMigrations=Math.max(0,...rows.map(r=>r.result?.migratedDistinct??r.migration?.migratedDistinct??0));
 const queueReceipts=rows.filter(r=>['reindex-progress','reindex-queue'].includes(r.phase));out.confirmedQueued=queueReceipts.length?Math.max(...queueReceipts.map(r=>r.counts.queued)):null;
 if(last.phase==='final')out.final=last;
 await writeFile(path,JSON.stringify(out,null,2)+'\n',{mode:0o600});
 out.terminalReadbackPending=true;
 await writeFile(path,JSON.stringify(out,null,2)+'\n',{mode:0o600});
 const update=await t.read('GetUpdate',{id:first._id.$oid});
 assert.deepEqual(terminal(update),terminal(first));assert.equal(update.status,'Complete');assert.equal(typeof update.success,'boolean');
 assert.deepEqual(parseRows(update),rows);out.terminalReadback=true;out.terminalReadbackPending=false;
 await writeFile(path,JSON.stringify(out,null,2)+'\n',{mode:0o600});
 if(update.success!==true||out.applicationOutcome!=='complete')throw Object.assign(Error('Application maintenance incomplete'),{uncertain:out.applicationOutcome==='uncertain'||out.applicationOutcome==='unknown'});
 assert.ok(rows.every(r=>r.complete===true||r.phase==='final'||['migration-progress','reindex-progress'].includes(r.phase)&&r.complete===false));
 const final=rows.at(-1);assert.equal(final.phase,'final');assert.equal(final.status,'complete');assert.equal(final.mode,mode);assert.equal(final.operationsComplete,true);assert.equal(rows.filter(r=>r.phase==='final').length,1);
 const after=await ops.inspect();assert.deepEqual(after,before);const policyAfter=await guard({plan,transport:t,onProgress:record});assert.deepEqual(policyAfter,policyBefore);
 out.originalContainersUnchanged=true;out.verified=true;
}catch(error){out.error='MEMORY_MAINTENANCE_NOT_VERIFIED';out.uncertain=error?.uncertain===true||out.terminalReadbackPending===true||['uncertain','unknown'].includes(out.applicationOutcome)||out.nativeTerminal===true&&!out.rows;out.noAutomaticRetry=true;process.exitCode=1}
out.finishedAt=new Date().toISOString();await writeFile(path,JSON.stringify(out,null,2)+'\n',{mode:0o600});
console.log(JSON.stringify({verified:out.verified,...(out.verified?{final:out.final,update:out.update}:{error:out.error,uncertain:out.uncertain,noAutomaticRetry:true})}));
