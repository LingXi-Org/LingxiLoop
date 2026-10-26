// Explicitly authorized host maintenance only; never changes Docker or enables
// a boot-time service. Fixed source and actions, no remotely supplied commands.
import { readFileSync } from 'node:fs'
const quote = s => `'${s.replaceAll("'", "'\\''")}'`
const maintenance = `
PROVIDER=pathlib.Path('/etc/lingxi-release/secrets/mihomo-provider.yaml')
def release_idle():
 import sqlite3
 db=sqlite3.connect('file:/var/lib/lingxi-release/journal.sqlite?mode=ro',uri=True,timeout=2)
 try:
  pending=db.execute("SELECT count(*) FROM operations WHERE status IN ('intent','running','uncertain')").fetchone()[0]
  reservations=db.execute('SELECT count(*) FROM reservations').fetchone()[0]
 finally:db.close()
 check(pending==0 and reservations==0,'RELEASE_NOT_IDLE')
 return {'pending':pending,'reservations':reservations}
def provider_nodes(raw):
 import yaml
 check(not any(isinstance(e,yaml.events.AliasEvent) for e in yaml.parse(raw)),'PROVIDER_ALIAS_REJECTED')
 class UniqueLoader(yaml.SafeLoader):pass
 def mapping(loader,node,deep=False):
  result={}
  for key,value in node.value:
   key=loader.construct_object(key,deep=deep)
   check(key not in result,'PROVIDER_DUPLICATE_KEY')
   result[key]=loader.construct_object(value,deep=deep)
  return result
 UniqueLoader.add_constructor(yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG,mapping)
 document=yaml.load(raw,Loader=UniqueLoader)
 nodes=document.get('proxies') if isinstance(document,dict) else None
 check(isinstance(nodes,list) and 0<len(nodes)<=1000,'PROVIDER_NODES_REQUIRED')
 names=set()
 for node in nodes:
  check(isinstance(node,dict) and isinstance(node.get('name'),str) and node['name'] not in names and isinstance(node.get('server'),str) and type(node.get('port')) is int and 1<=node['port']<=65535,'PROVIDER_NODE_INVALID')
  names.add(node['name'])
 return nodes
def bypass(value):
 if isinstance(value,dict):return value.get('skip-cert-verify') in (True,'true') or any(bypass(v) for v in value.values())
 if isinstance(value,list):return any(bypass(v) for v in value)
 return False
def provider_read(path=PROVIDER):
 m=path.lstat()
 check(stat.S_ISREG(m.st_mode) and m.st_uid==0 and m.st_gid==0 and stat.S_IMODE(m.st_mode)==0o600 and m.st_size<=2097152,'PROVIDER_METADATA_REJECTED')
 return path.read_bytes()
def provider_check():
 raw=provider_read();nodes=provider_nodes(raw)
 check(not any(bypass(node) for node in nodes),'PROVIDER_TLS_BYPASS_REJECTED')
 return {'sha256':digest(raw),'nodeCount':len(nodes),'bytes':len(raw)}
def filter_provider(expected):
 check(isinstance(expected,str) and re.fullmatch('[a-f0-9]{64}',expected),'EXPECTED_PROVIDER_HASH_REQUIRED')
 check(system_state()['ActiveState']=='inactive','MIHOMO_MUST_REMAIN_INACTIVE')
 backup=PROVIDER.with_name('mihomo-provider.uploaded-'+expected+'.yaml')
 receipt=PROVIDER.with_name('mihomo-provider.filtered-'+expected+'.json')
 current=provider_read()
 if present(backup):original=provider_read(backup)
 else:
  check(digest(current)==expected,'PROVIDER_SOURCE_HASH_MISMATCH');original=current
 check(digest(original)==expected,'PROVIDER_BACKUP_HASH_MISMATCH')
 nodes=provider_nodes(original);safe=[node for node in nodes if not bypass(node)]
 check(0<len(safe)<len(nodes),'PROVIDER_FILTER_NOT_APPLICABLE')
 candidate=json.dumps({'proxies':safe},ensure_ascii=False,separators=(',',':')).encode()
 check(current in (original,candidate),'PROVIDER_CHANGED_SINCE_APPROVAL')
 result={'sourceSha256':expected,'providerSha256':digest(candidate),'originalNodeCount':len(nodes),'nodeCount':len(safe),'excludedNodeCount':len(nodes)-len(safe),'originalPreserved':True,'serviceStarted':False}
 if present(receipt):
  check(readjson(receipt)==result and current==candidate,'PROVIDER_RECEIPT_CONFLICT');return result
 if not present(backup):
  fd=os.open(backup,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
  with os.fdopen(fd,'wb') as out:out.write(original);out.flush();os.fsync(out.fileno())
  syncdir(PROVIDER.parent)
 if current!=candidate:
  fd,tmp=tempfile.mkstemp(prefix='.provider-',dir=PROVIDER.parent)
  try:
   with os.fdopen(fd,'wb') as out:out.write(candidate);out.flush();os.fchmod(out.fileno(),0o600);os.fsync(out.fileno())
   check(provider_read()==original,'PROVIDER_CHANGED_DURING_FILTER')
   os.replace(tmp,PROVIDER);syncdir(PROVIDER.parent)
  finally:
   if os.path.exists(tmp):os.unlink(tmp)
 check(provider_check()['sha256']==result['providerSha256'],'PROVIDER_FILTER_UNCONFIRMED')
 record(receipt,result);return result
def execute(args,timeout=25,stage='COMMAND',safe_path=None):
 env={'PATH':'/usr/sbin:/usr/bin:/sbin:/bin',**({'SAFE_PATHS':safe_path} if safe_path else {})}
 r=subprocess.run(args,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=timeout,env=env)
 if r.returncode!=0:
  diagnostic=(r.stdout+r.stderr).decode(errors='replace').lower()
  category='SAFE_PATH' if any(s in diagnostic for s in ['safe_paths','not a subpath','not allowed paths']) else 'CONFIG' if 'config' in diagnostic else 'UNCONFIRMED'
  raise RuntimeError('MIHOMO_'+stage+'_'+category)
 return r.stdout
def docker_plan():
 path=pathlib.Path('/etc/docker/daemon.json');raw=regular(path,1048576);current=json.loads(raw)
 pid=execute(['systemctl','show','docker','--property=MainPID','--value'],10).decode().strip()
 check(pid.isdigit() and int(pid)>0,'DOCKER_PID_UNCONFIRMED')
 argv=pathlib.Path('/proc/'+pid+'/cmdline').read_bytes().decode().split('\\0')
 configured=next((v.split('=',1)[1] for v in argv if v.startswith('--config-file=')),argv[argv.index('--config-file')+1] if '--config-file' in argv else str(path))
 check(configured==str(path) and not any(v.startswith(('--http-proxy','--https-proxy','--no-proxy')) for v in argv),'DOCKER_CONFIG_SOURCE_CONFLICT')
 info=json.loads(execute(['docker','info','--format','{{json .}}'],15))
 proposed={**current,**({} if info.get('LiveRestoreEnabled') else {'live-restore':True}),'proxies':{**current.get('proxies',{}),'http-proxy':'http://127.0.0.1:17890','https-proxy':'http://127.0.0.1:17890','no-proxy':'localhost,127.0.0.1,::1,10.20.0.0/24,postgres,redis,lingxiloop,worker,wukongim,open-notebook'}}
 candidate=(json.dumps(proposed,indent=2,sort_keys=True)+'\\n').encode()
 with tempfile.TemporaryDirectory(prefix='lingxi-docker-validate-',dir='/run') as directory:
  staged=pathlib.Path(directory)/'daemon.json';staged.write_bytes(candidate);staged.chmod(0o600)
  args=[v for v in argv[1:] if v]
  if '--config-file' in args:args[args.index('--config-file')+1]=str(staged)
  elif any(v.startswith('--config-file=') for v in args):args=[('--config-file='+str(staged)) if v.startswith('--config-file=') else v for v in args]
  else:args+=['--config-file',str(staged)]
  execute([argv[0],*args,'--validate'],15,'DOCKER_VALIDATE')
 info=json.loads(execute(['docker','info','--format','{{json .}}'],15))
 rows=execute(['docker','ps','--format','{{json .}}'],15).decode().splitlines()
 return {'configurationPath':str(path),'currentSha256':digest(raw),'proposedSha256':digest(candidate),'candidateValid':True,'changedFields':['proxies.http-proxy','proxies.https-proxy','proxies.no-proxy']+([] if info.get('LiveRestoreEnabled') else ['live-restore']),'proxy':'http://127.0.0.1:17890','liveRestoreEnabled':info.get('LiveRestoreEnabled'),'validatedWithCurrentDaemonArguments':True,'liveRestoreSource':'flag' if any(v.startswith('--live-restore') for v in argv) else 'configuration','restartRequired':True,'dockerChanged':False,'affectedContainers':[{'name':json.loads(row)['Names'],'state':json.loads(row)['State'],'status':json.loads(row)['Status']} for row in rows]}
def native_action(data):
 side=data['host'];action=data['action'];p=Paths()
 check(side in ('a','b') and action in ('query','filter-provider','install','validate','start','probe','docker-plan'),'INVALID_NATIVE_ACTION')
 original={'action':'query','host':side}
 idle=release_idle()
 if action=='query':return {**query(original),'releaseIdle':idle}
 if action=='filter-provider':return filter_provider(data.get('expectedProviderHash'))
 provider=provider_check()
 if action=='install':
  result=main({'action':'install','host':side})
  return {'installed':True,'rawSha256':result['rawSha256'],'serviceStarted':False,'provider':provider}
 state=query(original)
 check(state['verified'],'MIHOMO_INSTALLATION_UNVERIFIED')
 if action in ('validate','start'):
  # Test the exact immutable policy with only its credential path resolved to
  # the existing private provider. Never run the uploaded subscription as policy.
  with tempfile.TemporaryDirectory(prefix='lingxi-mihomo-validate-',dir='/run') as directory:
   config=pathlib.Path(directory)/'config.yaml'
   config.write_bytes(CONFIG_BYTES.replace(b'/run/credentials/lingxi-release-mihomo.service/provider.yaml',str(PROVIDER).encode()))
   config.chmod(0o600)
   execute([str(p.binary),'-t','-d',directory,'-f',str(config)],30,'VALIDATE',str(PROVIDER))
  check(provider_check()==provider,'PROVIDER_CHANGED_DURING_VALIDATION')
  if action=='validate':return {'syntaxValid':True,'provider':provider,'serviceStarted':False}
  check(state['service']['ActiveState'] in ('inactive','active'),'MIHOMO_SERVICE_STATE_CONFLICT')
  # Mihomo requires an explicit safe path for the already approved systemd
  # credential, which is outside its state directory. Grant that exact file.
  dropin=pathlib.Path('/etc/systemd/system/'+SERVICE+'.d/10-provider-path.conf')
  contents=b'[Service]\\nEnvironment=SAFE_PATHS=/run/credentials/lingxi-release-mihomo.service/provider.yaml\\n'
  if present(dropin):check(regular(dropin,4096)==contents,'MIHOMO_DROPIN_CONFLICT')
  else:
   check(state['service']['ActiveState']=='inactive','MIHOMO_MUST_REMAIN_INACTIVE')
   dropin.parent.mkdir(mode=0o755,exist_ok=True)
   fd=os.open(dropin,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o644)
   with os.fdopen(fd,'wb') as out:out.write(contents);out.flush();os.fsync(out.fileno())
   syncdir(dropin.parent)
  execute(['systemctl','daemon-reload'],20,'UNIT_RELOAD')
  execute(['systemctl','start',SERVICE],30,'START')
 active=system_state();check(active['ActiveState']=='active','MIHOMO_NOT_ACTIVE')
 loaded=pathlib.Path('/run/credentials/'+SERVICE+'/provider.yaml')
 check(digest(regular(loaded,2097152))==provider['sha256'],'PROVIDER_NOT_LOADED')
 listeners=[]
 for attempt in range(11):
  ports=execute(['ss','-H','-lntp'],5).decode()
  listeners=[line for line in ports.splitlines() if ':17890 ' in line]
  if listeners:break
  if attempt<10:time.sleep(0.5)
 check(len(listeners)==1 and '127.0.0.1:17890 ' in listeners[0] and 'mihomo' in listeners[0],'MIHOMO_LOOPBACK_UNPROVEN')
 if action=='docker-plan':return docker_plan()
 result={'active':True,'providerLoaded':True,'loopbackOnly':True,'provider':provider,'dockerChanged':False,'enabledByModule':False}
 if action=='probe':
  measurements=[]
  for origin in ['https://ghcr.io/v2/','https://api.github.com/','https://github.com/']:
   started=time.monotonic()
   r=subprocess.run(['curl','--silent','--output','/dev/null','--write-out','%{http_code}','--proxy','http://127.0.0.1:17890','--noproxy','','--proto','=https','--connect-timeout','8','--max-time','20',origin],stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,timeout=22)
   status=r.stdout.decode().strip()
   measurements.append({'origin':origin,'httpStatus':int(status) if status.isdigit() else None,'exitCode':r.returncode,'elapsedMs':round((time.monotonic()-started)*1000),'authenticatedPullVerified':False})
  result['measurements']=measurements
 return result
try:
 with deadline():print(json.dumps(native_action(json.loads(sys.argv[1]))))
except Exception as error:
 known=str(error) if isinstance(error,RuntimeError) and re.fullmatch('[A-Z0-9_]+',str(error)) else 'NATIVE_OPERATION_UNCONFIRMED'
 print(json.dumps({'error':known,'queryBeforeRetry':True}));sys.exit(1)
`
export function nativeSource() {
 const installer=readFileSync(new URL('../release/bootstrap-host/mihomo.py', import.meta.url),'utf8').split("if __name__=='__main__':")[0]
 return installer+maintenance.split('try:\n with deadline():print')[0]
}
export function nativeCommand(side, action, expectedProviderHash) {
 if (!['a','b'].includes(side) || !['query','filter-provider','install','validate','start','probe','docker-plan'].includes(action)) throw Error('INVALID_NATIVE_ACTION')
 if(action==='filter-provider'?!/^[a-f0-9]{64}$/.test(expectedProviderHash??''):expectedProviderHash!==undefined)throw Error('INVALID_PROVIDER_HASH_ARGUMENT')
 const installer = readFileSync(new URL('../release/bootstrap-host/mihomo.py', import.meta.url),'utf8').split("if __name__=='__main__':")[0]
 return `python3 -c ${quote(installer + maintenance)} ${quote(JSON.stringify({host:side,action,...(expectedProviderHash?{expectedProviderHash}:{})}))}`
}
export async function nativeOperation(side, action, {env=process.env,fetcher=fetch,expectedProviderHash}={}) {
 const command=nativeCommand(side,action,expectedProviderHash)
 if (!env.KOMODO_API_KEY || !env.KOMODO_API_SECRET) throw Error('EXISTING_OPERATOR_CREDENTIAL_REQUIRED')
 const response=await fetcher('https://ops.christmas1314.xyz/terminal/execute',{method:'POST',redirect:'error',signal:AbortSignal.timeout(150000),headers:{'content-type':'application/json','x-api-key':env.KOMODO_API_KEY,'x-api-secret':env.KOMODO_API_SECRET},body:JSON.stringify({target:{type:'Server',params:{server:side==='a'?'shanghai-a':'shanghai-b'}},terminal:`issue-514-native-${side}-${action}`,command,init:{command:'bash',recreate:'Never'}})})
 if(!response.ok)throw Error('NATIVE_HTTP_'+response.status)
 const output=await response.text(),rows=output.split(/\r?\n/).map(line=>line.replace(/\x1b\[[0-9;]*[A-Za-z]/g,'').trim()).filter(line=>line.startsWith('{')&&line.endsWith('}')).flatMap(line=>{try{return[JSON.parse(line)]}catch{return[]}})
 if(rows.length!==1)throw Error('NATIVE_RECEIPT_UNCONFIRMED_QUERY_BEFORE_RETRY')
 return {side,action,receipt:rows[0]}
}
