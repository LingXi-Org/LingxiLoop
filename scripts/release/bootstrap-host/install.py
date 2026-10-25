# Fixed production destinations. Input includes hashes/commit identities only.
import sys, os, json, hashlib, urllib.request, tarfile, tempfile, pathlib, shutil, subprocess, base64
ROOT=pathlib.Path('/opt/lingxi-release')
NODE='node-v22.23.3-linux-x64'
NODE_SHA='df450af89261115ef9f9e3830c3eeb2cc9213b63c720b1af623cb5dcbe2e02de'
def check(value):
    if not value: raise RuntimeError('BOOTSTRAP_IDENTITY_CONFLICT')
def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()
def download(url,path,expected):
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self,*args,**kwargs): raise RuntimeError('REDIRECT_REJECTED')
    # GitHub codeload canonical endpoint avoids cross-origin redirects.
    with urllib.request.build_opener(NoRedirect).open(url,timeout=60) as response, open(path,'xb') as target:
        total=0
        while True:
            chunk=response.read(1024*1024)
            if not chunk: break
            total+=len(chunk);check(total<=256*1024*1024);target.write(chunk)
    check(digest(path)==expected)
def extract(archive,dest,selectors=None):
    with tarfile.open(archive,'r:*') as tar:
        count=0
        for member in tar:
            parts=pathlib.PurePosixPath(member.name).parts
            check(parts and '..' not in parts and not member.name.startswith('/'))
            relative=pathlib.PurePosixPath(*parts[1:])
            if selectors and not any(str(relative).startswith(prefix) for prefix in selectors): continue
            if member.isdir(): continue
            # Node official archive includes npm/man symlinks; only bin/node and shared libraries are needed.
            if not selectors and str(relative)!='bin/node': continue
            check(member.isfile() and member.size<=128*1024*1024)
            target=dest/str(relative);target.parent.mkdir(parents=True,exist_ok=True)
            with tar.extractfile(member) as source, open(target,'xb') as out: shutil.copyfileobj(source,out)
            target.chmod(0o755 if str(relative)=='bin/node' else 0o644);count+=1
        check(count>0)
UNIT=pathlib.Path('/etc/systemd/system/lingxi-release-host.service')
def present(path): return path.exists() or path.is_symlink()
def regular(path): check(path.is_file() and not path.is_symlink())
def syncdir(path):
    fd=os.open(path,os.O_RDONLY)
    try: os.fsync(fd)
    finally: os.close(fd)
def durable_json(path,data):
    check(not present(path))
    fd,tmp=tempfile.mkstemp(prefix='.receipt-',dir=path.parent)
    try:
        with os.fdopen(fd,'w') as out: json.dump(data,out);out.flush();os.fsync(out.fileno())
        os.rename(tmp,path);syncdir(path.parent)
    finally:
        if os.path.exists(tmp): os.unlink(tmp)
def file_hashes(directory):
    check(directory.is_dir() and not directory.is_symlink())
    result={}
    for path in directory.rglob('*'):
        check(not path.is_symlink())
        if path.is_file(): result[str(path.relative_to(directory))]=digest(path)
        else: check(path.is_dir())
    return result
def service_stopped():
    result=subprocess.run(['systemctl','is-active','lingxi-release-host.service'],capture_output=True,text=True,timeout=15)
    check(result.returncode in (3,4) and result.stdout.strip() in ('inactive','failed','unknown',''))
def verify_receipt(receipt,root,unit):
    check(receipt.get('nodeArchiveSha256')==NODE_SHA)
    version=root/'versions'/receipt['opsSha']
    expected={str(path):value for path,value in receipt['hashes'].items() if str(path).startswith(str(version)+'/')}
    check(expected and {str(version/key):value for key,value in file_hashes(version).items()}==expected)
    check(set(receipt['hashes'])==set(expected)|{str(root/NODE/'bin/node'),str(unit)})
    for path,value in receipt['hashes'].items(): regular(pathlib.Path(path));check(digest(pathlib.Path(path))==value)
def install(data,root=ROOT,unit=UNIT,stopped=service_stopped,hook=lambda phase:None):
    import re
    sha=data['opsSha'];bundle_sha=data['bundleSha256']
    check(re.fullmatch('[a-f0-9]{40}',sha) and re.fullmatch('[a-f0-9]{64}',bundle_sha))
    check(os.geteuid()==0 and os.uname().machine=='x86_64')
    root.mkdir(parents=True,exist_ok=True);check(not root.is_symlink())
    versions=root/'versions';versions.mkdir(exist_ok=True);check(not versions.is_symlink())
    receipt_path=root/('install-'+sha+'.json');intent_path=root/('install-intent-'+sha+'.json')
    current=root/'current';node=root/NODE;version=versions/sha;private=root/'node'
    if receipt_path.exists():
        regular(receipt_path);receipt=json.loads(receipt_path.read_text());check(receipt['bundleSha256']==bundle_sha)
        verify_receipt(receipt,root,unit);check(current.is_symlink() and os.readlink(current)==str(version))
        print(json.dumps(receipt));return receipt
    stopped() # Never replace executable/unit/current beneath a running executor.
    if intent_path.exists():
        regular(intent_path);intent=json.loads(intent_path.read_text())
        check(intent['opsSha']==sha and intent['bundleSha256']==bundle_sha and intent['nodeArchiveSha256']==NODE_SHA)
        stage=pathlib.Path(intent['stage']);check(stage.parent==root and stage.name.startswith('.bootstrap-stage-'))
    else:
        # Verify every existing identity before writing a durable promotion intent.
        check(not present(version))
        previous=None;previous_current=None;previous_unit=None
        if present(current):
            check(current.is_symlink());previous_current=os.readlink(current);old=pathlib.Path(previous_current)
            check(old.parent==versions and re.fullmatch('[a-f0-9]{40}',old.name))
            owner=root/('install-'+old.name+'.json');regular(owner);previous=json.loads(owner.read_text())
            check(previous['opsSha']==old.name);verify_receipt(previous,root,unit)
            previous_unit=previous['hashes'][str(unit)]
        else: check(not present(unit)) # Unowned units cannot be replaced, even if byte-identical.
        if present(private): check(private.is_symlink() and os.readlink(private)==str(node/'bin/node'))
        if present(node):
            check(node.is_dir() and not node.is_symlink());regular(node/'bootstrap-node.json')
            identity=json.loads((node/'bootstrap-node.json').read_text());regular(node/'bin/node')
            check(identity['archiveSha256']==NODE_SHA and identity['binarySha256']==digest(node/'bin/node'))
            if previous: check(previous['hashes'][str(node/'bin/node')]==digest(node/'bin/node'))
        stage=pathlib.Path(tempfile.mkdtemp(prefix='.bootstrap-stage-',dir=root))
        if not present(node):
            download('https://nodejs.org/dist/v22.23.3/'+NODE+'.tar.xz',stage/'node.tar.xz',NODE_SHA)
            extract(stage/'node.tar.xz',stage/'node')
            durable_json(stage/'node/bootstrap-node.json',{'archiveSha256':NODE_SHA,'binarySha256':digest(stage/'node/bin/node')})
        actual_node=node if present(node) else stage/'node'
        check(subprocess.check_output([str(actual_node/'bin/node'),'--version'],text=True).strip()=='v22.23.3')
        if 'bundleBase64' in data:
            check(len(data['bundleBase64'])<=1000000);(stage/'bundle.tar.gz').write_bytes(base64.b64decode(data['bundleBase64'],validate=True));check(digest(stage/'bundle.tar.gz')==bundle_sha)
        else: download('https://codeload.github.com/LingXi-Org/LingxiLoop/tar.gz/'+sha,stage/'bundle.tar.gz',bundle_sha)
        extract(stage/'bundle.tar.gz',stage/'version',('scripts/release-host/','deploy/release-host/'))
        service=stage/'version/deploy/release-host/lingxi-release-host.service';text=service.read_text()
        old_start='ExecStart=/usr/bin/node ';new_start='ExecStart=/opt/lingxi-release/node-v22.23.3-linux-x64/bin/node '
        check(text.count('ExecStart=')==1 and (old_start in text or new_start in text))
        service.write_text(text.replace(old_start,new_start))
        for path in stage.rglob('*'):
            if path.is_file():
                with open(path,'rb') as source: os.fsync(source.fileno())
        for directory in sorted([path for path in stage.rglob('*') if path.is_dir()],key=lambda path:len(path.parts),reverse=True): syncdir(directory)
        syncdir(stage)
        intent={'version':2,'opsSha':sha,'bundleSha256':bundle_sha,'nodeArchiveSha256':NODE_SHA,'stage':str(stage),'previousCurrent':previous_current,'previousUnitHash':previous_unit,'versionHashes':file_hashes(stage/'version'),'nodeHashes':file_hashes(actual_node)}
        durable_json(intent_path,intent);hook('intent')
    # A persisted intent is the only authority for resuming an existing destination.
    check(intent['version']==2)
    for candidate,expected in [(version,intent['versionHashes']),(stage/'version',intent['versionHashes']),(node,intent['nodeHashes']),(stage/'node',intent['nodeHashes'])]:
        if present(candidate): check(file_hashes(candidate)==expected)
    check(present(version) or present(stage/'version'));check(present(node) or present(stage/'node'))
    check(not present(private) or private.is_symlink() and os.readlink(private)==str(node/'bin/node'))
    current_value=os.readlink(current) if current.is_symlink() else None
    check(not present(current) or current.is_symlink())
    check(current_value in (intent['previousCurrent'],str(version)))
    unit_hash=intent['versionHashes']['deploy/release-host/lingxi-release-host.service']
    if present(unit): regular(unit);check(digest(unit) in (intent['previousUnitHash'],unit_hash))
    else: check(intent['previousUnitHash'] is None)
    stopped();hook('validated')
    if not present(node): os.rename(stage/'node',node);syncdir(root)
    if not present(version): os.rename(stage/'version',version);syncdir(versions)
    if not present(private): private.symlink_to(node/'bin/node');syncdir(root)
    if not present(unit) or digest(unit)!=unit_hash:
        content=(version/'deploy/release-host/lingxi-release-host.service').read_bytes()
        fd,tmp=tempfile.mkstemp(prefix='.lingxi-release-unit-',dir=unit.parent)
        with os.fdopen(fd,'wb') as out: out.write(content);out.flush();os.fsync(out.fileno())
        os.chmod(tmp,0o644);os.replace(tmp,unit);syncdir(unit.parent)
    hook('unit')
    if current_value!=str(version):
        # Fresh unique symlink leaves only harmless unreferenced temp links on crash.
        fd,tmp=tempfile.mkstemp(prefix='.current-',dir=root);os.close(fd);os.unlink(tmp);os.symlink(version,tmp);os.replace(tmp,current);syncdir(root)
    hook('current')
    hashes={str(version/key):value for key,value in intent['versionHashes'].items()};hashes[str(node/'bin/node')]=intent['nodeHashes']['bin/node'];hashes[str(unit)]=unit_hash
    result={'version':2,'opsSha':sha,'bundleSha256':bundle_sha,'nodeArchiveSha256':NODE_SHA,'hashes':hashes,'serviceStarted':False}
    verify_receipt(result,root,unit);durable_json(receipt_path,result);hook('receipt')
    print(json.dumps(result));return result
def query_install(sha,root=ROOT,unit=UNIT):
    import re
    check(re.fullmatch('[a-f0-9]{40}',sha))
    receipt_path=root/('install-'+sha+'.json');intent_path=root/('install-intent-'+sha+'.json')
    receipt=json.loads(receipt_path.read_text()) if receipt_path.exists() else None
    intent=json.loads(intent_path.read_text()) if intent_path.exists() else None
    current=root/'current'
    result={'receipt':receipt,'intent':intent,'current':os.readlink(current) if current.is_symlink() else None,'verified':False,'intentFilesVerified':False,'serviceStarted':False}
    if receipt:
        verify_receipt(receipt,root,unit);result['verified']=result['current']==str(root/'versions'/sha)
    if intent:
        stage=pathlib.Path(intent['stage']);check(stage.parent==root and stage.name.startswith('.bootstrap-stage-'))
        for actual,staged,hashes in [(root/'versions'/sha,stage/'version',intent['versionHashes']),(root/NODE,stage/'node',intent['nodeHashes'])]:
            paths=[path for path in (actual,staged) if present(path)];check(paths)
            for path in paths: check(file_hashes(path)==hashes)
        result['intentFilesVerified']=True
        result['unitHash']=digest(unit) if unit.is_file() and not unit.is_symlink() else None
    return result
def main(data):
    import fcntl
    ROOT.mkdir(parents=True,exist_ok=True)
    with open(ROOT/'.bootstrap.lock','a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        return install(data)
if __name__=='__main__':
    try: main(json.loads(sys.argv[1]))
    except Exception: print('BOOTSTRAP_FAILED_QUERY_FIXED_RECEIPT_BEFORE_RETRY',file=sys.stderr);sys.exit(1)
