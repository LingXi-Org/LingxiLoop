import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {createHash} from 'node:crypto'
import {syncKomodoConfig} from './sync-komodo-config.mjs'
const names=['server-b-ingress','landing','lingxilit','uptime']
function fixture({managed=false,deleteMode=false,unsafePreview}={}){
  const calls=[],ids=Object.fromEntries(names.map((name,index)=>[name,String(index+1).repeat(24)])),stored={_id:{$oid:'a'.repeat(24)},config:{managed,delete:deleteMode,file_contents:'old source in memory',webhook_enabled:true}}
  const fetcher=async(url,options)=>{const path=url.pathname,body=JSON.parse(options.body);calls.push({path,body})
    if(path==='/read/GetResourceSync')return Response.json(stored)
    if(path==='/read/GetStack')return Response.json({_id:{$oid:ids[body.stack]},name:body.stack})
    if(path==='/write/UpdateResourceSync'){Object.assign(stored.config,body.config);return Response.json(stored)}
    if(path==='/write/RefreshResourceSyncPending')return Response.json({info:{resource_updates:unsafePreview?[unsafePreview]:[{target:{type:'Stack',id:ids.uptime},data:{type:'Update'}}],pending_deploys:[]}})
    throw Error('Unlisted network operation')
  }
  return{calls,stored,run:source=>syncKomodoConfig({url:'https://ops.christmas1314.xyz',headers:{},fetcher,source})}
}
test('shared source retains only four shared stacks and preserves service configuration apart from the explicit ingress commit pin',async()=>{
  const source=await readFile(new URL('../deploy/komodo/shared-resources.toml',import.meta.url),'utf8'),old=await readFile(new URL('../deploy/komodo/resources.toml',import.meta.url),'utf8')
  const blocks=source.split('[[stack]]').slice(1);assert.deepEqual(blocks.map(block=>block.match(/name = "([^"]+)"/)[1]),names);assert.equal(source.includes('[[procedure]]'),false)
  for(const block of blocks){const name=block.match(/name = "([^"]+)"/)[1],prior=old.split('[[stack]]').slice(1).find(part=>part.startsWith(`\nname = "${name}"`)).split('[[procedure]]')[0];let config=block.slice(block.indexOf('[stack.config]'));if(name==='server-b-ingress')config=config.replace(/^# Includes the exact backend router accepted by the fixed bootstrap actor\.\n/m,'').replace(/^commit = "816433430c71887905bf277d6ced523cc92f6674"\n/m,'');assert.equal(config.trim(),prior.slice(prior.indexOf('[stack.config]')).trim())}
  for(const id of ['lingxiloop-core-state','lingxiloop-app-a','lingxiloop-app-b','lingxiloop-knowledge-agent','lingxiloop-production-rollout'])assert.equal(source.includes(`"${id}"`),false)
})
test('the retained ingress resource pins the immutable accepted backend route source instead of tracking future main changes',async()=>{
  const source=await readFile(new URL('../deploy/komodo/shared-resources.toml',import.meta.url),'utf8'),ingress=source.split('[[stack]]')[1],route=await readFile(new URL('../deploy/komodo/server-b-ingress/dynamic.yml',import.meta.url))
  assert.match(ingress,/^commit = "816433430c71887905bf277d6ced523cc92f6674"$/m);assert.equal(createHash('sha256').update(route).digest('hex'),'0157eb67307692d96afd0b5474d54b5879896abbad7fbb37c7c6f6ea011ea609')
})
test('sync detaches legacy ownership without RunSync, deleting resources or touching existing stack configurations',async()=>{
  const f=fixture();await f.run();assert.equal(f.stored.config.webhook_enabled,false);assert.equal(f.stored.config.managed,false);assert.equal(f.stored.config.delete,false);assert.deepEqual(f.stored.config.resource_path,['deploy/komodo/shared-resources.toml'])
  assert.deepEqual(f.calls.filter(row=>row.path.startsWith('/write/')).map(row=>row.path),['/write/UpdateResourceSync','/write/RefreshResourceSyncPending']);assert.equal(f.calls.some(row=>row.path.startsWith('/execute/')),false)
})
test('old full source and destructive managed/delete settings are rejected before any configuration write',async()=>{
  const legacy=await readFile(new URL('../deploy/komodo/resources.toml',import.meta.url),'utf8'),f=fixture();await assert.rejects(f.run(legacy),/legacy stack\/Procedure adoption is blocked/);assert.equal(f.calls.length,0)
  for(const options of [{managed:true},{deleteMode:true}]){const g=fixture(options);await assert.rejects(g.run(),/managed=false and delete=false/);assert.equal(g.calls.some(row=>row.path.startsWith('/write/')),false)}
})
test('preview refuses protected resources, other resource types, creates and deletes without executing anything',async()=>{
  for(const unsafePreview of [{target:{type:'Stack',id:'protected'}},{target:{type:'Procedure',id:'protected'}},{target:{type:'Stack',id:'4'.repeat(24)},data:{type:'Delete'}},{target:{type:'Stack',id:'4'.repeat(24)},data:{type:'Create'}}]){const f=fixture({unsafePreview});await assert.rejects(f.run(),/unowned or destructive/);assert.equal(f.calls.some(row=>row.path.startsWith('/execute/')),false)}
})
test('retired old publisher fails before credentials, schema helpers, resource mutation, DB preparation or webhook',()=>{
  const result=spawnSync(process.execPath,[fileURLToPath(new URL('./trigger-komodo-rollout.mjs',import.meta.url))],{encoding:'utf8',env:{PATH:process.env.PATH},timeout:10000});assert.equal(result.status,1);assert.match(result.stderr,/Legacy Komodo publication is retired/);assert.equal(result.stderr.includes('Komodo rollout credentials are required'),false)
})
