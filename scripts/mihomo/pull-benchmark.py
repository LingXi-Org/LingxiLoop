# One immutable Docker pull; never changes a container, tag, config or service.
import base64,hashlib,json,pathlib,re,sqlite3,subprocess,sys,time
started=time.monotonic();result={'status':'unverified','pullAttempts':0,'applicationSwitched':False,'cacheState':'unknown','startedAt':time.time()}
def check(value,code):
 if not value:raise RuntimeError(code)
def run(args,seconds=15):return subprocess.run(args,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=seconds,env={'PATH':'/usr/sbin:/usr/bin:/sbin:/bin'})
def inspect(ref):
 r=run(['docker','image','inspect',ref]);return json.loads(r.stdout)[0] if r.returncode==0 else None
try:
 spec=json.loads(base64.b64decode(sys.argv[1]));image=spec['image'];ref=image['ref'];config=image['configDigest'];observe=len(sys.argv)>2 and sys.argv[2]=='query'
 verifier=base64.b64decode(spec['verifier']).decode()
 check(pathlib.Path('/opt/lingxi-release/node').is_file(),'INSTALLED_EXECUTOR_NODE_REQUIRED')
 def verify(actual):
  checked=subprocess.run(['/opt/lingxi-release/node','--input-type=module','-e',verifier],input=json.dumps({'actual':actual,'image':image}).encode(),stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=20,env={'PATH':'/usr/sbin:/usr/bin:/sbin:/bin'})
  check(checked.returncode==0,'DOCKER_IMAGE_IDENTITY_MISMATCH');return json.loads(checked.stdout)
 check(re.fullmatch(r'ghcr.io/lingxi-org/[a-z0-9._-]+@sha256:[a-f0-9]{64}',ref) and ref.endswith(image['digest']),'IMMUTABLE_REF_REQUIRED')
 expected=json.loads(base64.b64decode(image['ociProof']['config']))
 check('sha256:'+hashlib.sha256(base64.b64decode(image['ociProof']['config'])).hexdigest()==config,'CONFIG_PROOF_INVALID')
 db=sqlite3.connect('file:/var/lib/lingxi-release/journal.sqlite?mode=ro',uri=True,timeout=2)
 check(db.execute("SELECT count(*) FROM operations WHERE status IN ('intent','running','uncertain')").fetchone()[0]==0 and db.execute('SELECT count(*) FROM reservations').fetchone()[0]==0,'RELEASE_NOT_IDLE');db.close()
 info=run(['docker','info','--format','{{json .}}']);check(info.returncode==0,'DOCKER_UNAVAILABLE');info=json.loads(info.stdout)
 check(info.get('HttpProxy')=='http://127.0.0.1:17890' and info.get('HttpsProxy')=='http://127.0.0.1:17890','APPROVED_DAEMON_PROXY_REQUIRED')
 before=inspect(ref);result['imagePresentBefore']=bool(before);result['cacheState']='image-already-present' if before else 'image-not-present-layer-cache-unknown'
 if observe:
  result.update(status='observed-verified' if before else 'observed-unverified',identity=verify(before) if before else None)
  result['elapsedSeconds']=round(time.monotonic()-started,3);print(json.dumps(result));sys.exit(0)
 result['pullAttempts']=1
 pulled=run(['docker','image','pull','--platform','linux/amd64',ref],180)
 check(pulled.returncode==0,'DOCKER_PULL_UNCONFIRMED')
 actual=inspect(ref)
 check(actual,'DOCKER_IMAGE_MISSING');identity=verify(actual)
 result.update(status='pull-load-verified',identity=identity,configDigest=config,rootfsLayers=len(actual['RootFS']['Layers']),ref=ref)
except subprocess.TimeoutExpired:result.update(error='DOCKER_PULL_OUTCOME_UNCERTAIN',queryBeforeRetry=True)
except Exception as error:result.update(error=str(error) if isinstance(error,RuntimeError) and re.fullmatch('[A-Z0-9_]+',str(error)) else 'PULL_UNCONFIRMED',queryBeforeRetry=True)
result['elapsedSeconds']=round(time.monotonic()-started,3)
print(json.dumps(result))
