import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual as equal} from 'node:util';
import {createTransport,parseMarker,validateStateReceipt} from '/workspace/LingxiLoop-maintenance-host-source/scripts/schema-upgrade-komodo.mjs';
const dir='/tmp/lingxi-358-production',bytes=await readFile(dir+'/online-direct-host-preparation.json'),prep=JSON.parse(bytes),plan=JSON.parse(await readFile(dir+'/maintenance-host-plan.json'));
const check=(v,m)=>{if(!v)throw Error(m)};
check(prep.complete===true&&prep.planHash===plan.planHash,'Preparation not complete');
const expected=prep.events.filter(e=>e.phase==='host-file'&&e.status==='verified'||e.phase==='komodo'&&e.status==='complete');
check(expected.length===9&&new Set(expected.map(e=>e.updateId)).size===9,'Unexpected operation inventory');
const t=createTransport({apiKey:process.env.KOMODO_API_KEY,apiSecret:process.env.KOMODO_API_SECRET});
const out={startedAt:new Date().toISOString(),preparationSha256:createHash('sha256').update(bytes).digest('hex'),planHash:plan.planHash,mode:'read-only-terminal-receipts',updates:[],verified:false};
for(const event of expected){
 const stack=await t.read('GetStack',{stack:event.stack}),u=await t.read('GetUpdate',{id:event.updateId});
 const operation=event.phase==='host-file'?'WriteStackContents':'RunStackService';
 check(u._id?.$oid===event.updateId&&u.operation===operation&&u.target?.type==='Stack'&&u.target.id===stack._id?.$oid&&u.status==='Complete'&&u.success===true,'Unexpected terminal receipt');
 const row={id:u._id.$oid,stack:event.stack,operation:u.operation,target:u.target,status:u.status,success:u.success,startTs:u.start_ts,endTs:u.end_ts,durationMs:u.end_ts-u.start_ts};
 if(operation==='RunStackService'){
  const core=event.stack==='lingxiloop-core-state',m=parseMarker(u,core?'STATE':'METADATA');
  if(core){
   validateStateReceipt(m);
   check(m.runtime===plan.source.runtime.runtime&&m.schema===12&&m.installedSchema===12&&m.product===46&&m.count===46&&m.protocol===plan.source.runtime.protocol&&m.schemaHash===plan.source.runtime.schemaHash&&equal(m.migrations,plan.source.migrations),'Source provenance differs');
   row.source={runtime:m.runtime,schema:m.schema,product:m.product,schemaHash:m.schemaHash};
  }else{
   for(const key of ['sha','runtime','schema','protocol','schemaHash','productVersion','integrity','tarball','migrations'])check(equal(m[key],plan.target[key]),'Exact metadata differs');
   row.metadata={sha:m.sha,runtime:m.runtime,schema:m.schema,productVersion:m.productVersion};
  }
 }
 out.updates.push(row);
}
out.verified=true;out.finishedAt=new Date().toISOString();
await writeFile(dir+'/online-direct-host-terminal-receipts.json',JSON.stringify(out,null,2)+'\n',{flag:'wx',mode:0o600});
console.log(JSON.stringify({verified:out.verified,count:out.updates.length,output:dir+'/online-direct-host-terminal-receipts.json'}));
