"""Fixed, standalone connector bootstrap; public JSON only, never secret arguments."""
import os, sys, json, pathlib, hashlib, tempfile, subprocess, urllib.request, urllib.parse, base64, re, fcntl, signal, time, stat, select
from contextlib import contextmanager, nullcontext
VERSION='2026.10.3'
BINARY_SHA256='053b80b0a23031a038fdbf3c073f59f82b8f1f152aa67971d7383ffafc0dbab0'
URL='https://github.com/cloudflare/cloudflared/releases/download/'+VERSION+'/cloudflared-linux-amd64'
RELEASE_API_URL='https://release.lingxilearn.cn/v1/bootstrap/cloudflared/2026.10.3/linux-amd64'
EXECUTOR_TOKEN=pathlib.Path('/etc/lingxi-release/secrets/executor-token')
ROOT=pathlib.Path('/opt/lingxi-release-tunnel')
UNIT=pathlib.Path('/etc/systemd/system/lingxi-release-tunnel.service')
TOKEN=pathlib.Path('/etc/lingxi-release/secrets/tunnel-token')
SERVICE='lingxi-release-tunnel.service'
ORIGIN='http://127.0.0.1:17951'
DOWNLOAD_DEADLINE_SECONDS=90
INSTALL_DEADLINE_SECONDS=120
LEGACY_SOURCE_SHA256='ed4018503c7581a7a16d7b106d10d374b8e73038825222a9a3e25b19dd5d936e'
@contextmanager
def wall_deadline(seconds):
    # A socket timeout is per blocking operation; SIGALRM bounds all redirects,
    # DNS/connect/read calls and the enclosing install in this Linux main process.
    previous_handler=signal.getsignal(signal.SIGALRM)
    previous_delay,previous_interval=signal.getitimer(signal.ITIMER_REAL)
    started=time.monotonic()
    def expired(signum,frame): raise RuntimeError('TUNNEL_TOTAL_DEADLINE_EXCEEDED')
    signal.signal(signal.SIGALRM,expired)
    signal.setitimer(signal.ITIMER_REAL,min(seconds,previous_delay) if previous_delay>0 else seconds)
    try: yield
    finally:
        signal.setitimer(signal.ITIMER_REAL,0)
        signal.signal(signal.SIGALRM,previous_handler)
        if previous_delay>0: signal.setitimer(signal.ITIMER_REAL,max(0.000001,previous_delay-(time.monotonic()-started)),previous_interval)
def check(value,code='TUNNEL_IDENTITY_CONFLICT'):
    if not value: raise RuntimeError(code)
def binary_directory(path):
    if not present(path): path.mkdir(parents=True,mode=0o755);path.chmod(0o755)
    check(path.is_dir() and not path.is_symlink() and path.stat().st_mode&0o005==0o005)
def digest(data): return hashlib.sha256(data).hexdigest()
def regular(path): check(path.is_file() and not path.is_symlink());return path.read_bytes()
def present(path): return path.exists() or path.is_symlink()
def syncdir(path):
    fd=os.open(path,os.O_RDONLY)
    try: os.fsync(fd)
    finally: os.close(fd)
def atomic(path,data,exclusive=False):
    if exclusive: check(not present(path))
    fd,tmp=tempfile.mkstemp(prefix='.tunnel-',dir=path.parent)
    try:
        with os.fdopen(fd,'wb') as out: out.write(data);out.flush();os.fsync(out.fileno())
        os.replace(tmp,path);syncdir(path.parent)
    finally:
        if os.path.exists(tmp): os.unlink(tmp)
def record(path,value): atomic(path,json.dumps(value,sort_keys=True).encode(),exclusive=True)
def readjson(path): return json.loads(regular(path))
def _download(path,source='github',credential=EXECUTOR_TOKEN):
    check(source in ('github','release-api'),'TUNNEL_DOWNLOAD_SOURCE_REJECTED')
    class RestrictedRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self,req,fp,code,msg,headers,url):
            parsed=urllib.parse.urlparse(url)
            check(parsed.scheme=='https' and parsed.hostname in ('github.com','release-assets.githubusercontent.com','objects.githubusercontent.com','github-releases.githubusercontent.com') and not parsed.username and not parsed.password,'TUNNEL_DOWNLOAD_ORIGIN_REJECTED')
            return super().redirect_request(req,fp,code,msg,headers,url)
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self,*args,**kwargs): raise RuntimeError('TUNNEL_RELEASE_API_REDIRECT_REJECTED')
    if source=='release-api':
        raw=regular(credential);metadata=credential.stat()
        check(metadata.st_uid==0 and not metadata.st_mode&0o077,'TUNNEL_PRIVATE_EXECUTOR_TOKEN_REQUIRED')
        token=raw.strip();check(32<=len(token)<=4096 and not any(byte<=32 or byte>=127 for byte in token),'TUNNEL_EXECUTOR_TOKEN_INVALID')
        request=urllib.request.Request(RELEASE_API_URL,headers={'Authorization':'Bearer '+token.decode('ascii')})
        opener=urllib.request.build_opener(NoRedirect)
    else:
        request=urllib.request.Request(URL);opener=urllib.request.build_opener(RestrictedRedirect)
    with opener.open(request,timeout=60) as response, open(path,'xb') as out:
        total=0
        while True:
            chunk=response.read(1024*1024)
            if not chunk: break
            total+=len(chunk);check(total<=64*1024*1024,'TUNNEL_DOWNLOAD_TOO_LARGE');out.write(chunk)
        out.flush();os.fsync(out.fileno())
    check(digest(regular(path))==BINARY_SHA256,'TUNNEL_BINARY_HASH_MISMATCH');path.chmod(0o755)
def download(path,source='github'):
    with wall_deadline(DOWNLOAD_DEADLINE_SECONDS): return _download(path,source)
def installation_progress(root):
    count=0;size=0
    if root.is_dir():
        for stage in root.glob('.stage-*'):
            if stage.is_symlink() or not stage.is_dir(): continue
            count+=1
            for directory,dirs,files in os.walk(stage,followlinks=False):
                dirs[:]=[name for name in dirs if not (pathlib.Path(directory)/name).is_symlink()]
                for name in files:
                    try:
                        metadata=(pathlib.Path(directory)/name).lstat()
                        if stat.S_ISREG(metadata.st_mode): size+=metadata.st_size
                    except FileNotFoundError: pass # Concurrent promotion is observational only.
    return {'count':count,'bytes':size}
def installation_lock(root):
    # Never create/chmod the lock for a read-only query. Independent terminal
    # queries can inspect this lock even while the operator write lock is held.
    try: fd=os.open(root/'.lock',os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC)
    except FileNotFoundError: return {'present':False,'busy':False}
    except OSError: return {'present':True,'busy':None,'queryError':'unavailable'}
    try:
        try: fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError: return {'present':True,'busy':True}
        fcntl.flock(fd,fcntl.LOCK_UN)
        return {'present':True,'busy':False}
    finally: os.close(fd)
def system(args):
    result=subprocess.run(['systemctl']+args,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True,timeout=30,env={'PATH':'/usr/sbin:/usr/bin:/sbin:/bin'})
    check(len(result.stdout)<8192,'TUNNEL_STATUS_LIMIT')
    if args[0]!='show': check(result.returncode==0,'TUNNEL_SYSTEMD_OUTCOME_UNKNOWN')
    return result.stdout
def status(run=system):
    output=run(['show',SERVICE,'--property=LoadState,ActiveState,SubState,FragmentPath,MainPID,UnitFileState','--no-pager'])
    values=dict(line.split('=',1) for line in output.splitlines() if '=' in line)
    check(values.get('ActiveState') in ('active','inactive','failed','activating','deactivating','reloading'),'TUNNEL_SERVICE_STATUS_UNKNOWN')
    return {key:values.get(key,'') for key in ('LoadState','ActiveState','SubState','FragmentPath','MainPID','UnitFileState')}
def unit_text(root=ROOT):
    return '''[Unit]
Description=LingxiLoop dedicated release Tunnel connector
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
DynamicUser=yes
UMask=0077
Environment=HOME=/nonexistent
UnsetEnvironment=TUNNEL_TOKEN TUNNEL_TOKEN_FILE HTTP_PROXY HTTPS_PROXY ALL_PROXY http_proxy https_proxy all_proxy
ExecStart=BIN --config /dev/null tunnel --no-autoupdate --metrics 127.0.0.1:0 run --token-file %d/tunnel-token
LoadCredential=tunnel-token:/etc/lingxi-release/secrets/tunnel-token
Restart=on-failure
RestartSec=5
TimeoutStopSec=30
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6
StandardOutput=null
StandardError=null

[Install]
WantedBy=multi-user.target
'''.replace('BIN',str(root/'current/cloudflared')).encode()
def validate(data):
    check(set(data)-{'downloadSource'}=={'action','host','tunnelId','origin','remoteConfigSha256'} and data.get('downloadSource','github') in ('github','release-api'),'TUNNEL_INVALID_INPUT')
    check(data['action'] in ('install','start','enable','query','abort-download') and data['host'] in ('a','b') and data['origin']==ORIGIN,'TUNNEL_INVALID_INPUT')
    check(re.fullmatch('[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}',data['tunnelId']) and re.fullmatch('[a-f0-9]{64}',data['remoteConfigSha256']),'TUNNEL_INVALID_INPUT')
    return {key:data[key] for key in ('host','tunnelId','origin','remoteConfigSha256')}
def lock_owner(metadata,proc):
    owners=[]
    for line in (proc/'locks').read_text().splitlines():
        fields=line.split()
        if len(fields)!=8 or fields[1:4]!=['FLOCK','ADVISORY','WRITE'] or fields[6:]!=['0','EOF']: continue
        try:
            major,minor,inode=fields[5].split(':')
            matches=(int(major,16),int(minor,16),int(inode))==(os.major(metadata.st_dev),os.minor(metadata.st_dev),metadata.st_ino)
            if matches: owners.append(int(fields[4]))
        except ValueError: continue
    check(len(owners)==1 and owners[0]>1 and owners[0]!=os.getpid(),'TUNNEL_ABORT_LOCK_OWNER_UNPROVEN')
    return owners[0]
def prove_legacy_process(pid,identity,proc):
    process=proc/str(pid)
    statuses=[line.split()[1:] for line in (process/'status').read_text().splitlines() if line.startswith('Uid:')]
    check(statuses==[['0','0','0','0']],'TUNNEL_ABORT_PROCESS_UID_UNPROVEN')
    executable=os.readlink(process/'exe')
    check(pathlib.PurePosixPath(executable).parent in (pathlib.PurePosixPath('/usr/bin'),pathlib.PurePosixPath('/usr/local/bin')) and re.fullmatch(r'python3(?:\.[0-9]+)?',pathlib.PurePosixPath(executable).name),'TUNNEL_ABORT_EXECUTABLE_UNPROVEN')
    arguments=(process/'cmdline').read_bytes().split(b'\0')
    check(arguments[-1:]==[b''],'TUNNEL_ABORT_CMDLINE_UNPROVEN');arguments=arguments[:-1]
    check(len(arguments)==4 and arguments[0] in (b'python3',b'/usr/bin/python3',b'/usr/local/bin/python3') and arguments[1]==b'-c' and digest(arguments[2])==LEGACY_SOURCE_SHA256,'TUNNEL_ABORT_SOURCE_UNPROVEN')
    try: original=json.loads(arguments[3])
    except Exception: raise RuntimeError('TUNNEL_ABORT_INPUT_UNPROVEN') from None
    check(original=={'action':'install',**identity},'TUNNEL_ABORT_INPUT_UNPROVEN')
def abort_preconditions(root,unit,run):
    check(not any(present(path) for path in (unit,root/('install-'+VERSION+'.json'),root/('intent-'+VERSION+'.json'),root/'current',root/'versions'/VERSION)),'TUNNEL_ABORT_EFFECTS_ALREADY_PRESENT')
    state=status(run)
    check(state['LoadState']=='not-found' and state['ActiveState']=='inactive' and state['MainPID'] in ('','0'),'TUNNEL_ABORT_SERVICE_ALREADY_PRESENT')
def process_exited(pidfd):
    poll=select.poll();poll.register(pidfd,select.POLLIN);return bool(poll.poll(3000))
def abort_download(data,root=ROOT,unit=UNIT,proc=pathlib.Path('/proc'),run=system,pidfd_open=None,send_signal=None,exited=process_exited):
    identity=validate(data);check(data['action']=='abort-download' and os.geteuid()==0,'TUNNEL_ABORT_ROOT_REQUIRED')
    opener=pidfd_open or getattr(os,'pidfd_open',None);sender=send_signal or getattr(signal,'pidfd_send_signal',None)
    check(callable(opener) and callable(sender),'TUNNEL_ABORT_PIDFD_UNAVAILABLE')
    abort_preconditions(root,unit,run)
    lockfd=os.open(root/'.lock',os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC)
    try:
        metadata=os.fstat(lockfd);check(stat.S_ISREG(metadata.st_mode),'TUNNEL_ABORT_LOCK_UNPROVEN')
        pid=lock_owner(metadata,proc);pidfd=opener(pid,0)
        try:
            prove_legacy_process(pid,identity,proc)
            # Repeat all proofs while the pidfd pins the original process. No
            # numeric-PID signal, process search, service stop or lock acquisition.
            abort_preconditions(root,unit,run)
            current=(root/'.lock').lstat();check((current.st_dev,current.st_ino)==(metadata.st_dev,metadata.st_ino) and stat.S_ISREG(current.st_mode),'TUNNEL_ABORT_LOCK_REPLACED')
            check(lock_owner(metadata,proc)==pid,'TUNNEL_ABORT_OWNER_CHANGED');prove_legacy_process(pid,identity,proc)
            sender(pidfd,signal.SIGTERM,None,0)
            return {'action':'abort-download','identity':identity,'pid':pid,'sourceSha256':LEGACY_SOURCE_SHA256,'signalSent':'SIGTERM','processExited':exited(pidfd),'staging':installation_progress(root),'requiresReconciliation':True}
        finally: os.close(pidfd)
    finally: os.close(lockfd)
def token_identity(path,tunnel_id):
    raw=regular(path);check(path.stat().st_uid==0 and not path.stat().st_mode&0o077,'TUNNEL_PRIVATE_TOKEN_REQUIRED')
    # Parse only to bind the existing credential to the exact approved Tunnel.
    try:
        text=raw.strip();token=json.loads(base64.b64decode(text+b'='*((-len(text))%4),validate=True));check(token.get('t')==tunnel_id and token.get('s'),'TUNNEL_TOKEN_IDENTITY_MISMATCH')
    except Exception: raise RuntimeError('TUNNEL_TOKEN_IDENTITY_MISMATCH') from None
    return digest(raw)
def verify_install(receipt,root,unit):
    check(receipt['version']==VERSION and receipt['binarySha256']==BINARY_SHA256,'TUNNEL_VERSION_CONFLICT')
    binary=root/'versions'/VERSION/'cloudflared'
    check(digest(regular(binary))==BINARY_SHA256 and digest(regular(unit))==receipt['unitSha256'])
    check((root/'current').is_symlink() and os.readlink(root/'current')==str(binary.parent))
    return True
def query(data,root=ROOT,unit=UNIT,run=system):
    identity=validate(data);receipt_path=root/('install-'+VERSION+'.json');intent_path=root/('intent-'+VERSION+'.json')
    receipt=readjson(receipt_path) if receipt_path.exists() else None;intent=readjson(intent_path) if intent_path.exists() else None
    result={'version':VERSION,'identity':identity,'receipt':receipt,'intent':intent,'verified':False,'service':status(run),'connectedVerified':False,'staging':installation_progress(root),'installationLock':installation_lock(root)}
    if receipt: check(receipt['identity']==identity);result['verified']=verify_install(receipt,root,unit)
    if intent:
        check(intent['identity']==identity and intent['binarySha256']==BINARY_SHA256)
        stage=pathlib.Path(intent['stage']);check(stage.parent==root and stage.name.startswith('.stage-'))
        candidates=[path for path in (root/'versions'/VERSION/'cloudflared',stage/'cloudflared') if present(path)];check(candidates)
        for binary in candidates: check(digest(regular(binary))==BINARY_SHA256)
        result['intentVerified']=True
    return result
def _execute(data,root=ROOT,unit=UNIT,token=TOKEN,run=system,fetch=download,hook=lambda phase:None,version_check=None):
    identity=validate(data)
    if data['action']=='query': return query(data,root,unit,run)
    if data['action']=='abort-download': return abort_download(data,root,unit,run=run)
    check(os.geteuid()==0 and os.uname().machine=='x86_64','TUNNEL_ROOT_X64_REQUIRED')
    binary_directory(root)
    versions=root/'versions';binary_directory(versions)
    receipt_path=root/('install-'+VERSION+'.json');intent_path=root/('intent-'+VERSION+'.json');version=root/'versions'/VERSION;binary=version/'cloudflared';current=root/'current'
    token_hash=token_identity(token,identity['tunnelId'])
    if data['action'] in ('start','enable'):
        check(receipt_path.exists(),'TUNNEL_INSTALL_REQUIRED');receipt=readjson(receipt_path);check(receipt['identity']==identity and receipt['tokenSha256']==token_hash);verify_install(receipt,root,unit)
        state=status(run)
        if data['action']=='enable':
            check(state['ActiveState']=='active' and state['FragmentPath']==str(unit) and state['MainPID'].isdigit() and int(state['MainPID'])>0,'TUNNEL_ENABLE_REQUIRES_OWN_ACTIVE_SERVICE')
            enable_intent=root/('enable-intent-'+VERSION+'.json');identity_receipt={'identity':identity,'installReceiptSha256':digest(regular(receipt_path))}
            if enable_intent.exists(): check(readjson(enable_intent)==identity_receipt)
            else: record(enable_intent,identity_receipt)
            if state['UnitFileState']!='enabled': run(['enable',SERVICE]);hook('enabled');state=status(run)
            check(state['UnitFileState']=='enabled','TUNNEL_ENABLE_OUTCOME_UNKNOWN')
            enabled=root/('enabled-'+VERSION+'.json');result={'identity':identity,'version':VERSION,'service':SERVICE,'enabled':True}
            if not enabled.exists(): record(enabled,result)
            else: check(readjson(enabled)==result)
            return result
        start_intent=root/('start-intent-'+VERSION+'.json');start_receipt=root/('started-'+VERSION+'.json')
        if start_receipt.exists(): check(readjson(start_receipt)['identity']==identity)
        if not start_intent.exists(): record(start_intent,{'identity':identity,'installReceiptSha256':digest(regular(receipt_path))})
        else: check(readjson(start_intent)=={'identity':identity,'installReceiptSha256':digest(regular(receipt_path))})
        if state['ActiveState']!='active':
            check(state['ActiveState'] in ('inactive','failed'),'TUNNEL_START_PENDING_QUERY_FIRST');run(['daemon-reload']);run(['start',SERVICE]);hook('started');state=status(run)
        check(state['ActiveState']=='active' and state['FragmentPath']==str(unit) and state['MainPID'].isdigit() and int(state['MainPID'])>0,'TUNNEL_START_OUTCOME_UNKNOWN')
        result={'identity':identity,'version':VERSION,'active':True,'service':SERVICE,'connectedVerified':False,'enabledByModule':False}
        if not start_receipt.exists(): record(start_receipt,result)
        return result
    if receipt_path.exists():
        receipt=readjson(receipt_path);check(receipt['identity']==identity and receipt['tokenSha256']==token_hash);verify_install(receipt,root,unit);return receipt
    state=status(run);check(state['ActiveState'] in ('inactive','failed'),'TUNNEL_STOP_OWN_SERVICE_BEFORE_UPGRADE')
    if intent_path.exists():
        intent=readjson(intent_path);check(intent['identity']==identity and intent['binarySha256']==BINARY_SHA256 and intent['tokenSha256']==token_hash)
        stage=pathlib.Path(intent['stage']);check(stage.parent==root and stage.name.startswith('.stage-'))
    else:
        check(not present(version),'TUNNEL_PARTIAL_VERSION_REQUIRES_INTENT')
        old_current=None;old_unit_hash=None
        if present(current):
            check(current.is_symlink());old_current=os.readlink(current);old=pathlib.Path(old_current)
            check(old.parent==versions and re.fullmatch('[0-9]{4}\\.[0-9]{1,2}\\.[0-9]+',old.name),'TUNNEL_UNOWNED_CURRENT')
            old_receipt=readjson(root/('install-'+old.name+'.json'));check(old_receipt['identity']==identity and old_receipt['version']==old.name and old_receipt['tokenSha256']==token_hash)
            check(digest(regular(old/'cloudflared'))==old_receipt['binarySha256']);old_unit_hash=old_receipt['unitSha256'];check(digest(regular(unit))==old_unit_hash)
        else: check(not present(unit) and state['LoadState'] in ('not-found',''),'TUNNEL_UNOWNED_UNIT')
        stage=pathlib.Path(tempfile.mkdtemp(prefix='.stage-',dir=root))
        if fetch is download: fetch(stage/'cloudflared',data.get('downloadSource','github'))
        else: fetch(stage/'cloudflared')
        check(digest(regular(stage/'cloudflared'))==BINARY_SHA256)
        output=version_check(stage/'cloudflared') if version_check else subprocess.check_output([str(stage/'cloudflared'),'--version'],text=True,stderr=subprocess.DEVNULL,timeout=15,env={'PATH':'/usr/bin:/bin'})
        check(re.search(r'cloudflared version '+re.escape(VERSION)+r'(?:\s|$)',output),'TUNNEL_VERSION_MISMATCH')
        intent={'version':VERSION,'binarySha256':BINARY_SHA256,'unitSha256':digest(unit_text(root)),'identity':identity,'tokenSha256':token_hash,'stage':str(stage),'downloadSource':data.get('downloadSource','github'),'previousCurrent':old_current,'previousUnitHash':old_unit_hash}
        stage.chmod(0o755);syncdir(stage);record(intent_path,intent);hook('intent')
    check(intent['unitSha256']==digest(unit_text(root)))
    for candidate in (binary,stage/'cloudflared'):
        if present(candidate): check(digest(regular(candidate))==BINARY_SHA256)
    check(present(binary) or present(stage/'cloudflared'))
    pointer=os.readlink(current) if current.is_symlink() else None;check(not present(current) or current.is_symlink());check(pointer in (intent['previousCurrent'],str(version)))
    if present(unit): check(digest(regular(unit)) in (intent['previousUnitHash'],intent['unitSha256']))
    else: check(intent['previousUnitHash'] is None)
    check(status(run)['ActiveState'] in ('inactive','failed'),'TUNNEL_STOP_OWN_SERVICE_BEFORE_UPGRADE')
    if present(version): check(version.is_dir() and not version.is_symlink())
    if present(stage): check(stage.is_dir() and not stage.is_symlink())
    if not present(version): os.rename(stage,version);syncdir(versions)
    if not present(unit) or digest(regular(unit))!=intent['unitSha256']: atomic(unit,unit_text(root));unit.chmod(0o644)
    hook('unit')
    if pointer!=str(version):
        fd,tmp=tempfile.mkstemp(prefix='.current-',dir=root);os.close(fd);os.unlink(tmp);os.symlink(version,tmp);os.replace(tmp,current);syncdir(root)
    hook('current')
    receipt={'version':VERSION,'binarySha256':BINARY_SHA256,'unitSha256':intent['unitSha256'],'identity':identity,'tokenSha256':token_hash,'downloadSource':intent.get('downloadSource','github'),'serviceStarted':False}
    verify_install(receipt,root,unit);record(receipt_path,receipt);return receipt
def execute(data,root=ROOT,unit=UNIT,token=TOKEN,run=system,fetch=download,hook=lambda phase:None,version_check=None):
    with wall_deadline(INSTALL_DEADLINE_SECONDS) if data.get('action')=='install' else nullcontext():
        return _execute(data,root,unit,token,run,fetch,hook,version_check)
def main(data):
    if data.get('action') in ('query','abort-download'): return execute(data)
    binary_directory(ROOT)
    with open(ROOT/'.lock','a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);return execute(data)
if __name__=='__main__':
    try: print(json.dumps(main(json.loads(sys.argv[1]))))
    except Exception: print('TUNNEL_ACTION_UNCONFIRMED_QUERY_BEFORE_RETRY',file=sys.stderr);sys.exit(1)
