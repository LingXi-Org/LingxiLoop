"""Bounded full-image download comparison. No Docker/config/service mutation."""
import base64,hashlib,json,pathlib,re,signal,sys,time,urllib.request,urllib.parse,urllib.error
from datetime import datetime,timezone
from concurrent.futures import ThreadPoolExecutor,wait,FIRST_COMPLETED
from threading import Lock,Event

class Refusal(Exception):pass
def require(value,code):
 if not value:raise Refusal(code)
def sha(raw):return 'sha256:'+hashlib.sha256(raw).hexdigest()
class SafeRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,request,fp,code,msg,headers,newurl):
  url=urllib.parse.urlsplit(newurl)
  require(url.scheme=='https' and (url.hostname=='ghcr.io' or (url.hostname or '').endswith('.githubusercontent.com')),'REDIRECT_ORIGIN_REFUSED')
  result=super().redirect_request(request,fp,code,msg,headers,newurl)
  result.remove_header('Authorization')
  return result
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*args,**kwargs):raise Refusal('REDIRECT_REFUSED')
def benchmark(spec):
 require(spec['route'] in ('registry','r2'),'INVALID_ROUTE')
 image=spec['image'];route=spec['route'];started=time.monotonic();deadline=started+180
 concurrency=spec.get('concurrency',1);require(concurrency in (1,3),'CONCURRENCY_REFUSED');lock=Lock();stop=Event()
 metrics={'route':route,'concurrency':concurrency,'startedAt':datetime.now(timezone.utc).isoformat(),'status':'unverified','retries':0,'verifiedObjects':0,'verifiedBytes':0,'requests':0,'dockerChanged':False,'imageLoaded':False,'applicationSwitched':False,'localDownloadCacheUsed':False,'edgeCacheState':'unknown','configDigest':image['configDigest']}
 direct=urllib.request.build_opener(urllib.request.ProxyHandler({}),NoRedirect())
 proxy=urllib.request.build_opener(urllib.request.ProxyHandler({'https':'http://127.0.0.1:17890'}),SafeRedirect())
 def remaining():
  value=deadline-time.monotonic();require(value>0,'BENCHMARK_DEADLINE');require(not stop.is_set(),'BENCHMARK_ABORTED');return min(20,value)
 def request(opener,url,headers,expected=None,size=None,limit=2097152):
  remaining()
  with lock:metrics['requests']+=1
  digest=hashlib.sha256();total=0;chunks=[]
  with opener.open(urllib.request.Request(url,headers=headers),timeout=remaining()) as response:
   require(response.status==200,'HTTP_STATUS_REFUSED')
   while True:
    remaining();chunk=response.read(256*1024)
    if not chunk:break
    total+=len(chunk);require(total<=(size if size is not None else limit),'OBJECT_SIZE_EXCEEDED');digest.update(chunk)
    if expected is None:chunks.append(chunk)
  if expected is None:return b''.join(chunks)
  require(total==size and 'sha256:'+digest.hexdigest()==expected,'OBJECT_IDENTITY_MISMATCH')
  with lock:metrics['verifiedObjects']+=1;metrics['verifiedBytes']+=total
 def batch(items,transfer):
  if concurrency==1:
   for item in items:transfer(item)
   return
  pending=set();iterator=iter(items)
  with ThreadPoolExecutor(max_workers=concurrency) as pool:
   def submit():
    try:pending.add(pool.submit(transfer,next(iterator)));return True
    except StopIteration:return False
   for _ in range(concurrency):submit()
   try:
    while pending:
     done,_=wait(pending,return_when=FIRST_COMPLETED)
     for result in done:result.result()
     pending.difference_update(done)
     for _ in done:submit()
   except Exception:
    stop.set()
    for future in pending:future.cancel()
    raise
 try:
  for field in ('configDigest','platformDigest','digest'):require(re.fullmatch('sha256:[a-f0-9]{64}',image[field]),'INVALID_IMAGE_IDENTITY')
  if route=='registry':
   match=re.fullmatch('ghcr.io/(lingxi-org/[a-z0-9._-]+)@sha256:[a-f0-9]{64}',image['ref']);require(match,'REGISTRY_REF_REFUSED');repo=match[1]
   headers={};docker=pathlib.Path('/root/.docker/config.json')
   if docker.is_file() and not docker.is_symlink():
    auth=json.loads(docker.read_text()).get('auths',{}).get('ghcr.io',{}).get('auth')
    if auth:headers['Authorization']='Basic '+auth
   token=json.loads(request(proxy,'https://ghcr.io/token?'+urllib.parse.urlencode({'service':'ghcr.io','scope':'repository:'+repo+':pull'}),headers))
   bearer=token.get('token') or token.get('access_token');require(isinstance(bearer,str) and bearer,'REGISTRY_TOKEN_MISSING')
   headers={'Authorization':'Bearer '+bearer,'Accept':'application/vnd.oci.image.index.v1+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json'}
   index=base64.b64decode(image['ociProof']['index']);manifest=base64.b64decode(image['ociProof']['manifest']);config=base64.b64decode(image['ociProof']['config'])
   require(sha(index)==image['digest'] and sha(manifest)==image['platformDigest'] and sha(config)==image['configDigest'],'MANIFEST_PROOF_MISMATCH')
   base='https://ghcr.io/v2/'+repo
   request(proxy,base+'/manifests/'+image['digest'],headers,image['digest'],len(index))
   request(proxy,base+'/manifests/'+image['platformDigest'],headers,image['platformDigest'],len(manifest))
   request(proxy,base+'/blobs/'+image['configDigest'],headers,image['configDigest'],len(config))
   layers=json.loads(manifest)['layers'];require(len(layers)<=128,'LAYER_LIMIT')
   def layer_request(layer):
    require(re.fullmatch('sha256:[a-f0-9]{64}',layer['digest']) and 0<=layer['size']<=536870912,'LAYER_IDENTITY_REFUSED')
    request(proxy,base+'/blobs/'+layer['digest'],headers,layer['digest'],layer['size'])
   batch(layers,layer_request)
   metrics['authenticatedRegistryVerified']=True
  else:
   token=pathlib.Path('/etc/lingxi-release/secrets/executor-token').read_text().strip()
   require(32<=len(token)<=4096,'EXISTING_EXECUTOR_CREDENTIAL_REQUIRED')
   def part_request(part):
    require(re.fullmatch('sha256:[a-f0-9]{64}',part['sha256']) and 0<part['size']<=8388608,'PART_IDENTITY_REFUSED')
    request(direct,'https://release.lingxilearn.cn/v1/artifact-blobs/'+part['sha256'][7:],{'Authorization':'Bearer '+token},part['sha256'],part['size'])
   batch(image['archive']['parts'],part_request)
  metrics['status']='download-verified'
 except urllib.error.HTTPError as error:metrics.update(error='HTTP_'+str(error.code),httpStatus=error.code)
 except Refusal as error:metrics['error']=str(error)
 except Exception:metrics['error']='DOWNLOAD_UNCONFIRMED'
 metrics['elapsedSeconds']=round(time.monotonic()-started,3)
 metrics['verifiedMiBPerSecond']=round(metrics['verifiedBytes']/1048576/max(.001,time.monotonic()-started),3)
 return metrics
if __name__=='__main__':
 def expired(*_):raise Refusal('BENCHMARK_DEADLINE')
 signal.signal(signal.SIGALRM,expired);signal.alarm(205)
 try:print(json.dumps(benchmark(json.loads(base64.b64decode(sys.argv[1])))))
 except Exception:print(json.dumps({'status':'unverified','error':'BENCHMARK_INPUT_OR_DEADLINE'}));sys.exit(1)
