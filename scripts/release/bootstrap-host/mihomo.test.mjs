import test from 'node:test'
import assert from 'node:assert/strict'
import{spawnSync}from'node:child_process'
import{fileURLToPath}from'node:url'
import{readFileSync}from'node:fs'
const tests=String.raw`
import unittest,importlib.util,tempfile,pathlib,hashlib,json,sys,types,os,gzip,time,signal
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('mihomo',sys.argv[1]);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class InstallerTest(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.base=pathlib.Path(self.tmp.name);self.p=m.Paths(root=self.base/'bootstrap',binary=self.base/'usr/local/bin/mihomo',unit=self.base/'etc/systemd/system/unit.service',config=self.base/'etc/lingxi-release/mihomo.yml',credential=self.base/'secret',state=self.base/'var/lib/state');self.profile={'user':None,'group':None};self.creates=0;self.fetches=0;self.data={'action':'install','host':'a'};self.raw=b'fixture-mihomo-binary';self.gzip=gzip.compress(self.raw,mtime=0);self.patches=[patch.object(m,'GZIP_SHA256',hashlib.sha256(self.gzip).hexdigest()),patch.object(m,'GZIP_BYTES',len(self.gzip)),patch.object(m.os,'geteuid',return_value=0),patch.object(m.os,'uname',return_value=types.SimpleNamespace(machine='x86_64'))]
  for p in self.patches:p.start()
 def tearDown(self):
  for p in reversed(self.patches):p.stop()
  self.tmp.cleanup()
 def state(self):return {'LoadState':'loaded' if self.p.unit.exists() else 'not-found','ActiveState':'inactive','UnitFileState':'disabled','SubState':'dead'}
 def users(self):return self.profile
 def create(self,marker):self.creates+=1;self.profile={'user':{'uid':987,'gid':987,'comment':marker,'home':'/nonexistent','shell':'/usr/sbin/nologin'},'group':{'gid':987,'members':[]}}
 def fetch(self,path,credential):self.fetches+=1;path.write_bytes(self.gzip)
 def install(self,hook=lambda phase:None,fetch=None):return m.install(self.data,p=self.p,state=self.state,users=self.users,create=self.create,fetch=fetch or self.fetch,version=lambda path:None,hook=hook)
 def query(self):return m.query({'action':'query','host':'a'},self.p,state=self.state,users=self.users)
 def test_inactive_install_and_exact_replay_preserve_provider_absence(self):
  receipt=self.install();self.assertFalse(receipt['serviceStarted']);self.assertFalse(receipt['enabledByModule']);self.assertFalse(receipt['activationReady']);self.assertEqual(receipt,self.install());self.assertEqual(self.creates,1);self.assertEqual(self.fetches,1);self.assertTrue(self.query()['verified']);self.assertEqual(self.p.binary.read_bytes(),self.raw);self.assertEqual(self.p.unit.read_bytes(),m.UNIT_BYTES);self.assertEqual(self.p.config.read_bytes(),m.CONFIG_BYTES);self.assertEqual(self.p.config.stat().st_mode&0o777,0o600);self.assertFalse(self.p.state.exists());self.assertFalse((self.p.config.parent/'secrets/mihomo-provider.yaml').exists())
 def test_user_creation_and_binary_promotion_crash_query_resume(self):
  for phase in ['user','mihomo']:
   with self.subTest(phase=phase):
    if self.p.intent().exists():self.tearDown();self.setUp()
    def crash(at):
     if at==phase:raise RuntimeError('crash')
    with self.assertRaises(RuntimeError):self.install(hook=crash)
    self.assertFalse(self.p.receipt().exists());self.assertTrue(self.query()['intentVerified']);receipt=self.install();self.assertTrue(self.query()['verified']);self.assertEqual(self.creates,1);self.assertTrue(pathlib.Path(receipt['stage']).exists())
 def test_unowned_binary_unit_config_and_user_are_rejected(self):
  for path in [self.p.binary,self.p.unit,self.p.config]:
   path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(b'unowned')
   with self.assertRaises(RuntimeError):self.install()
   self.assertEqual(path.read_bytes(),b'unowned');path.unlink()
  self.profile={'user':{'uid':123},'group':None}
  with self.assertRaises(RuntimeError):self.install()
  self.assertEqual(self.creates,0);self.assertEqual(self.fetches,0)
 def test_intent_user_or_artifact_drift_is_not_adopted(self):
  def crash(phase):
   if phase=='user':raise RuntimeError('crash')
  with self.assertRaises(RuntimeError):self.install(hook=crash)
  self.profile['user']['comment']='foreign-user'
  with self.assertRaises(RuntimeError):self.install()
  self.assertFalse(self.p.binary.exists())
 def test_wrong_gzip_hash_and_bounded_gunzip_fail_before_promotion(self):
  def corrupt(path,credential):path.write_bytes(b'wrong gzip')
  with self.assertRaises(RuntimeError):self.install(fetch=corrupt)
  with patch.object(m,'RAW_LIMIT',5):
   with self.assertRaises(RuntimeError):self.install()
  self.assertFalse(self.p.intent().exists());self.assertFalse(self.p.binary.exists());self.assertEqual(self.creates,0)
 def test_installed_hash_drift_and_host_change_rejected(self):
  self.install();self.p.binary.write_bytes(b'drift')
  with self.assertRaises(RuntimeError):self.query()
  self.p.binary.write_bytes(self.raw)
  with self.assertRaises(RuntimeError):m.query({'action':'query','host':'b'},self.p,state=self.state,users=self.users)
 def test_invalid_actions_and_total_deadline(self):
  for data in [{'action':'start','host':'a'},{'action':'install','host':'c'},{'action':'install','host':'a','url':'https://evil.example'}]:
   with self.assertRaises(RuntimeError):m.identity(data)
  with patch.object(m,'DEADLINE_SECONDS',0.02):
   with self.assertRaisesRegex(RuntimeError,'MIHOMO_INSTALL_DEADLINE'):
    with m.deadline():time.sleep(0.2)
  self.assertEqual(signal.getitimer(signal.ITIMER_REAL)[0],0)
class DownloadTest(unittest.TestCase):
 def test_fixed_authenticated_endpoint_redirect_refusal_and_exact_compressed_identity(self):
  payload=gzip.compress(b'fixture',mtime=0);secret='fixture-executor-token-'+'x'*32;requests=[];handlers=[]
  class Credential:
   def lstat(self):return types.SimpleNamespace(st_mode=0o100600,st_size=len(secret))
   def stat(self):return types.SimpleNamespace(st_mode=0o100600,st_uid=0)
   def read_bytes(self):return secret.encode()
  class Response:
   def __enter__(self):self.done=False;return self
   def __exit__(self,*args):return False
   def read(self,count):
    if self.done:return b''
    self.done=True;return payload
  def build(handler):
   handlers.append(handler())
   def opened(request,timeout):requests.append(request);return Response()
   return types.SimpleNamespace(open=opened)
  with tempfile.TemporaryDirectory() as directory,patch.object(m,'GZIP_BYTES',len(payload)),patch.object(m,'GZIP_SHA256',hashlib.sha256(payload).hexdigest()),patch.object(m.urllib.request,'build_opener',side_effect=build):
   target=pathlib.Path(directory)/'asset.gz';m.download(target,Credential());self.assertEqual(requests[0].full_url,m.URL);self.assertEqual(requests[0].get_header('Authorization'),'Bearer '+secret);self.assertEqual(target.read_bytes(),payload)
   with self.assertRaisesRegex(RuntimeError,'MIHOMO_REDIRECT_REJECTED'):handlers[0].redirect_request(None,None,302,'Found',{},'https://evil.example')
if __name__=='__main__':unittest.main(argv=['mihomo-tests'])
`;
test('inactive Mihomo preinstall ownership, crash, credential and bounds actor regressions',()=>{
 const result=spawnSync('python3',['-c',tests,fileURLToPath(new URL('./mihomo.py',import.meta.url))],{encoding:'utf8',timeout:20000,env:{PATH:process.env.PATH,PYTHONDONTWRITEBYTECODE:'1'}})
 assert.equal(result.status,0,result.stdout+result.stderr)
})
test('embedded unit and local policy equal fixed reviewed deploy templates',()=>{
 const source=readFileSync(new URL('./mihomo.py',import.meta.url),'utf8')
 for(const [name,path] of [['UNIT_BYTES','../../../deploy/release-host/lingxi-release-mihomo.service'],['CONFIG_BYTES','../../../deploy/release-host/mihomo.example.yml']]){
  const encoded=source.match(new RegExp(`${name}=base64.b64decode\\('([^']+)'\\)`))?.[1]
  assert.ok(encoded);assert.equal(Buffer.from(encoded,'base64').toString(),readFileSync(new URL(path,import.meta.url),'utf8'))
 }
})
