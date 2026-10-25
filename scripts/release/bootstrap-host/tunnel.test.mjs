import test from 'node:test'
import assert from 'node:assert/strict'
import{spawnSync}from'node:child_process'
import{fileURLToPath}from'node:url'
const tests=String.raw`
import unittest,importlib.util,tempfile,pathlib,hashlib,json,base64,sys,types,time,signal,fcntl,os
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('tunnel',sys.argv[1]);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class TunnelTest(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.base=pathlib.Path(self.tmp.name);self.root=self.base/'connector';self.unit=self.base/'lingxi-release-tunnel.service';self.token=self.base/'tunnel-token';self.token.write_text('never-output-token');self.token.chmod(0o600)
  self.data={'action':'install','host':'a','tunnelId':'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','origin':m.ORIGIN,'remoteConfigSha256':'a'*64};self.active=False;self.enabled=False;self.commands=[];self.binary=b'fixture-cloudflared-binary';self.fetches=0
  self.patches=[patch.object(m,'BINARY_SHA256',hashlib.sha256(self.binary).hexdigest()),patch.object(m.os,'geteuid',return_value=0),patch.object(m.os,'uname',return_value=types.SimpleNamespace(machine='x86_64')),patch.object(m,'token_identity',return_value=hashlib.sha256(self.token.read_bytes()).hexdigest())]
  for p in self.patches:p.start()
 def tearDown(self):
  for p in reversed(self.patches):p.stop()
  self.tmp.cleanup()
 def run_system(self,args):
  self.commands.append(args)
  if args[0]=='show':
   self.assertEqual(args[1],m.SERVICE)
   return '\n'.join([f'LoadState={"loaded" if self.unit.exists() else "not-found"}',f'ActiveState={"active" if self.active else "inactive"}',f'SubState={"running" if self.active else "dead"}',f'FragmentPath={self.unit if self.unit.exists() else ""}',f'MainPID={"303" if self.active else "0"}',f'UnitFileState={"enabled" if self.enabled else "disabled"}'])
  self.assertIn(args[0],['daemon-reload','start','enable'])
  if args[0]!='daemon-reload':self.assertEqual(args[1:], [m.SERVICE])
  if args[0]=='start':self.active=True
  if args[0]=='enable':self.enabled=True
  return ''
 def fetch(self,path):self.fetches+=1;path.write_bytes(self.binary);path.chmod(0o755)
 def run_action(self,action='install',hook=lambda phase:None,fetch=None):
  return m.execute({**self.data,'action':action},root=self.root,unit=self.unit,token=self.token,run=self.run_system,fetch=fetch or self.fetch,hook=hook,version_check=lambda path:'cloudflared version '+m.VERSION+' (fixture)')
 def test_install_is_owned_idempotent_and_does_not_start(self):
  first=self.run_action();self.assertEqual(first,self.run_action());self.assertEqual(self.fetches,1);self.assertFalse(self.active);self.assertTrue(self.run_action('query')['verified']);self.assertNotIn(['start',m.SERVICE],self.commands)
  unit=self.unit.read_text();self.assertIn('LoadCredential=tunnel-token:/etc/lingxi-release/secrets/tunnel-token',unit);self.assertIn('--token-file %d/tunnel-token',unit);self.assertNotIn('never-output-token',unit);self.assertNotIn('Komodo',unit);self.assertIn('--config /dev/null',unit)
 def test_current_switch_crash_is_queried_and_resumed(self):
  def crash(phase):
   if phase=='current':raise RuntimeError('simulated crash')
  with self.assertRaises(RuntimeError):self.run_action(hook=crash)
  query=self.run_action('query');self.assertIsNone(query['receipt']);self.assertTrue(query['intentVerified']);self.run_action();self.assertEqual(self.fetches,1);self.assertTrue(self.run_action('query')['verified'])
 def test_start_and_enable_response_loss_do_not_repeat_effect(self):
  self.run_action()
  def crash(phase):
   if phase in ['started','enabled']:raise RuntimeError('lost response')
  with self.assertRaises(RuntimeError):self.run_action('start',hook=crash)
  self.assertEqual(self.run_action('query')['service']['ActiveState'],'active');self.run_action('start');self.run_action('start');self.assertEqual(self.commands.count(['start',m.SERVICE]),1)
  with self.assertRaises(RuntimeError):self.run_action('enable',hook=crash)
  self.run_action('enable');self.assertEqual(self.commands.count(['enable',m.SERVICE]),1)
 def test_unowned_unit_partial_version_and_bad_binary_are_rejected(self):
  self.unit.write_text('unowned')
  with self.assertRaises(RuntimeError):self.run_action()
  self.assertEqual(self.unit.read_text(),'unowned');self.assertEqual(self.fetches,0);self.unit.unlink()
  def bad(path):path.write_bytes(b'corrupt')
  with self.assertRaises(RuntimeError):self.run_action(fetch=bad)
  self.assertFalse((self.root/'current').is_symlink());(self.root/'versions'/m.VERSION).mkdir()
  with self.assertRaises(RuntimeError):self.run_action()
 def test_drift_active_upgrade_and_input_allowlist_fail_closed(self):
  self.active=True
  with self.assertRaises(RuntimeError):self.run_action()
  self.active=False;self.run_action();self.unit.write_text('external drift')
  with self.assertRaises(RuntimeError):self.run_action('start')
  for update in [{'action':'shell'},{'origin':'http://0.0.0.0:17951'},{'token':'plaintext'},{'host':'c'}]:
   with self.assertRaises(RuntimeError):m.validate({**self.data,**update})
 def test_owned_upgrade_requires_previous_receipt(self):
  old=self.root/'versions'/'2026.9.1';old.mkdir(parents=True);self.root.chmod(0o755);(self.root/'versions').chmod(0o755);old.chmod(0o755);(old/'cloudflared').write_bytes(b'old');(self.root/'current').symlink_to(old);self.unit.write_bytes(b'old-unit')
  with self.assertRaises(RuntimeError):self.run_action()
  receipt={'identity':{key:self.data[key] for key in ('host','tunnelId','origin','remoteConfigSha256')},'version':'2026.9.1','tokenSha256':hashlib.sha256(self.token.read_bytes()).hexdigest(),'binarySha256':hashlib.sha256(b'old').hexdigest(),'unitSha256':hashlib.sha256(b'old-unit').hexdigest()}
  old_receipt=self.root/'install-2026.9.1.json';old_receipt.write_text(json.dumps(receipt));self.run_action();self.assertTrue(old_receipt.exists());self.assertEqual((old/'cloudflared').read_bytes(),b'old');self.assertTrue(self.run_action('query')['verified'])
 def test_query_reports_metadata_and_busy_lock_without_filesystem_mutation(self):
  result=self.run_action('query');self.assertEqual(result['staging'],{'count':0,'bytes':0});self.assertEqual(result['installationLock'],{'present':False,'busy':False});self.assertFalse(self.root.exists())
  self.root.mkdir();stage=self.root/'.stage-fixture';stage.mkdir();(stage/'partial-binary').write_bytes(b'123456789');lock=self.root/'.lock';lock.write_bytes(b'existing-lock');lock.chmod(0o600);before=(lock.stat().st_mode,lock.stat().st_mtime_ns,lock.read_bytes())
  with open(lock,'rb') as held:
   fcntl.flock(held,fcntl.LOCK_EX|fcntl.LOCK_NB)
   with patch.object(m,'regular',side_effect=AssertionError('metadata query must not read staged contents')):result=self.run_action('query')
   self.assertEqual(result['staging'],{'count':1,'bytes':9});self.assertEqual(result['installationLock'],{'present':True,'busy':True})
  self.assertFalse(self.run_action('query')['installationLock']['busy']);self.assertEqual((lock.stat().st_mode,lock.stat().st_mtime_ns,lock.read_bytes()),before)
 def test_query_receipt_requires_original_identity(self):
  self.run_action();self.data['remoteConfigSha256']='b'*64
  with self.assertRaises(RuntimeError):self.run_action('query')
 def test_download_and_entire_install_have_total_deadlines(self):
  class SlowResponse:
   def __enter__(self):return self
   def __exit__(self,*args):return False
   def read(self,count):time.sleep(0.2);return b'never-finished'
  opener=types.SimpleNamespace(open=lambda *args,**kwargs:SlowResponse())
  with patch.object(m,'DOWNLOAD_DEADLINE_SECONDS',0.03),patch.object(m.urllib.request,'build_opener',return_value=opener):
   began=time.monotonic()
   with self.assertRaisesRegex(RuntimeError,'TUNNEL_TOTAL_DEADLINE_EXCEEDED'):m.download(self.base/'download')
   self.assertLess(time.monotonic()-began,0.15)
  def slow_fetch(path):time.sleep(0.2)
  with patch.object(m,'INSTALL_DEADLINE_SECONDS',0.03):
   began=time.monotonic()
   with self.assertRaisesRegex(RuntimeError,'TUNNEL_TOTAL_DEADLINE_EXCEEDED'):self.run_action(fetch=slow_fetch)
   self.assertLess(time.monotonic()-began,0.15)
  result=self.run_action('query');self.assertIsNone(result['receipt']);self.assertIsNone(result['intent']);self.assertEqual(result['staging']['count'],1);self.assertFalse((self.root/'current').is_symlink());self.assertEqual(signal.getitimer(signal.ITIMER_REAL)[0],0)
class AbortTest(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.base=pathlib.Path(self.tmp.name);self.root=self.base/'root';self.root.mkdir();self.unit=self.base/'unit';self.proc=self.base/'proc';self.proc.mkdir();self.pid=424242;self.source='fixture legacy source';self.identity={'host':'a','tunnelId':'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','origin':m.ORIGIN,'remoteConfigSha256':'a'*64};self.data={'action':'abort-download',**self.identity};self.signals=[]
  lock=self.root/'.lock';lock.write_bytes(b'preserve');metadata=lock.stat();self.lock_line=f'1: FLOCK ADVISORY WRITE {self.pid} {os.major(metadata.st_dev):02x}:{os.minor(metadata.st_dev):02x}:{metadata.st_ino} 0 EOF';(self.proc/'locks').write_text(self.lock_line+'\n')
  process=self.proc/str(self.pid);process.mkdir();(process/'status').write_text('Uid: 0 0 0 0\n');(process/'exe').symlink_to('/usr/bin/python3.12');self.setcmd(self.source,{'action':'install',**self.identity})
  stage=self.root/'.stage-keep';stage.mkdir();(stage/'cloudflared').write_bytes(b'partial-data');self.patches=[patch.object(m,'LEGACY_SOURCE_SHA256',hashlib.sha256(self.source.encode()).hexdigest()),patch.object(m.os,'geteuid',return_value=0)]
  for p in self.patches:p.start()
 def tearDown(self):
  for p in reversed(self.patches):p.stop()
  self.tmp.cleanup()
 def setcmd(self,source,data): (self.proc/str(self.pid)/'cmdline').write_bytes(b'python3\0-c\0'+source.encode()+b'\0'+json.dumps(data).encode()+b'\0')
 def run_system(self,args):return 'LoadState=not-found\nActiveState=inactive\nMainPID=0\n'
 def abort(self,opener=None):
  def open_pidfd(pid,flags):return os.open('/dev/null',os.O_RDONLY)
  return m.abort_download(self.data,root=self.root,unit=self.unit,proc=self.proc,run=self.run_system,pidfd_open=opener or open_pidfd,send_signal=lambda *args:self.signals.append(args),exited=lambda fd:True)
 def test_exact_owner_pidfd_term_preserves_staging(self):
  result=self.abort();self.assertEqual(result['pid'],self.pid);self.assertTrue(result['processExited']);self.assertEqual(len(self.signals),1);self.assertEqual(self.signals[0][1],signal.SIGTERM);self.assertEqual((self.root/'.stage-keep/cloudflared').read_bytes(),b'partial-data');self.assertEqual((self.root/'.lock').read_bytes(),b'preserve')
 def test_wrong_pid_source_input_and_uid_refuse(self):
  for changed in ['pid','source','input','uid']:
   with self.subTest(changed=changed):
    (self.proc/'locks').write_text(self.lock_line+'\n');self.setcmd(self.source,{'action':'install',**self.identity});(self.proc/str(self.pid)/'status').write_text('Uid: 0 0 0 0\n')
    if changed=='pid':(self.proc/'locks').write_text(self.lock_line.replace(str(self.pid),'424243',1)+'\n')
    if changed=='source':self.setcmd('wrong script',{'action':'install',**self.identity})
    if changed=='input':self.setcmd(self.source,{'action':'install',**self.identity,'remoteConfigSha256':'b'*64})
    if changed=='uid':(self.proc/str(self.pid)/'status').write_text('Uid: 1000 1000 1000 1000\n')
    with self.assertRaises((RuntimeError,FileNotFoundError)):self.abort()
  self.assertEqual(self.signals,[])
 def test_intent_present_or_appears_after_pidfd_refuses(self):
  intent=self.root/('intent-'+m.VERSION+'.json');intent.write_text('{}')
  with self.assertRaises(RuntimeError):self.abort()
  intent.unlink()
  def open_pidfd(pid,flags):intent.write_text('{}');return os.open('/dev/null',os.O_RDONLY)
  with self.assertRaises(RuntimeError):self.abort(opener=open_pidfd)
  self.assertEqual(self.signals,[])
 def test_pidfd_unavailable_refuses_without_numeric_pid_fallback(self):
  with patch.object(m.os,'pidfd_open',None),patch.object(m.signal,'pidfd_send_signal',None):
   with self.assertRaisesRegex(RuntimeError,'TUNNEL_ABORT_PIDFD_UNAVAILABLE'):m.abort_download(self.data,root=self.root,unit=self.unit,proc=self.proc,run=self.run_system)
  self.assertEqual(self.signals,[])
class DownloadSourceTest(unittest.TestCase):
 def test_release_api_uses_fixed_origin_private_header_and_rejects_redirect(self):
  binary=b'official-fixture-binary';secret='fixture-executor-token-'+'a'*32;requests=[];handlers=[]
  class Credential:
   def is_file(self):return True
   def is_symlink(self):return False
   def read_bytes(self):return secret.encode()
   def stat(self):return types.SimpleNamespace(st_uid=0,st_mode=0o100600)
  class Response:
   def __enter__(self):self.done=False;return self
   def __exit__(self,*args):return False
   def read(self,count):
    if self.done:return b''
    self.done=True;return binary
  def build(handler):
   handlers.append(handler())
   def opened(request,timeout):requests.append(request);return Response()
   return types.SimpleNamespace(open=opened)
  with tempfile.TemporaryDirectory() as directory,patch.object(m,'BINARY_SHA256',hashlib.sha256(binary).hexdigest()),patch.object(m.urllib.request,'build_opener',side_effect=build):
   m._download(pathlib.Path(directory)/'release-api','release-api',Credential());self.assertEqual(requests[-1].full_url,m.RELEASE_API_URL);self.assertEqual(requests[-1].get_header('Authorization'),'Bearer '+secret)
   with self.assertRaisesRegex(RuntimeError,'TUNNEL_RELEASE_API_REDIRECT_REJECTED'):handlers[-1].redirect_request(None,None,302,'Found',{},'https://evil.example/asset')
   m._download(pathlib.Path(directory)/'github','github',Credential());self.assertEqual(requests[-1].full_url,m.URL);self.assertIsNone(requests[-1].get_header('Authorization'))
   with self.assertRaises(RuntimeError):m._download(pathlib.Path(directory)/'invalid','https://evil.example',Credential())
 def test_source_selection_is_optional_fixed_and_keeps_hash_gate(self):
  data={'action':'install','host':'a','tunnelId':'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','origin':m.ORIGIN,'remoteConfigSha256':'a'*64}
  self.assertEqual(m.validate(data),m.validate({**data,'downloadSource':'release-api'}))
  for bad in [{'downloadSource':'mirror'},{'downloadUrl':'https://evil.example'},{'executorToken':'plaintext'}]:
   with self.assertRaises(RuntimeError):m.validate({**data,**bad})
  class Credential:
   def is_file(self):return True
   def is_symlink(self):return False
   def read_bytes(self):return b'x'*40
   def stat(self):return types.SimpleNamespace(st_uid=0,st_mode=0o100600)
  class Response:
   def __enter__(self):self.done=False;return self
   def __exit__(self,*args):return False
   def read(self,count):
    if self.done:return b''
    self.done=True;return b'corrupt'
  with tempfile.TemporaryDirectory() as directory,patch.object(m.urllib.request,'build_opener',return_value=types.SimpleNamespace(open=lambda *args,**kwargs:Response())):
   with self.assertRaisesRegex(RuntimeError,'TUNNEL_BINARY_HASH_MISMATCH'):m._download(pathlib.Path(directory)/'bad','release-api',Credential())
class CredentialTest(unittest.TestCase):
 def test_existing_token_identity_and_private_mode(self):
  class Path:
   def is_file(self):return True
   def is_symlink(self):return False
   def read_bytes(self):return base64.b64encode(json.dumps({'t':'a'*36,'s':'never-print-secret'}).encode())
   def stat(self):return types.SimpleNamespace(st_uid=0,st_mode=0o100600)
  token=Path();self.assertEqual(len(m.token_identity(token,'a'*36)),64)
  with self.assertRaises(RuntimeError):m.token_identity(token,'b'*36)
  token.stat=lambda:types.SimpleNamespace(st_uid=0,st_mode=0o100644)
  with self.assertRaises(RuntimeError):m.token_identity(token,'a'*36)
if __name__=='__main__':unittest.main(argv=['tunnel-tests'])
`;
test('standalone fixed Tunnel install/start/enable/reconcile actor regressions',()=>{
 const result=spawnSync('python3',['-c',tests,fileURLToPath(new URL('./tunnel.py',import.meta.url))],{encoding:'utf8',timeout:20000,env:{PATH:process.env.PATH,PYTHONDONTWRITEBYTECODE:'1'}})
 assert.equal(result.status,0,result.stdout+result.stderr)
})
