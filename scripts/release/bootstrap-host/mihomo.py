"""Finite inactive Mihomo preinstallation; JSON contains only action and host."""
import os,sys,json,pathlib,hashlib,tempfile,subprocess,urllib.request,gzip,base64,signal,stat,time,fcntl,secrets,pwd,grp,re
from contextlib import contextmanager
VERSION='v1.19.33'
GZIP_SHA256='386508bfb1c72c43b6a0eda73708ecdce82546581b0ebcb16366c53757c622b6'
GZIP_BYTES=22893972
RAW_LIMIT=128*1024*1024
URL='https://release.lingxilearn.cn/v1/bootstrap/mihomo/v1.19.33/linux-amd64-compatible.gz'
SERVICE='lingxi-release-mihomo.service'
USER='lingxi-release-proxy'
DEADLINE_SECONDS=120
# Exact reviewed repository templates; no remote configuration is accepted.
UNIT_BYTES=base64.b64decode('W1VuaXRdCkRlc2NyaXB0aW9uPUxpbmd4aUxvb3AgbmF0aXZlIHJlbGVhc2UgZWdyZXNzIHByb3h5CkFmdGVyPW5ldHdvcmstb25saW5lLnRhcmdldApXYW50cz1uZXR3b3JrLW9ubGluZS50YXJnZXQKCltTZXJ2aWNlXQpUeXBlPXNpbXBsZQpVc2VyPWxpbmd4aS1yZWxlYXNlLXByb3h5Ckdyb3VwPWxpbmd4aS1yZWxlYXNlLXByb3h5ClVNYXNrPTAwNzcKIyBJbnN0YWxsIGEgdmVyaWZpZWQgb2ZmaWNpYWwgYmluYXJ5IHNlcGFyYXRlbHk7IGRvIG5vdCBib290c3RyYXAgdGhyb3VnaCBhIERvY2tlciBpbWFnZS4KRXhlY1N0YXJ0PS91c3IvbG9jYWwvYmluL21paG9tbyAtZCAvdmFyL2xpYi9saW5neGktcmVsZWFzZS1wcm94eSAtZiAlZC9jb25maWcueWFtbApMb2FkQ3JlZGVudGlhbD1jb25maWcueWFtbDovZXRjL2xpbmd4aS1yZWxlYXNlL21paG9tby55bWwKTG9hZENyZWRlbnRpYWw9cHJvdmlkZXIueWFtbDovZXRjL2xpbmd4aS1yZWxlYXNlL3NlY3JldHMvbWlob21vLXByb3ZpZGVyLnlhbWwKU3RhdGVEaXJlY3Rvcnk9bGluZ3hpLXJlbGVhc2UtcHJveHkKUmVzdGFydD1vbi1mYWlsdXJlClJlc3RhcnRTZWM9NQpOb05ld1ByaXZpbGVnZXM9dHJ1ZQpQcml2YXRlVG1wPXRydWUKUHJvdGVjdFN5c3RlbT1zdHJpY3QKUHJvdGVjdEhvbWU9dHJ1ZQpQcm90ZWN0S2VybmVsVHVuYWJsZXM9dHJ1ZQpQcm90ZWN0S2VybmVsTW9kdWxlcz10cnVlClByb3RlY3RDb250cm9sR3JvdXBzPXRydWUKUmVzdHJpY3RBZGRyZXNzRmFtaWxpZXM9QUZfVU5JWCBBRl9JTkVUIEFGX0lORVQ2CgpbSW5zdGFsbF0KV2FudGVkQnk9bXVsdGktdXNlci50YXJnZXQK')
CONFIG_BYTES=base64.b64decode('IyBJbW11dGFibGUgbG9jYWwgcG9saWN5OyBpbXBvcnQgb25seSBub2RlcyBmcm9tIGEgc2VjcmV0IHByb3ZpZGVyIGZpbGUuCiMgTm8gc3Vic2NyaXB0aW9uIFVSTCBvciBjcmVkZW50aWFsIGJlbG9uZ3MgaW4gR2l0LiBOZXZlciByZXBsYWNlIHRoaXMgcG9saWN5IHdpdGggYSBzdWJzY3JpcHRpb24gZG9jdW1lbnQuCm1peGVkLXBvcnQ6IDE3ODkwCmJpbmQtYWRkcmVzczogMTI3LjAuMC4xCmFsbG93LWxhbjogZmFsc2UKbW9kZTogcnVsZQpsb2ctbGV2ZWw6IHdhcm5pbmcKZXh0ZXJuYWwtY29udHJvbGxlcjogJycKaXB2NjogZmFsc2UKcHJveHktcHJvdmlkZXJzOgogIHN1YnNjcmliZWQtbm9kZXM6CiAgICB0eXBlOiBmaWxlCiAgICBwYXRoOiAvcnVuL2NyZWRlbnRpYWxzL2xpbmd4aS1yZWxlYXNlLW1paG9tby5zZXJ2aWNlL3Byb3ZpZGVyLnlhbWwKcHJveHktZ3JvdXBzOgogIC0gbmFtZTogUkVMRUFTRS1FR1JFU1MKICAgIHR5cGU6IHNlbGVjdAogICAgdXNlOgogICAgICAtIHN1YnNjcmliZWQtbm9kZXMKcnVsZXM6CiAgLSBJUC1DSURSLDEyNy4wLjAuMC84LERJUkVDVCxuby1yZXNvbHZlCiAgLSBJUC1DSURSLDEwLjAuMC4wLzgsRElSRUNULG5vLXJlc29sdmUKICAtIElQLUNJRFIsMTcyLjE2LjAuMC8xMixESVJFQ1Qsbm8tcmVzb2x2ZQogIC0gSVAtQ0lEUiwxOTIuMTY4LjAuMC8xNixESVJFQ1Qsbm8tcmVzb2x2ZQogIC0gRE9NQUlOLVNVRkZJWCxnaGNyLmlvLFJFTEVBU0UtRUdSRVNTCiAgLSBET01BSU4tU1VGRklYLGdpdGh1Yi5jb20sUkVMRUFTRS1FR1JFU1MKICAtIERPTUFJTi1TVUZGSVgsZ2l0aHVidXNlcmNvbnRlbnQuY29tLFJFTEVBU0UtRUdSRVNTCiAgLSBET01BSU4tU1VGRklYLGdpdGh1YmFzc2V0cy5jb20sUkVMRUFTRS1FR1JFU1MKICAtIERPTUFJTi1TVUZGSVgsZG9ja2VyLmlvLFJFTEVBU0UtRUdSRVNTCiAgLSBET01BSU4tU1VGRklYLGRvY2tlci5jb20sUkVMRUFTRS1FR1JFU1MKICAtIERPTUFJTi1TVUZGSVgsY2xvdWRmbGFyZXN0b3JhZ2UuY29tLFJFTEVBU0UtRUdSRVNTCiAgLSBNQVRDSCxESVJFQ1QK')
class Paths:
    def __init__(self,root='/opt/lingxi-release-mihomo',binary='/usr/local/bin/mihomo',unit='/etc/systemd/system/lingxi-release-mihomo.service',config='/etc/lingxi-release/mihomo.yml',credential='/etc/lingxi-release/secrets/executor-token',state='/var/lib/lingxi-release-proxy'):
        self.root,self.binary,self.unit,self.config,self.credential,self.state=map(pathlib.Path,(root,binary,unit,config,credential,state))
    def intent(self):return self.root/'intent-v1.19.33.json'
    def receipt(self):return self.root/'install-v1.19.33.json'
def check(value,code='MIHOMO_INSTALL_CONFLICT'):
    if not value:raise RuntimeError(code)
def digest(data):return hashlib.sha256(data).hexdigest()
def present(path):return path.exists() or path.is_symlink()
def regular(path,limit=RAW_LIMIT):
    metadata=path.lstat();check(stat.S_ISREG(metadata.st_mode) and metadata.st_size<=limit)
    return path.read_bytes()
def syncdir(path):
    fd=os.open(path,os.O_RDONLY)
    try:os.fsync(fd)
    finally:os.close(fd)
def record(path,data):
    check(not present(path));fd,tmp=tempfile.mkstemp(prefix='.receipt-',dir=path.parent)
    try:
        with os.fdopen(fd,'w') as out:json.dump(data,out,sort_keys=True);out.flush();os.fsync(out.fileno())
        os.rename(tmp,path);syncdir(path.parent)
    finally:
        if os.path.exists(tmp):os.unlink(tmp)
def readjson(path):return json.loads(regular(path,1024*1024))
@contextmanager
def deadline():
    previous=signal.getsignal(signal.SIGALRM);timer=signal.getitimer(signal.ITIMER_REAL);started=time.monotonic()
    def expired(signum,frame):raise RuntimeError('MIHOMO_INSTALL_DEADLINE')
    signal.signal(signal.SIGALRM,expired);signal.setitimer(signal.ITIMER_REAL, min(DEADLINE_SECONDS,timer[0]) if timer[0] else DEADLINE_SECONDS)
    try:yield
    finally:
        signal.setitimer(signal.ITIMER_REAL,0);signal.signal(signal.SIGALRM,previous)
        if timer[0]:signal.setitimer(signal.ITIMER_REAL,max(0.000001,timer[0]-(time.monotonic()-started)),timer[1])
def identity(data):
    check(set(data)=={'action','host'} and data['action'] in ('query','install') and data['host'] in ('a','b'),'MIHOMO_INVALID_INPUT')
    return {'host':data['host'],'version':VERSION}
def system_state():
    result=subprocess.run(['systemctl','show',SERVICE,'--property=LoadState,ActiveState,SubState,UnitFileState','--no-pager'],stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True,timeout=15,env={'PATH':'/usr/sbin:/usr/bin:/sbin:/bin'})
    check(len(result.stdout)<4096);values=dict(line.split('=',1) for line in result.stdout.splitlines() if '=' in line)
    check(values.get('ActiveState') in ('inactive','failed','active','activating','deactivating','reloading'),'MIHOMO_STATE_UNAVAILABLE')
    return {key:values.get(key,'') for key in ('LoadState','ActiveState','SubState','UnitFileState')}
def local_user():
    # NSS and local passwd/group records must agree; no existing foreign account is adopted.
    try:u=pwd.getpwnam(USER)
    except KeyError:u=None
    try:g=grp.getgrnam(USER)
    except KeyError:g=None
    if u:
        lines=[line.split(':') for line in pathlib.Path('/etc/passwd').read_text().splitlines() if line.split(':')[0]==USER]
        check(len(lines)==1 and lines[0][2:]==[str(u.pw_uid),str(u.pw_gid),u.pw_gecos,u.pw_dir,u.pw_shell],'MIHOMO_USER_NOT_LOCAL')
    if g:
        lines=[line.split(':') for line in pathlib.Path('/etc/group').read_text().splitlines() if line.split(':')[0]==USER]
        check(len(lines)==1 and lines[0][2:]==[str(g.gr_gid),','.join(g.gr_mem)],'MIHOMO_GROUP_NOT_LOCAL')
    return {'user':None if not u else {'uid':u.pw_uid,'gid':u.pw_gid,'comment':u.pw_gecos,'home':u.pw_dir,'shell':u.pw_shell},'group':None if not g else {'gid':g.gr_gid,'members':g.gr_mem}}
def create_user(marker):
    check(pathlib.Path('/usr/sbin/nologin').is_file(),'MIHOMO_NOLOGIN_UNAVAILABLE')
    result=subprocess.run(['/usr/sbin/useradd','--system','--user-group','--no-create-home','--home-dir','/nonexistent','--shell','/usr/sbin/nologin','--password','!','--comment',marker,USER],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=15,env={'PATH':'/usr/sbin:/usr/bin:/sbin:/bin'})
    check(result.returncode==0,'MIHOMO_USER_CREATION_UNCONFIRMED')
def owned_user(profile,marker):
    u,g=profile['user'],profile['group']
    check(u and g and u['uid']>0 and u['gid']==g['gid'] and g['gid']>0 and g['members']==[] and u['comment']==marker and u['home']=='/nonexistent' and u['shell']=='/usr/sbin/nologin','MIHOMO_USER_OWNERSHIP_UNPROVEN')
    return profile
def download(path,credential):
    raw=regular(credential,8192);metadata=credential.stat();token=raw.strip()
    check(metadata.st_uid==0 and not metadata.st_mode&0o077 and 32<=len(token)<=4096 and all(32<byte<127 for byte in token),'MIHOMO_PRIVATE_EXECUTOR_TOKEN_REQUIRED')
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self,*args,**kwargs):raise RuntimeError('MIHOMO_REDIRECT_REJECTED')
    request=urllib.request.Request(URL,headers={'Authorization':'Bearer '+token.decode('ascii')})
    with urllib.request.build_opener(NoRedirect).open(request,timeout=30) as response,open(path,'xb') as out:
        total=0
        while True:
            chunk=response.read(1024*1024)
            if not chunk:break
            total+=len(chunk);check(total<=GZIP_BYTES,'MIHOMO_GZIP_SIZE_MISMATCH');out.write(chunk)
        out.flush();os.fsync(out.fileno())
    check(total==GZIP_BYTES and digest(regular(path))==GZIP_SHA256,'MIHOMO_GZIP_HASH_MISMATCH')
def expand(source,target):
    check(source.stat().st_size==GZIP_BYTES and digest(regular(source))==GZIP_SHA256,'MIHOMO_GZIP_HASH_MISMATCH')
    total=0
    with gzip.open(source,'rb') as compressed,open(target,'xb') as out:
        while True:
            chunk=compressed.read(1024*1024)
            if not chunk:break
            total+=len(chunk);check(total<=RAW_LIMIT,'MIHOMO_RAW_SIZE_LIMIT');out.write(chunk)
        check(total>0);out.flush();os.fsync(out.fileno())
    target.chmod(0o755);return digest(regular(target))
def version_check(binary):
    result=subprocess.run([str(binary),'-v'],stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True,timeout=10,env={'PATH':'/usr/bin:/bin'})
    check(result.returncode==0 and len(result.stdout)<4096 and re.search(r'\bMihomo\b.*\bv1\.19\.33\b',result.stdout,re.I),'MIHOMO_VERSION_MISMATCH')
def target_hashes(p,raw):return {str(p.binary):raw,str(p.unit):digest(UNIT_BYTES),str(p.config):digest(CONFIG_BYTES)}
def verify_record(value,expected,p,users):
    check(value['identity']==expected and value['gzipSha256']==GZIP_SHA256 and value['gzipBytes']==GZIP_BYTES and value['hashes']==target_hashes(p,value['rawSha256']))
    for path,wanted in value['hashes'].items():check(digest(regular(pathlib.Path(path)))==wanted,'MIHOMO_INSTALLED_HASH_DRIFT')
    for path,mode in [(p.binary,0o755),(p.unit,0o644),(p.config,0o600)]:check(stat.S_IMODE(path.stat().st_mode)==mode,'MIHOMO_INSTALLED_MODE_DRIFT')
    check(users()==value['user'],'MIHOMO_USER_DRIFT');owned_user(value['user'],value['userMarker'])
    return True
def query(data,p=None,state=system_state,users=local_user):
    p=p or Paths();expected=identity(data);receipt=readjson(p.receipt()) if p.receipt().exists() else None;intent=readjson(p.intent()) if p.intent().exists() else None
    result={'identity':expected,'receipt':receipt,'intent':intent,'service':state(),'verified':False,'activationReady':False,'providerProvisionedByModule':False,'existing':{'binary':present(p.binary),'unit':present(p.unit),'config':present(p.config),'user':users()['user'] is not None,'group':users()['group'] is not None}}
    if receipt:result['verified']=verify_record(receipt,expected,p,users)
    if intent:
        check(intent['identity']==expected and intent['hashes']==target_hashes(p,intent['rawSha256']) and intent['gzipSha256']==GZIP_SHA256)
        stage=pathlib.Path(intent['stage']);check(stage.parent==p.root and stage.name.startswith('.stage-') and stage.is_dir() and not stage.is_symlink())
        for name,wanted in [('mihomo',intent['rawSha256']),('unit',digest(UNIT_BYTES)),('config',digest(CONFIG_BYTES))]:check(digest(regular(stage/name))==wanted)
        result['intentVerified']=True
    return result
def install(data,p=None,state=system_state,users=local_user,create=create_user,fetch=download,version=version_check,hook=lambda phase:None):
    p=p or Paths();expected=identity(data);check(data['action']=='install' and os.geteuid()==0 and os.uname().machine=='x86_64','MIHOMO_ROOT_X64_REQUIRED')
    if p.receipt().exists():value=readjson(p.receipt());verify_record(value,expected,p,users);return value
    stopped=state();check(stopped['ActiveState']=='inactive','MIHOMO_MUST_REMAIN_INACTIVE')
    p.root.mkdir(parents=True,exist_ok=True,mode=0o700);check(not p.root.is_symlink())
    if p.intent().exists():
        value=readjson(p.intent());check(value['identity']==expected and value['hashes']==target_hashes(p,value['rawSha256']) and value['gzipSha256']==GZIP_SHA256)
        stage=pathlib.Path(value['stage']);check(stage.parent==p.root and stage.name.startswith('.stage-') and stage.is_dir() and not stage.is_symlink())
    else:
        check(not any(present(path) for path in (p.binary,p.unit,p.config,p.state)) and users()=={'user':None,'group':None} and stopped['LoadState']=='not-found','MIHOMO_UNOWNED_INSTALLATION')
        stage=pathlib.Path(tempfile.mkdtemp(prefix='.stage-',dir=p.root));fetch(stage/'artifact.gz',p.credential);raw=expand(stage/'artifact.gz',stage/'mihomo');version(stage/'mihomo')
        (stage/'unit').write_bytes(UNIT_BYTES);(stage/'config').write_bytes(CONFIG_BYTES)
        for path in (stage/'unit',stage/'config'):
            with open(path,'rb') as source:os.fsync(source.fileno())
        syncdir(stage)
        value={'identity':expected,'gzipSha256':GZIP_SHA256,'gzipBytes':GZIP_BYTES,'rawSha256':raw,'hashes':target_hashes(p,raw),'stage':str(stage),'userMarker':'lingxi-release-mihomo-'+secrets.token_hex(16)}
        record(p.intent(),value);hook('intent')
    for name,wanted in [('mihomo',value['rawSha256']),('unit',digest(UNIT_BYTES)),('config',digest(CONFIG_BYTES))]:check(digest(regular(stage/name))==wanted)
    for path,wanted in value['hashes'].items():
        if present(pathlib.Path(path)):check(digest(regular(pathlib.Path(path)))==wanted,'MIHOMO_PARTIAL_FILE_DRIFT')
    profile=users()
    if profile=={'user':None,'group':None}:create(value['userMarker']);hook('user');profile=users()
    owned_user(profile,value['userMarker'])
    check(state()['ActiveState']=='inactive','MIHOMO_MUST_REMAIN_INACTIVE')
    for source,target,mode in [(stage/'mihomo',p.binary,0o755),(stage/'unit',p.unit,0o644),(stage/'config',p.config,0o600)]:
        if not present(target):
            target.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
            # A same-directory temporary file permits cross-filesystem /opt -> /usr installs.
            # Exclusive link never replaces a destination, while original staging stays intact.
            fd,tmp=tempfile.mkstemp(prefix='.mihomo-install-',dir=target.parent)
            try:
                with os.fdopen(fd,'wb') as out:out.write(regular(source));out.flush();os.fchmod(out.fileno(),mode);os.fsync(out.fileno())
                os.link(tmp,target,follow_symlinks=False);syncdir(target.parent)
            finally:
                if os.path.exists(tmp):os.unlink(tmp)
        hook(target.name)
    result={**value,'user':profile,'serviceStarted':False,'enabledByModule':False,'activationReady':False,'providerProvisionedByModule':False}
    verify_record(result,expected,p,users);record(p.receipt(),result);return result
def main(data):
    identity(data);p=Paths()
    if data['action']=='query':return query(data,p)
    with deadline():
        p.root.mkdir(parents=True,exist_ok=True,mode=0o700)
        with open(p.root/'.lock','a') as lock:
            fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);return install(data,p)
if __name__=='__main__':
    try:print(json.dumps(main(json.loads(sys.argv[1]))))
    except Exception:print('MIHOMO_PREINSTALL_UNCONFIRMED_QUERY_BEFORE_RETRY',file=sys.stderr);sys.exit(1)
