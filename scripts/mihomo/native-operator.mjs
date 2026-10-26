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
def provider_check():
 import yaml
 m=PROVIDER.lstat()
 check(stat.S_ISREG(m.st_mode) and m.st_uid==0 and m.st_gid==0 and stat.S_IMODE(m.st_mode)==0o600 and m.st_size<=2097152,'PROVIDER_METADATA_REJECTED')
 raw=PROVIDER.read_bytes()
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
 def tls(value):
  if isinstance(value,dict):
   check(value.get('skip-cert-verify') not in (True,'true'),'PROVIDER_TLS_BYPASS_REJECTED')
   for item in value.values():tls(item)
  elif isinstance(value,list):
   for item in value:tls(item)
 for node in nodes:
  check(isinstance(node,dict) and isinstance(node.get('name'),str) and node['name'] not in names and isinstance(node.get('server'),str) and type(node.get('port')) is int and 1<=node['port']<=65535,'PROVIDER_NODE_INVALID')
  names.add(node['name']);tls(node)
 return {'sha256':digest(raw),'nodeCount':len(nodes),'bytes':len(raw)}
def execute(args,timeout=25):
 r=subprocess.run(args,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,timeout=timeout)
 check(r.returncode==0,'MIHOMO_COMMAND_UNCONFIRMED')
 return r.stdout
def native_action(data):
 side=data['host'];action=data['action'];p=Paths()
 check(side in ('a','b') and action in ('query','install','validate','start','probe'),'INVALID_NATIVE_ACTION')
 original={'action':'query','host':side}
 idle=release_idle()
 if action=='query':return {**query(original),'releaseIdle':idle}
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
   execute([str(p.binary),'-t','-d',directory,'-f',str(config)],30)
  check(provider_check()==provider,'PROVIDER_CHANGED_DURING_VALIDATION')
  if action=='validate':return {'syntaxValid':True,'provider':provider,'serviceStarted':False}
  check(state['service']['ActiveState'] in ('inactive','active'),'MIHOMO_SERVICE_STATE_CONFLICT')
  execute(['systemctl','daemon-reload'],20)
  execute(['systemctl','start',SERVICE],30)
 active=system_state();check(active['ActiveState']=='active','MIHOMO_NOT_ACTIVE')
 loaded=pathlib.Path('/run/credentials/'+SERVICE+'/provider.yaml')
 check(digest(regular(loaded,2097152))==provider['sha256'],'PROVIDER_NOT_LOADED')
 ports=execute(['ss','-H','-lntp'],15).decode()
 listeners=[line for line in ports.splitlines() if ':17890 ' in line]
 check(len(listeners)==1 and '127.0.0.1:17890 ' in listeners[0] and 'mihomo' in listeners[0],'MIHOMO_LOOPBACK_UNPROVEN')
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
export function nativeCommand(side, action) {
 if (!['a','b'].includes(side) || !['query','install','validate','start','probe'].includes(action)) throw Error('INVALID_NATIVE_ACTION')
 const installer = readFileSync(new URL('../release/bootstrap-host/mihomo.py', import.meta.url),'utf8').split("if __name__=='__main__':")[0]
 return `python3 -c ${quote(installer + maintenance)} ${quote(JSON.stringify({host:side,action}))}`
}
export async function nativeOperation(side, action, {env=process.env,fetcher=fetch}={}) {
 const command=nativeCommand(side,action)
 if (!env.KOMODO_API_KEY || !env.KOMODO_API_SECRET) throw Error('EXISTING_OPERATOR_CREDENTIAL_REQUIRED')
 const response=await fetcher('https://ops.christmas1314.xyz/terminal/execute',{method:'POST',redirect:'error',signal:AbortSignal.timeout(150000),headers:{'content-type':'application/json','x-api-key':env.KOMODO_API_KEY,'x-api-secret':env.KOMODO_API_SECRET},body:JSON.stringify({target:{type:'Server',params:{server:side==='a'?'shanghai-a':'shanghai-b'}},terminal:`issue-514-native-${side}-${action}`,command,init:{command:'bash',recreate:'Never'}})})
 if(!response.ok)throw Error('NATIVE_HTTP_'+response.status)
 const output=await response.text(),rows=output.split(/\r?\n/).map(line=>line.replace(/\x1b\[[0-9;]*[A-Za-z]/g,'').trim()).filter(line=>line.startsWith('{')&&line.endsWith('}')).flatMap(line=>{try{return[JSON.parse(line)]}catch{return[]}})
 if(rows.length!==1)throw Error('NATIVE_RECEIPT_UNCONFIRMED_QUERY_BEFORE_RETRY')
 return {side,action,receipt:rows[0]}
}
