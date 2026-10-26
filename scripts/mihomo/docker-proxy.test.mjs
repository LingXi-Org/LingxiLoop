import test from 'node:test'
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {dockerCommand,dockerOperation} from './docker-proxy.mjs'
test('fixed Docker maintenance preserves containers, resumes a lost restart without replay, restores and rejects drift',()=>{
 const script=`import shlex,sys,tempfile,pathlib,json,hashlib,copy
source=shlex.split(sys.argv[1])[2].rsplit('try:\\n with deadline():print',1)[0]
scope={};exec(source,scope)
for initial_live in (True,False):
 with tempfile.TemporaryDirectory() as directory:
  root=pathlib.Path(directory);config=root/'daemon.json';original=json.dumps({'live-restore':initial_live,'log-driver':'json-file'}).encode();config.write_bytes(original)
  state=root/'state';expected=hashlib.sha256(original).hexdigest()
  info={'liveRestore':initial_live,'httpProxy':'','httpsProxy':'','noProxy':''};calls=[];lost=[True]
  rows=[{'id':'fixed','name':'app','image':'sha256:fixed','startedAt':'unchanged','mountsHash':'fixed'}]
  def execute(args,*unused):
   calls.append(args)
   if args[:2]==['systemctl','reload']:
    info['liveRestore']=json.loads(config.read_bytes()).get('live-restore',False)
   if args[:2]==['systemctl','restart']:
    parsed=json.loads(config.read_bytes());proxies=parsed.get('proxies',{})
    info.update(liveRestore=parsed.get('live-restore',False),httpProxy=proxies.get('http-proxy',''),httpsProxy=proxies.get('https-proxy',''),noProxy=proxies.get('no-proxy',''))
    if lost[0]:lost[0]=False;raise RuntimeError('SIMULATED_LOST_RESTART_RESPONSE')
   return b''
  scope.update(state_permissions=lambda:None,DOCKER_CONFIG=config,DOCKER_STATE=state,execute=execute,validate_docker=lambda raw:json.loads(raw),docker_info=lambda:dict(info),inventory=lambda:copy.deepcopy(rows),release_idle=lambda:{'pending':0,'reservations':0},native_action=lambda data:{'currentSha256':expected})
  data={'action':'apply','host':'a','expectedHash':expected}
  try:scope['docker_maintenance'](data);raise AssertionError('fault not injected')
  except RuntimeError as e:assert str(e)=='SIMULATED_LOST_RESTART_RESPONSE'
  assert json.loads((state/'state.json').read_bytes())['phase']=='restart-intent'
  assert scope['docker_maintenance'](data)['phase']=='complete'
  assert len([x for x in calls if x[:2]==['systemctl','restart']])==1
  assert scope['docker_maintenance'](data)['phase']=='complete'
  assert (state/'original.json').read_bytes()==original
  assert json.loads(config.read_bytes())['log-driver']=='json-file'
  config.write_text('{}')
  try:scope['docker_maintenance'](data);raise AssertionError('drift accepted')
  except RuntimeError as e:assert str(e)=='DOCKER_EXTERNAL_DRIFT'
  candidate={**json.loads(original),'live-restore':True,'proxies':{'http-proxy':scope['PROXY'],'https-proxy':scope['PROXY'],'no-proxy':scope['NO_PROXY']}}
  config.write_bytes(scope['encoded'](candidate))
  restored=scope['docker_maintenance']({**data,'action':'restore'})
  assert restored['phase']=='restored' and config.read_bytes()==original and info['liveRestore']==initial_live
  assert rows==restored['containers']
  assert len([x for x in calls if x[:2]==['systemctl','restart']])==2
`
 const result=spawnSync('python3',['-c',script,dockerCommand('a','apply','a'.repeat(64))],{encoding:'utf8'})
 assert.equal(result.status,0,result.stderr);assert.equal(result.stdout,'')
})
test('Docker maintenance rejects arbitrary targets/commands and never retries a denied transport',async()=>{
 assert.throws(()=>dockerCommand('c','apply','a'.repeat(64)))
 assert.throws(()=>dockerCommand('a','restart','a'.repeat(64)))
 assert.throws(()=>dockerCommand('a','apply','not-a-hash'))
 let calls=0
 await assert.rejects(dockerOperation('a','query',{env:{KOMODO_API_KEY:'private',KOMODO_API_SECRET:'private'},fetcher:async()=>{calls++;return new Response('',{status:403})}}),/HTTP_403/)
 assert.equal(calls,1)
})
