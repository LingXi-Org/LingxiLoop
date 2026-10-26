# Loaded after the fixed native operator helpers. Explicit maintenance authority
# is required; this is never invoked by an ordinary product release.
DOCKER_CONFIG=pathlib.Path('/etc/docker/daemon.json')
DOCKER_STATE=pathlib.Path('/var/lib/lingxi-release/docker-proxy-514')
NO_PROXY='localhost,127.0.0.1,::1,10.20.0.0/24,postgres,redis,lingxiloop,worker,wukongim,open-notebook'
PROXY='http://127.0.0.1:17890'
def encoded(value):return (json.dumps(value,sort_keys=True,indent=2)+'\n').encode()
def replacement(path,raw):
 fd,tmp=tempfile.mkstemp(prefix='.docker-proxy-',dir=path.parent)
 try:
  with os.fdopen(fd,'wb') as out:out.write(raw);os.fchmod(out.fileno(),0o600);out.flush();os.fsync(out.fileno())
  os.replace(tmp,path);syncdir(path.parent)
 finally:
  if os.path.exists(tmp):os.unlink(tmp)
def docker_info():
 info=json.loads(execute(['docker','info','--format','{{json .}}'],15,'DOCKER_INFO'))
 return {'liveRestore':info.get('LiveRestoreEnabled'),'httpProxy':info.get('HTTPProxy',''),'httpsProxy':info.get('HTTPSProxy',''),'noProxy':info.get('NoProxy','')}
def inventory(reference=None,attempt=0):
 ids=execute(['docker','ps','-q'],10,'DOCKER_LIST').decode().split()
 check(ids,'DOCKER_INVENTORY_EMPTY')
 # Deliberately do not output inspect's environment or credentials.
 rows=json.loads(execute(['docker','inspect',*ids],15,'DOCKER_INSPECT'))
 result=[]
 for row in rows:
  state=row['State'];health=state.get('Health',{}).get('Status')
  check(state.get('Running'),'DOCKER_CONTAINER_NOT_RUNNING')
  if health not in (None,'healthy'):
   check(attempt<20,'DOCKER_CONTAINER_UNHEALTHY')
   time.sleep(1);return inventory(reference,attempt+1)
  mounts=[{key:m.get(key) for key in ('Type','Name','Source','Destination','RW')} for m in row['Mounts']]
  mounts_hash=digest(encoded(sorted(mounts,key=lambda m:json.dumps(m,sort_keys=True))))
  previous=next((old for old in (reference or []) if old['id']==row['Id']),None)
  if previous and previous['mountsHash']!=mounts_hash and len(mounts)<=6:
   # v1 receipts hashed Docker's non-stable inspect array order. Prove the
   # identical complete set against that hash; never ignore a mount difference.
   import itertools
   if any(digest(encoded(list(order)))==previous['mountsHash'] for order in itertools.permutations(mounts)):mounts_hash=previous['mountsHash']
  result.append({'id':row['Id'],'name':row['Name'],'image':row['Image'],'startedAt':state['StartedAt'],'mountsHash':mounts_hash})
 return sorted(result,key=lambda row:row['id'])
def validate_docker(raw):
 with tempfile.TemporaryDirectory(prefix='lingxi-docker-',dir='/run') as directory:
  path=pathlib.Path(directory)/'daemon.json';path.write_bytes(raw);path.chmod(0o600)
  execute(['/usr/bin/dockerd','--validate','--config-file',str(path)],15,'DOCKER_VALIDATE')
def state_permissions():
 metadata=DOCKER_STATE.lstat()
 check(stat.S_ISDIR(metadata.st_mode) and metadata.st_uid==0 and stat.S_IMODE(metadata.st_mode)==0o700,'DOCKER_STATE_PERMISSIONS')
def save_state(state):replacement(DOCKER_STATE/'state.json',encoded(state))
def docker_read():
 state=readjson(DOCKER_STATE/'state.json') if present(DOCKER_STATE/'state.json') else None
 info=docker_info()
 return {'phase':state['phase'] if state else 'not-started','configurationSha256':digest(regular(DOCKER_CONFIG,1048576)),'liveRestoreEnabled':info['liveRestore'],'proxyActive':info['httpProxy']==PROXY and info['httpsProxy']==PROXY and info['noProxy']==NO_PROXY,'containers':inventory(),'inflight':release_idle()}
def docker_maintenance(data):
 global DOCKER_STATE
 action=data['action'];check(action in ('query','apply','restore','query-corrected','apply-corrected','restore-corrected'),'INVALID_DOCKER_ACTION')
 if action.endswith('-corrected'):
  previous=readjson(DOCKER_STATE/'state.json')
  check(previous['phase']=='restored' and previous['host']==data['host'] and (action=='query-corrected' or previous['sourceSha256']==data.get('expectedHash')),'PREVIOUS_DOCKER_RESTORATION_REQUIRED')
  if action=='apply-corrected':check(inventory(previous['containers'])==previous['containers'],'DOCKER_CONTAINER_DRIFT')
  DOCKER_STATE=DOCKER_STATE.with_name(DOCKER_STATE.name+'-corrected');action=action.removesuffix('-corrected')
 release_idle()
 if action=='query':return docker_read()
 expected=data.get('expectedHash');check(re.fullmatch('[a-f0-9]{64}',expected or ''),'EXPECTED_DOCKER_HASH_REQUIRED')
 current=regular(DOCKER_CONFIG,1048576)
 state_path=DOCKER_STATE/'state.json'
 if not present(state_path):
  check(action=='apply' and digest(current)==expected,'DOCKER_SOURCE_CHANGED')
  # Source path, CLI conflicts, proxy/provider and configuration are all checked
  # before creating an intent or changing the daemon.
  plan=native_action({'host':data['host'],'action':'docker-plan'})
  check(plan['currentSha256']==expected,'DOCKER_SOURCE_CHANGED')
  previous=inventory();config=json.loads(current)
  live=encoded({**config,**({} if docker_info()['liveRestore'] else {'live-restore':True})})
  candidate=encoded({**json.loads(live),'proxies':{**config.get('proxies',{}),'http-proxy':PROXY,'https-proxy':PROXY,'no-proxy':NO_PROXY}})
  validate_docker(live);validate_docker(candidate)
  DOCKER_STATE.mkdir(mode=0o700,exist_ok=True)
  state_permissions()
  backup=DOCKER_STATE/'original.json'
  if present(backup):check(regular(backup)==current,'DOCKER_BACKUP_CONFLICT')
  else:
   fd=os.open(backup,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
   with os.fdopen(fd,'wb') as out:out.write(current);out.flush();os.fsync(out.fileno())
  state={'version':1,'host':data['host'],'sourceSha256':expected,'liveSha256':digest(live),'targetSha256':digest(candidate),'phase':'prepared','startedAt':time.time(),'deadline':time.time()+240,'containers':previous,'initialInfo':docker_info()}
  save_state(state)
 else:
  state_permissions()
  state=readjson(state_path);check(state['host']==data['host'] and state['sourceSha256']==expected,'DOCKER_STATE_CONFLICT')
  original=regular(DOCKER_STATE/'original.json',1048576);check(digest(original)==expected,'DOCKER_BACKUP_CONFLICT');config=json.loads(original)
  live=encoded({**config,**({} if state['initialInfo']['liveRestore'] else {'live-restore':True})})
  candidate=encoded({**json.loads(live),'proxies':{**config.get('proxies',{}),'http-proxy':PROXY,'https-proxy':PROXY,'no-proxy':NO_PROXY}})
 original=regular(DOCKER_STATE/'original.json',1048576)
 restore_live=encoded({**json.loads(original),**({} if state['initialInfo']['liveRestore'] else {'live-restore':True})})
 allowed=[expected,state['liveSha256'],state['targetSha256']]
 if state['phase'].startswith('restore'):allowed.append(digest(restore_live))
 check(digest(current) in allowed,'DOCKER_EXTERNAL_DRIFT')
 if action!='restore':check(inventory(state['containers'])==state['containers'],'DOCKER_CONTAINER_DRIFT')
 if action=='restore':
  if state['phase']=='restored':return docker_read()
  if state['phase']=='prepared' and digest(current)==expected:
   check(inventory(state['containers'])==state['containers'] and docker_info()==state['initialInfo'],'DOCKER_PREWRITE_STATE_CHANGED')
   state['phase']='restored';state['noDaemonMutation']=True;save_state(state);return docker_read()
  if state['phase']=='restore-restart-intent':
   # Reconcile the previous restart; do not repeat it after readiness lag or
   # a lost response. The exact restored proxy and unchanged containers prove it.
   observed=docker_info();expected_info={**state['initialInfo'],'liveRestore':True}
   check(observed==expected_info,'DOCKER_RESTORE_UNCERTAIN_READ_FIRST')
   check(inventory(state['containers'])==state['containers'],'DOCKER_CONTAINER_DRIFT')
  elif state['phase']!='restore-reload-intent':
   service=dict(line.split('=',1) for line in execute(['systemctl','show','docker','--property=ActiveState,MainPID','--no-pager'],10).decode().splitlines() if '=' in line)
   if service.get('ActiveState')=='active':check(inventory(state['containers'])==state['containers'],'DOCKER_CONTAINER_DRIFT')
   else:check(service.get('ActiveState')=='failed' and service.get('MainPID')=='0' and state['phase']=='restart-intent','DOCKER_SERVICE_OUTCOME_UNCERTAIN')
   validate_docker(restore_live);replacement(DOCKER_CONFIG,restore_live)
   state['phase']='restore-restart-intent';save_state(state)
   execute(['systemctl','reset-failed','docker'],10,'DOCKER_RESET_FAILURE')
   execute(['systemctl','restart','docker'],45,'DOCKER_RESTORE')
   check(inventory(state['containers'])==state['containers'],'DOCKER_CONTAINER_DRIFT')
  validate_docker(original);replacement(DOCKER_CONFIG,original)
  if docker_info()!=state['initialInfo']:
   check(state['phase']!='restore-reload-intent','DOCKER_RESTORE_UNCERTAIN_READ_FIRST')
   state['phase']='restore-reload-intent';save_state(state)
   execute(['systemctl','reload','docker'],20,'DOCKER_RELOAD')
  check(inventory(state['containers'])==state['containers'],'DOCKER_CONTAINER_DRIFT')
  check(docker_info()==state['initialInfo'],'DOCKER_RESTORE_UNCONFIRMED')
  state['phase']='restored';save_state(state);return docker_read()
 check(time.time()<state['deadline'] or state['phase']=='complete','DOCKER_MAINTENANCE_DEADLINE')
 check(not state['phase'].startswith('restore') and state['phase']!='restored','DOCKER_ALREADY_RESTORED')
 info=docker_info()
 if state['phase']=='complete':
  check(digest(current)==state['targetSha256'] and info['httpProxy']==PROXY and info['httpsProxy']==PROXY and info['noProxy']==NO_PROXY and info['liveRestore'],'DOCKER_COMPLETION_DRIFT')
  return docker_read()
 if not info['liveRestore']:
  check(state['phase']=='prepared','DOCKER_RELOAD_UNCERTAIN_READ_FIRST')
  replacement(DOCKER_CONFIG,live);state['phase']='live-reload-intent';save_state(state)
  execute(['systemctl','reload','docker'],20,'DOCKER_LIVE_RELOAD')
  check(docker_info()['liveRestore'],'DOCKER_LIVE_RESTORE_UNCONFIRMED')
  check(inventory(state['containers'])==state['containers'],'DOCKER_CONTAINER_DRIFT')
  state['phase']='live-ready';save_state(state)
 # Lost restart response is reconciled by the effective configuration first.
 info=docker_info()
 if not (info['httpProxy']==PROXY and info['httpsProxy']==PROXY and info['noProxy']==NO_PROXY):
  check(state['phase']!='restart-intent','DOCKER_RESTART_UNCERTAIN_READ_FIRST')
  check(time.time()<state['deadline']-50,'DOCKER_MAINTENANCE_DEADLINE')
  replacement(DOCKER_CONFIG,candidate);state['phase']='restart-intent';save_state(state)
  execute(['systemctl','restart','docker'],45,'DOCKER_PROXY_RESTART')
 info=docker_info();check(info['liveRestore'] and info['httpProxy']==PROXY and info['httpsProxy']==PROXY and info['noProxy']==NO_PROXY,'DOCKER_PROXY_UNCONFIRMED')
 check(inventory(state['containers'])==state['containers'],'DOCKER_CONTAINER_DRIFT')
 state['phase']='complete';state['completedAt']=time.time();save_state(state)
 return docker_read()
try:
 with deadline():print(json.dumps(docker_maintenance(json.loads(sys.argv[1]))))
except Exception as error:
 code=str(error) if isinstance(error,RuntimeError) and re.fullmatch('[A-Z0-9_]+',str(error)) else 'DOCKER_OPERATION_UNCONFIRMED'
 print(json.dumps({'error':code,'queryBeforeRetry':True}));sys.exit(1)
