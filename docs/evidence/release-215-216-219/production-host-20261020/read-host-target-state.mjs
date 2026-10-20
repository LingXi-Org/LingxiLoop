import {readFile,writeFile} from 'node:fs/promises';
import {createOperations,createTransport} from '/workspace/LingxiLoop-maintenance-host-source/scripts/schema-upgrade-komodo.mjs';
const dir='/tmp/lingxi-358-production';
const plan=JSON.parse(await readFile(dir+'/maintenance-host-plan.json','utf8'));

const output=dir+'/host-target-state-postflight.json';
const record={startedAt:new Date().toISOString(),mode:'read-only-state-with-owned-oneoff',events:[],verified:false};
await writeFile(output,JSON.stringify(record)+'\n',{flag:'wx',mode:0o600});
const onProgress=async event=>{record.events.push({...event,observedAt:new Date().toISOString()});await writeFile(output,JSON.stringify(record,null,2)+'\n',{mode:0o600});};
try{
 const t=createTransport({apiKey:process.env.KOMODO_API_KEY,apiSecret:process.env.KOMODO_API_SECRET,onProgress});
 const ops=createOperations({plan,transport:t});
 await ops.assertIdle();
 const core=await t.read('GetStackActionState',{stack:'lingxiloop-core-state'});
 if(Object.values(core).some(x=>x===true))throw Error('Core stack busy');
 record.containers=await ops.inspect();
 record.state=await ops.state();
 if(record.state.runtime!=='3.5.8'||record.state.schema!==13||record.state.installedSchema!==13||record.state.product!==48)throw Error('Unexpected source state');
 await ops.assertIdle();record.verified=true;
}catch(error){record.error={class:'TARGET_POSTFLIGHT_FAILED',uncertain:error?.uncertain===true};process.exitCode=1;}
record.finishedAt=new Date().toISOString();await writeFile(output,JSON.stringify(record,null,2)+'\n',{mode:0o600});
console.log(JSON.stringify({output,verified:record.verified,state:record.state&&{runtime:record.state.runtime,schema:record.state.schema,product:record.state.product,liveWork:record.state.liveWork,liveSession:record.state.liveSession,liveAttempts:record.state.liveAttempts,queued:record.state.queued,pendingCapture:record.state.pendingCapture,otherClients:record.state.otherClients},error:record.error}));
