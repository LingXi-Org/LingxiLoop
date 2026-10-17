import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
const output=resolve(process.env.ACCEPTANCE_OUTPUT??resolve(import.meta.dirname,'../../.e2e/image-acceptance'))
assert.ok(output.startsWith('/workspace/'))
const docker=(...args)=>{const r=spawnSync('docker',args,{encoding:'utf8',maxBuffer:4*1024*1024});assert.equal(r.status,0,r.stderr.slice(-300));return r.stdout}
const latest=v=>JSON.parse(readFileSync(`${output}/${v}/process.jsonl`,'utf8').trim().split('\n').at(-1))
const summaries={at:new Date().toISOString(),scope:'Post-GC process memory, shallow heap totals and sampled allocation sites. Not dominator-retained sizes and not proof of a leak.',variants:{}}
for(const variant of ['baseline','candidate']) {
  const name=`lingxiloop-acceptance-${variant}`,before=latest(variant)
  let complete
  if(process.env.ACCEPTANCE_REUSE_PROFILE==='1') complete=readFileSync(`${output}/${variant}/process.jsonl`,'utf8').trim().split('\n').map(x=>JSON.parse(x)).findLast(row=>row.kind==='profile-complete')
  if(!complete) docker('kill','--signal=SIGUSR2',name)
  for(let i=0;i<120;i++) {
    if(complete)break
    const rows=readFileSync(`${output}/${variant}/process.jsonl`,'utf8').trim().split('\n').map(x=>JSON.parse(x))
    complete=rows.findLast(row=>row.sequence>before.sequence&&row.kind==='profile-complete')
    if(complete)break
    await new Promise(resolve=>setTimeout(resolve,500))
  }
  assert.ok(complete,'Profile completion receipt required')
  const aggregate=String.raw`
    const fs=require('node:fs'),crypto=require('node:crypto');
    const root=process.env.ACCEPTANCE_PRIVATE_PROFILE,files=fs.readdirSync(root);
    const heapFile=files.filter(x=>/^heap-\d+\.heapsnapshot$/.test(x)).sort().at(-1);
    const allocationFile=files.filter(x=>/^allocation-\d+\.json$/.test(x)).sort().at(-1);
    const raw=fs.readFileSync(root+'/'+heapFile),heap=JSON.parse(raw),meta=heap.snapshot.meta;
    const fields=meta.node_fields,width=fields.length,types=meta.node_types[fields.indexOf('type')],totals={};
    const safeNames=new Set(['Object','Array','Map','Set','WeakMap','WeakSet','Promise','Timeout','Socket','Pool','Client','Buffer','Uint8Array','ArrayBuffer','Date','Error']);
    const objects={};
    for(let i=0;i<heap.nodes.length;i+=width){
      const type=types[heap.nodes[i+fields.indexOf('type')]],bytes=heap.nodes[i+fields.indexOf('self_size')];
      const row=totals[type]??={count:0,shallowBytes:0};row.count++;row.shallowBytes+=bytes;
      if(type==='object'){const original=heap.strings[heap.nodes[i+fields.indexOf('name')]],name=safeNames.has(original)?original:'other';const object=objects[name]??={count:0,shallowBytes:0};object.count++;object.shallowBytes+=bytes}
    }
    const allocationRaw=fs.readFileSync(root+'/'+allocationFile),profile=JSON.parse(allocationRaw).profile,sites={};
    const group=url=>url.startsWith('node:')?url.replace(/[^a-zA-Z0-9_:/.-]/g,'').slice(0,120):url.includes('/node_modules/@lyyzka/lingxios/')?'LingxiOS':url.includes('/app/server/')?'product server':url.includes('/node_modules/')?'other dependencies':'runtime/anonymous';
    const visit=node=>{const key=group(node.callFrame.url);sites[key]=(sites[key]??0)+node.selfSize;for(const child of node.children??[])visit(child)};visit(profile.head);
    console.log(JSON.stringify({heapFile,heapSha256:crypto.createHash('sha256').update(raw).digest('hex'),allocationFile,allocationSha256:crypto.createHash('sha256').update(allocationRaw).digest('hex'),nodeCount:heap.snapshot.node_count,edgeCount:heap.snapshot.edge_count,totals,objects,sampledAllocationBytes:sites}));
  `
  // Parse outside the 640MiB measured container. Loading a V8 snapshot can
  // need substantially more memory than the observed process itself.
  const privateDirectory=`${output}/private-${variant}`
  mkdirSync(privateDirectory,{recursive:true,mode:0o700})
  const entries=readdirSync(`${output}/${variant}`)
  const files=[entries.filter(x=>/^heap-\d+\.heapsnapshot$/.test(x)).sort().at(-1),entries.filter(x=>/^allocation-\d+\.json$/.test(x)).sort().at(-1)]
  for(const file of files) {assert.match(file,/^(heap-\d+\.heapsnapshot|allocation-\d+\.json)$/);docker('cp',`${name}:/acceptance-output/${variant}/${file}`,`${privateDirectory}/${file}`);chmodSync(`${privateDirectory}/${file}`,0o600)}
  const parsed=spawnSync(process.execPath,['--max-old-space-size=4096','-e',aggregate],{encoding:'utf8',maxBuffer:4*1024*1024,env:{ACCEPTANCE_PRIVATE_PROFILE:privateDirectory}})
  assert.equal(parsed.status,0,parsed.stderr.slice(-300))
  const details=JSON.parse(parsed.stdout)
  const postGc=readFileSync(`${output}/${variant}/process.jsonl`,'utf8').trim().split('\n').map(x=>JSON.parse(x)).findLast(row=>row.kind==='post-gc'&&row.at<=complete.at)
  summaries.variants[variant]={completedAt:complete.at,postGcMemory:postGc?.memory,afterSnapshotMemory:complete.memory,...details}
}
writeFileSync(`${output}/profile-summary.json`,JSON.stringify(summaries,null,2))
console.log(JSON.stringify({profileComplete:true,rawSnapshots:'private, not included in published evidence'}))
