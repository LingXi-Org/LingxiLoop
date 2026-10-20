import {readFile,writeFile} from 'node:fs/promises';
import {createTransport} from '/workspace/LingxiLoop-integration-215-216-219/scripts/schema-upgrade-komodo.mjs';
const dir='/tmp/lingxi-358-production',files=['source-service-recovery.json','source-service-recovery-continuation.json','source-state-recovery-retry1.json'];
const data=await Promise.all(files.map(async f=>JSON.parse(await readFile(dir+'/'+f,'utf8'))));
const ids=[...new Set(data.flatMap(d=>d.events.map(e=>e.updateId)).filter(x=>/^[a-f0-9]{24}$/.test(x??'')))];
const expectedFailed=new Set(['6ad76383e06d5e1f79836a3a','6ad76925e06d5e1f79836b60']);
const t=createTransport({apiKey:process.env.KOMODO_API_KEY,apiSecret:process.env.KOMODO_API_SECRET}),out={at:new Date().toISOString(),updates:[],verified:false};
for(const id of ids){const u=await t.read('GetUpdate',{id});out.updates.push({id:u._id?.$oid,operation:u.operation,target:u.target,status:u.status,success:u.success,startTs:u.start_ts,endTs:u.end_ts,expectedFailed:expectedFailed.has(id)});if(u._id?.$oid!==id)throw Error('Update identity mismatch');}
out.verified=out.updates.every(u=>u.status==='Complete'&&u.success===!u.expectedFailed)&&out.updates.filter(u=>u.operation==='StartContainer'&&u.success).length===4;
await writeFile(dir+'/source-recovery-terminal-receipts.json',JSON.stringify(out,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify({verified:out.verified,count:out.updates.length,starts:out.updates.filter(u=>u.operation==='StartContainer'&&u.success).length}));if(!out.verified)process.exitCode=1;
