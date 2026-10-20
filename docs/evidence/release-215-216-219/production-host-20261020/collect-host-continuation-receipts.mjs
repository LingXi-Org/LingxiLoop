import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createTransport} from '/workspace/LingxiLoop-maintenance-host-source/scripts/schema-upgrade-komodo.mjs';
const dir='/tmp/lingxi-358-production',get=async n=>JSON.parse(await readFile(dir+'/'+n));
const [plan,execution,target,continuation]=await Promise.all(['maintenance-host-plan.json','maintenance-host-execution.json','host-target-state-postflight.json','maintenance-host-continuation-v2.json'].map(get));
const check=(v,m)=>{if(!v)throw Error(m)};
check(execution.planHash===plan.planHash&&execution.events.at(-1)?.recovery==='fix-forward'&&continuation.complete===true&&continuation.events.at(-1)?.phase==='complete'&&continuation.continuationOf?.sha256===createHash('sha256').update(await readFile(dir+'/maintenance-host-execution.json')).digest('hex')&&target.verified===true,'Incomplete execution or postflight');
const expected=new Map(),opNames={RunStackService:'RunStackService',StopStack:'StopStackService',DeployStack:'DeployStackService'};
for(const e of [...execution.events,...continuation.events,...target.events]){
 if(e.phase==='komodo'&&(e.status==='complete'||e.status==='failed')){
  check(opNames[e.operation]&&/^[a-f0-9]{24}$/.test(e.updateId),'Unexpected action');
  expected.set(e.updateId,{stack:e.stack,operation:opNames[e.operation],success:e.status==='complete'});
 }
 if(e.phase==='backup'&&e.status==='verified'&&e.backup){
  check(e.backup.commandHash===plan.backup.commandHash&&e.backup.attempt===plan.backup.attempt,'Backup binding changed');
  expected.set(e.backup.updateId,{stack:'lingxiloop-core-state',operation:'RunStackService',success:true});
 }
}
check([...expected.values()].filter(x=>x.operation==='StopStackService').length===4&&[...expected.values()].filter(x=>x.operation==='DeployStackService'&&x.success).length===4,'Missing drain or deploy receipts');
check([...expected].filter(([id,e])=>!e.success).length===1&&expected.get('6ad778a1e06d5e1f79836ea6')?.success===false,'Unexpected failure inventory');
const t=createTransport({apiKey:process.env.KOMODO_API_KEY,apiSecret:process.env.KOMODO_API_SECRET}),stackIds=new Map();
for(const name of plan.hostSource.stacks.map(x=>x.stack))stackIds.set(name,(await t.read('GetStack',{stack:name}))._id?.$oid);
const out={startedAt:new Date().toISOString(),planHash:plan.planHash,executionSha256:createHash('sha256').update(await readFile(dir+'/maintenance-host-execution.json')).digest('hex'),continuationSha256:createHash('sha256').update(await readFile(dir+'/maintenance-host-continuation-v2.json')).digest('hex'),updates:[],verified:false};
for(const [id,e] of expected){
 const u=await t.read('GetUpdate',{id});
 check(u._id?.$oid===id&&u.operation===e.operation&&u.target?.type==='Stack'&&u.target.id===stackIds.get(e.stack)&&u.status==='Complete'&&u.success===e.success,'Terminal action does not match');
 out.updates.push({id,stack:e.stack,operation:u.operation,target:u.target,status:u.status,success:u.success,expectedFailure:!e.success,startTs:u.start_ts,endTs:u.end_ts,durationMs:u.end_ts-u.start_ts});
}
out.verified=true;out.finishedAt=new Date().toISOString();
await writeFile(dir+'/host-continuation-komodo-terminal-receipts.json',JSON.stringify(out,null,2)+'\n',{flag:'wx',mode:0o600});
console.log(JSON.stringify({verified:out.verified,count:out.updates.length}));
