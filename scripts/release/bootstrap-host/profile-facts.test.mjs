import test from 'node:test'
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {fileURLToPath} from 'node:url'
import {collectProfileFacts} from './profile-facts.mjs'
const secret='fixture-private-credential-do-not-emit',rawInfo={tables:{source:'DEFINE TABLE source SCHEMALESS'},functions:{internal:`DEFINE FUNCTION secret() { RETURN '${secret}'; }`}},sha=value=>createHash('sha256').update(value).digest('hex'),digest=value=>`sha256:${sha(value)}`
function fake(){
  const calls=[],queries=[],containers={},images={},configs={},version='nginx version: nginx/1.29.4\n',gatewayConfig=`server { # private fixture ${secret}\n listen 8080; }\n`,build=`upstream_commit=${'a'.repeat(40)}\nraftstore_fix_commit=${'b'.repeat(40)}\nprivate=${secret}\n`,surrealVersion='2.3.10 for linux on x86_64\n'
  const specs=[['lingxiloop-app-a','lingxiloop'],['lingxiloop-app-a','worker'],['lingxiloop-core-state','wukongim'],['lingxiloop-app-b','lingxiloop'],['lingxiloop-app-b','worker'],['lingxiloop-app-b','gateway'],['lingxiloop-knowledge-agent','open-notebook'],['lingxiloop-knowledge-agent','surrealdb']]
  for(const[project,service]of specs){
    const directory=`/etc/komodo/stacks/${project}/deploy/komodo/${project}`,id=sha(project+service),imageId=digest('image:'+service),environment={PRIVATE_TOKEN:secret};if(service==='open-notebook')Object.assign(environment,{SURREAL_NAMESPACE:'open_notebook',SURREAL_DATABASE:'control'});if(service==='surrealdb')Object.assign(environment,{SURREAL_USER:'fixture-root',SURREAL_PASS:secret})
    const mounts=service==='surrealdb'?[['named-storage','/home/nonroot'],['8'.repeat(64),'/data'],['9'.repeat(64),'/logs']].map(([Name,Destination])=>({Type:'volume',Name,Source:`/var/lib/docker/volumes/${Name}/_data`,Destination,RW:true})):service==='worker'?[{Type:'volume',Name:'original-homes',Source:'/var/lib/docker/volumes/original-homes/_data',Destination:'/var/lib/lingxios/homes',RW:true}]:[]
    containers[id]={Id:id,Image:imageId,Config:{Env:Object.entries(environment).map(([k,v])=>`${k}=${v}`),Cmd:['fixed',service],Entrypoint:null,WorkingDir:'/app',User:'',Labels:{'com.docker.compose.project':project,'com.docker.compose.service':service,'com.docker.compose.project.working_dir':directory,'com.docker.compose.project.config_files':`${directory}/compose.yml`,'com.docker.compose.project.environment_file':`${directory}/.env`}},State:{Running:true,Pid:100,Restarting:false,Health:{Status:'healthy'}},Mounts:mounts,NetworkSettings:{Networks:{'knowledge-fixed':{IPAddress:service==='surrealdb'?'172.20.0.8':'172.20.0.9'}}}}
    images[imageId]={Id:imageId,Os:'linux',Architecture:'amd64',RepoDigests:[`ghcr.io/fixture/${service}@${imageId}`],RootFS:{Type:'layers',Layers:[digest('layer:'+service)]},Descriptor:{digest:imageId,mediaType:'application/vnd.oci.image.index.v1+json',size:800},Config:{Env:[`PRIVATE_IMAGE_TOKEN=${secret}`]}}
    configs[project]??={name:project,services:{},volumes:{homes:{name:'original-homes'}}};configs[project].services[service]={image:`ghcr.io/fixture/${service}@${imageId}`,pull_policy:'always',environment,command:['fixed',service]}
  }
  let schema=1,pointerPhase='active',changedPointer=false,failGateway=false
  const run=async(file,args,options)=>{
    calls.push({file,args,options});assert.equal(file,'/usr/bin/docker');assert.ok(!args.includes(secret));
    if(args[0]==='ps'){const project=args.find(v=>v.startsWith('label=com.docker.compose.project=')).split('=').at(-1),service=args.find(v=>v.startsWith('label=com.docker.compose.service=')).split('=').at(-1);return Object.values(containers).filter(c=>c.Config.Labels['com.docker.compose.project']===project&&c.Config.Labels['com.docker.compose.service']===service).map(c=>c.Id).join('\n')}
    if(args[0]==='container')return JSON.stringify([containers[args[2]]])
    if(args[0]==='image')return JSON.stringify([images[args[2]]])
    if(args[0]==='compose'){assert.ok(args.includes('config'));return JSON.stringify(configs[args[args.indexOf('--project-name')+1]])}
    if(args[0]==='exec'){
      const container=containers[args.includes('--workdir')?args[3]:args[1]],service=container.Config.Labels['com.docker.compose.service']
      if(service==='gateway'&&failGateway)throw Object.assign(Error(secret),{code:secret})
      if(args.includes('node'))return JSON.stringify({sourceSha:'c'.repeat(40),releaseVersions:{runtime:'3.8.12',schema:14,controlPlane:11,kernel:2,extraPrivate:secret},nativeSchemaHash:'d'.repeat(64),migrations:[{version:1,name:'baseline',checksum:'e'.repeat(64)}]})
      if(args.includes('cat'))return build
      if(args.includes('sha256sum'))return `${sha(args.at(-1))}  ${args.at(-1)}\n`
      if(args.includes('/surreal'))return surrealVersion
      if(args.includes('nginx')&&args.at(-1)==='-v'){assert.equal(options.captureStderr,true);return version}
      if(args.includes('nginx')&&args.at(-1)==='-T')return gatewayConfig
      if(args.includes('curl'))return JSON.stringify({status:'ready',profile:'rag',schema_version:1,privateBody:secret,active_generation:{active_database:'active',revision:7}})
      if(args.includes('wget')||args.includes('nginx'))return ''
    }
    throw Error('Unexpected fixed command')
  }
  const fetcher=async(url,options)=>{
    assert.equal(url,'http://172.20.0.8:8000/sql');assert.equal(options.method,'POST');assert.equal(options.redirect,'error');assert.ok(options.headers.authorization.startsWith('Basic '));queries.push(options)
    let results
    if(options.body.startsWith('SELECT namespace'))results=[[],[]]
    else if(options.body.startsWith('SELECT active_database'))results=[[{active_database:'active',phase:pointerPhase,revision:changedPointer&&queries.length>3?8:7}]]
    else results=[[{version:schema}],[{count:2}],rawInfo]
    return new Response(JSON.stringify(results.map(result=>({status:'OK',result}))),{status:200})
  }
  return{run,fetcher,calls,queries,containers,images,configs,version,gatewayConfig,build,surrealVersion,setSchema:v=>schema=v,setPhase:v=>pointerPhase=v,setChanged:()=>changedPointer=true,setFailGateway:()=>failGateway=true}
}
test('A records main effective hash, complete mounts/local identity and Wukong build evidence without leaking raw secrets',async()=>{
  const f=fake(),result=await collectProfileFacts('a',f);assert.equal(result.complete,true);assert.deepEqual(Object.keys(result.targets),['main-runtime-a','wukongim']);assert.equal(result.targets.wukongim.metadata.buildInfoSha256,sha(f.build));assert.equal(result.targets.wukongim.metadata.upstreamCommit,'a'.repeat(40));assert.equal(result.targets.wukongim.storageEvidence.coldSchemaInspected,false)
  assert.equal(result.targets['main-runtime-a'].runtime.releaseVersions.runtime,'3.8.12');assert.equal(Object.keys(result.targets['main-runtime-a'].images).length,2);assert.match(result.targets['main-runtime-a'].configurationHash,/^sha256:[a-f0-9]{64}$/);assert.equal(JSON.stringify(result).includes(secret),false)
})
test('B resolves actual generation and schema definition hash, preserves anonymous Surreal mounts and hashes Nginx raw output',async()=>{
  const f=fake(),result=await collectProfileFacts('b',f);assert.equal(result.complete,true);const notebook=result.targets.notebook,gateway=result.targets.gateway
  assert.equal(notebook.storage.namespace,'open_notebook');assert.equal(notebook.storage.database,'active');assert.equal(notebook.storage.controlDatabase,'control');assert.equal(notebook.storage.schemaVersion,1);assert.equal(notebook.pendingCommands,2);assert.equal(notebook.surreal.mounts.find(m=>m.target==='/logs').name,'9'.repeat(64));assert.equal(notebook.surreal.mounts.find(m=>m.target==='/data').name,'8'.repeat(64));assert.equal(notebook.surreal.version,'2.3.10')
  assert.equal(gateway.metadata.version,'1.29.4');assert.equal(gateway.metadata.versionOutputSha256,sha(f.version));assert.equal(gateway.metadata.configurationSha256,sha(f.gatewayConfig));assert.equal(gateway.hotDrainVerified,false)
  const serialized=JSON.stringify(result);assert.equal(serialized.includes(secret),false);assert.equal(serialized.includes('DEFINE TABLE'),false);assert.equal(serialized.includes('PRIVATE_TOKEN'),false);assert.equal(serialized.includes('extraPrivate'),false)
  assert.ok(f.queries.every(query=>!/\b(CREATE|UPDATE|DELETE|DEFINE|REMOVE|INSERT|UPSERT)\b/.test(query.body)))
})
test('config fingerprints change with effective secret rotation while raw credentials remain absent',async()=>{
  const f=fake(),first=await collectProfileFacts('a',f);for(const c of Object.values(f.containers))c.Config.Env=c.Config.Env.map(v=>v.replace(secret,'another-private-value'));for(const config of Object.values(f.configs))for(const service of Object.values(config.services))for(const key of Object.keys(service.environment))if(service.environment[key]===secret)service.environment[key]='another-private-value'
  const second=await collectProfileFacts('a',f);assert.notEqual(first.targets['main-runtime-a'].configurationHash,second.targets['main-runtime-a'].configurationHash);assert.equal(JSON.stringify(second).includes('another-private-value'),false)
})
test('schema mismatch, generation fence/change and command failure are unqualified, not guessed or raw-error output',async()=>{
  for(const mutate of [f=>f.setSchema(2),f=>f.setPhase('fenced'),f=>f.setChanged()]){const f=fake();mutate(f);const result=await collectProfileFacts('b',f);assert.equal(result.targets.notebook.status,'unqualified');assert.equal(result.targets.gateway.status,'observed')}
  const f=fake();f.setFailGateway();const result=await collectProfileFacts('b',f);assert.equal(result.targets.gateway.status,'unqualified');assert.equal(JSON.stringify(result).includes(secret),false)
})
test('fixed source paths and running effective environment drift fail closed before declaring facts observed',async()=>{
  const f=fake(),runtime=Object.values(f.containers).find(c=>c.Config.Labels['com.docker.compose.project']==='lingxiloop-app-a');runtime.Config.Labels['com.docker.compose.project.config_files']='/untrusted/compose.yml'
  assert.equal((await collectProfileFacts('a',f)).targets['main-runtime-a'].reasonCodes[0],'CONTAINER_SOURCE_PATH_UNQUALIFIED')
  const g=fake();g.configs['lingxiloop-app-a'].services.lingxiloop.environment.PRIVATE_TOKEN='different-from-running';assert.equal((await collectProfileFacts('a',g)).targets['main-runtime-a'].reasonCodes[0],'RUNNING_COMPOSE_ENVIRONMENT_DRIFT')
})
test('only side a/b is accepted, and every execution remains a fixed read-only command',async()=>{
  const f=fake();await assert.rejects(collectProfileFacts('b; anything',f),{code:'INVALID_FACTS_SIDE'});await collectProfileFacts('b',f)
  assert.ok(f.calls.every(({args})=>['ps','container','image','compose','exec'].includes(args[0])));assert.equal(f.calls.some(({args})=>['up','stop','restart','pull','build','run','prune','down'].some(action=>args.includes(action))),false)
  const result=spawnSync(process.execPath,[fileURLToPath(new URL('./profile-facts.mjs',import.meta.url))],{input:'{"side":"b","sql":"SELECT private"}',encoding:'utf8'});assert.equal(result.status,1);assert.equal(JSON.parse(result.stdout).status,'unqualified')
})
