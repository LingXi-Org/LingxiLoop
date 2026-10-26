const source=`import os,stat,json,pwd,grp,pathlib,subprocess
paths=['/etc/lingxi-release','/etc/lingxi-release/secrets','/etc/lingxi-release/mihomo.yml','/etc/lingxi-release/secrets/mihomo-provider.yaml','/etc/systemd/system/lingxi-release-mihomo.service','/usr/local/bin/mihomo','/var/lib/lingxi-release-proxy']
rows=[]
for path in paths:
 try:
  s=os.lstat(path);rows.append({'path':path,'exists':True,'mode':oct(stat.S_IMODE(s.st_mode)),'owner':pwd.getpwuid(s.st_uid).pw_name,'group':grp.getgrgid(s.st_gid).gr_name,'symlink':stat.S_ISLNK(s.st_mode),'directory':stat.S_ISDIR(s.st_mode)})
 except FileNotFoundError:rows.append({'path':path,'exists':False})
r=subprocess.run(['systemctl','show','lingxi-release-mihomo.service','--property=LoadState,ActiveState,UnitFileState,FragmentPath','--no-pager'],stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True,timeout=15)
service=dict(line.split('=',1) for line in r.stdout.splitlines() if '=' in line)
credentials=[]
p=pathlib.Path('/etc/systemd/system/lingxi-release-mihomo.service')
if p.exists() and not p.is_symlink():
 for line in p.read_text().splitlines():
  if line.startswith('LoadCredential='):
   name,sep,path=line.removeprefix('LoadCredential=').partition(':')
   if name in ['config.yaml','provider.yaml'] and path.startswith('/etc/lingxi-release/'):credentials.append({'name':name,'path':path})
print(json.dumps({'readOnly':True,'paths':rows,'service':service,'credentialPaths':credentials,'providerContentsRead':False}))`
const quote=text=>`'${text.replaceAll("'","'\\''")}'`
export async function inspectUploadPaths(env=process.env,{fetcher=fetch}={}) {
 if(!env.KOMODO_API_KEY||!env.KOMODO_API_SECRET)throw Object.assign(Error('EXISTING_OPERATOR_CREDENTIAL_REQUIRED'),{code:'EXISTING_OPERATOR_CREDENTIAL_REQUIRED'})
 const hosts=[]
 for(const side of ['a','b']) {
 const response=await fetcher('https://ops.christmas1314.xyz/terminal/execute',{method:'POST',redirect:'error',signal:AbortSignal.timeout(45000),headers:{'content-type':'application/json','x-api-key':env.KOMODO_API_KEY,'x-api-secret':env.KOMODO_API_SECRET},body:JSON.stringify({target:{type:'Server',params:{server:side==='a'?'shanghai-a':'shanghai-b'}},terminal:`issue-514-mihomo-upload-read-${side}`,command:`python3 -c ${quote(source)}`,init:{command:'bash',recreate:'Never'}})})
 if(!response.ok)throw Object.assign(Error('READ_HTTP_'+response.status),{status:response.status})
 const text=await response.text(),rows=text.split(/\r?\n/).map(line=>line.replace(/\x1b\[[0-9;]*[A-Za-z]/g,'').trim()).filter(line=>line.startsWith('{')&&line.endsWith('}')).flatMap(line=>{try{return[JSON.parse(line)]}catch{return[]}})
 if(rows.length!==1||rows[0].readOnly!==true)throw Error('READ_RECEIPT_UNCONFIRMED')

 hosts.push({side,...rows[0]})
 }
 return {status:'read-only-host-inventory',hosts,productionWrites:0}
}
