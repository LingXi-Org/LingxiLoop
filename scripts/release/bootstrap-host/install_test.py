import unittest, importlib.util, tempfile, pathlib, hashlib, io, tarfile, base64, json, contextlib
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('installer',pathlib.Path(__file__).with_name('install.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class InstallTest(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.base=pathlib.Path(self.tmp.name);self.root=self.base/'opt';self.root.mkdir();self.unit=self.base/'unit.service'
        node=self.root/m.NODE;(node/'bin').mkdir(parents=True);(node/'bin/node').write_bytes(b'node-fixture')
        (node/'bootstrap-node.json').write_text(json.dumps({'archiveSha256':m.NODE_SHA,'binarySha256':m.digest(node/'bin/node')}))
        self.mock=patch.object(m.subprocess,'check_output',return_value='v22.23.3\n');self.mock.start();self.uid=patch.object(m.os,'geteuid',return_value=0);self.uid.start();self.arch=patch.object(m.os,'uname',return_value=type('Uname',(),{'machine':'x86_64'})());self.arch.start()
    def tearDown(self): self.mock.stop();self.uid.stop();self.arch.stop();self.tmp.cleanup()
    def data(self,letter='a',modern=False):
        buf=io.BytesIO()
        with tarfile.open(fileobj=buf,mode='w:gz') as tar:
            for path,content in [('repo/scripts/release-host/server.mjs','// '+letter),('repo/deploy/release-host/lingxi-release-host.service','[Service]\nExecStart='+('/opt/lingxi-release/'+m.NODE+'/bin/node' if modern else '/usr/bin/node')+' --experimental-sqlite scripts/release-host/server.mjs /etc/lingxi-release/policy.json\nLoadCredential=executor-token:/etc/lingxi-release/secrets/executor-token\n'+('' if modern else 'LoadCredential=access-client-id:/etc/lingxi-release/secrets/access-client-id\n'))]:
                body=content.encode();info=tarfile.TarInfo(path);info.size=len(body);tar.addfile(info,io.BytesIO(body))
        raw=buf.getvalue();return {'opsSha':letter*40,'bundleSha256':hashlib.sha256(raw).hexdigest(),'bundleBase64':base64.b64encode(raw).decode()}
    def run_install(self,data,hook=lambda phase:None,stopped=lambda:None):
        with contextlib.redirect_stdout(io.StringIO()): return m.install(data,root=self.root,unit=self.unit,stopped=stopped,hook=hook)
    def test_upgrade_crash_at_unit_or_current_resumes_with_intent_and_preserves_old(self):
        for phase in ['unit','current']:
            with self.subTest(phase=phase):
                if (self.root/'current').exists(): self.tearDown();self.setUp()
                old=self.run_install(self.data());old_path=self.root/('install-'+'a'*40+'.json');saved=old_path.read_bytes()
                old['version']=1;old_path.write_text(json.dumps(old));saved=old_path.read_bytes()
                data=self.data('b',True)
                def crash(at):
                    if at==phase: raise RuntimeError('simulated process death')
                with self.assertRaises(RuntimeError): self.run_install(data,hook=crash)
                self.assertFalse((self.root/('install-'+'b'*40+'.json')).exists())
                query=m.query_install('b'*40,self.root,self.unit);self.assertTrue(query['intentFilesVerified']);self.assertIsNone(query['receipt'])
                receipt=self.run_install(data);self.assertEqual(self.run_install(data),receipt);self.assertTrue(m.query_install('b'*40,self.root,self.unit)['verified']);self.assertEqual(old_path.read_bytes(),saved);self.assertTrue((self.root/'versions'/('a'*40)).exists())
    def test_unowned_unit_and_missing_previous_receipt_rejected_before_pointer_change(self):
        self.unit.write_text('unowned')
        with self.assertRaises(RuntimeError): self.run_install(self.data())
        self.assertFalse((self.root/'current').is_symlink());self.unit.unlink();self.run_install(self.data());(self.root/('install-'+'a'*40+'.json')).unlink();before=(self.root/'current').readlink()
        with self.assertRaises(RuntimeError): self.run_install(self.data('b',True))
        self.assertEqual((self.root/'current').readlink(),before)
    def test_active_service_refuses_upgrade_before_mutation(self):
        self.run_install(self.data());old=self.unit.read_bytes();pointer=(self.root/'current').readlink()
        def active(): raise RuntimeError('executor still active')
        with self.assertRaises(RuntimeError): self.run_install(self.data('b',True),stopped=active)
        self.assertEqual(self.unit.read_bytes(),old);self.assertEqual((self.root/'current').readlink(),pointer);self.assertFalse((self.root/('install-intent-'+'b'*40+'.json')).exists())
    def test_partial_version_requires_intent_and_exact_hashes(self):
        data=self.data();(self.root/'versions'/data['opsSha']).mkdir(parents=True)
        with self.assertRaises(RuntimeError): self.run_install(data)
        self.assertFalse((self.root/'current').is_symlink())
    def test_intent_rejects_bundle_identity_and_installed_file_drift(self):
        data=self.data()
        def crash(at):
            if at=='current': raise RuntimeError('crash')
        with self.assertRaises(RuntimeError): self.run_install(data,hook=crash)
        with self.assertRaises(RuntimeError): self.run_install({**data,'bundleSha256':'f'*64})
        (self.root/'versions'/data['opsSha']/'scripts/release-host/server.mjs').write_text('drift')
        with self.assertRaises(RuntimeError): self.run_install(data)
        with self.assertRaises(RuntimeError): m.query_install(data['opsSha'],self.root,self.unit)
if __name__=='__main__': unittest.main()
