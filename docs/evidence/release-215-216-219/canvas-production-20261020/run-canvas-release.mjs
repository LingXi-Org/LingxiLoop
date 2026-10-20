import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {validateHostPlan,runHostRelease} from '/workspace/LingxiLoop-maintenance-host-source/scripts/host-release.mjs';
import {createHostReleaseOperations} from '/workspace/LingxiLoop-maintenance-host-source/scripts/host-release-komodo.mjs';
import {createTransport} from '/workspace/LingxiLoop-maintenance-host-source/scripts/schema-upgrade-komodo.mjs';
import {attachNativeProbe} from './probe-before-drain.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
async function main(){
  const args=process.argv.slice(2);
  assert.equal(args.length,5);assert.ok(args.every(isAbsolute));
  const [planPath,acceptancePath,sourceAuditPath,targetAuditPath,output]=args;
  const plan=JSON.parse(await readFile(planPath,'utf8'));
  assert.equal(plan.source.sha,'d1075e35e16721979b484c2d9e33eeb56468ce9d');
  assert.equal(plan.target.sha,'9a5cfda82ad105d666bf0452df1d615daf6c6a28');
  const files=await validateHostPlan(plan,{acceptance:await readFile(acceptancePath),sourceAudit:await readFile(sourceAuditPath),targetAudit:await readFile(targetAuditPath)});
  const probeCode=await readFile(new URL('./native-image-probe.mjs',import.meta.url),'utf8');
  assert.equal(hash(probeCode),'4598e58432b283a54bb916d622c19f8c34d7c317e808d4b03b1f94d482b16e43');
  const abort=new AbortController(),stop=()=>abort.abort();
  const out={planHash:plan.planHash,mode:'same-schema-release-with-public-native-probes',startedAt:new Date().toISOString(),complete:false,probeCodeSha256:hash(probeCode),events:[]};
  await writeFile(output,JSON.stringify(out)+'\n',{flag:'wx',mode:0o600});
  const onProgress=async e=>{out.events.push({...e,observedAt:new Date().toISOString()});if(e.phase==='complete')out.complete=true;await writeFile(output,JSON.stringify(out,null,2)+'\n',{mode:0o600})};
  process.once('SIGINT',stop);process.once('SIGTERM',stop);
  try {
    const transport=createTransport({apiKey:process.env.KOMODO_API_KEY,apiSecret:process.env.KOMODO_API_SECRET,signal:abort.signal,onProgress});
    const ops=createHostReleaseOperations({plan,files,signal:abort.signal,onProgress,transport});
    attachNativeProbe({ops,transport,source:plan.source.sha,probeCode,onProgress});
    await runHostRelease({plan,ops,onProgress});
    console.log(JSON.stringify({complete:true,planHash:plan.planHash}));
  }finally{process.off('SIGINT',stop);process.off('SIGTERM',stop)}
}
main().catch(()=>{console.error('Canvas release stopped. Inspect the private receipt before any further action.');process.exitCode=1});
