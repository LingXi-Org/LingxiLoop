import pathlib,subprocess,os,json,hashlib,tarfile,gzip,io,time,sys
repo=pathlib.Path(sys.argv[1]).resolve()
label=sys.argv[3]
root=pathlib.Path(sys.argv[2]).resolve();root.mkdir(exist_ok=True)
out=root/label;out.mkdir(exist_ok=False)
df=repo/'server/docker/lingxiloop-server.Dockerfile'
raw=df.read_text();final=raw.split('\nFROM ')[-1]
copies=[line for line in final.splitlines() if line.startswith('COPY ') and not line.startswith('COPY --from=')]
probe=out/'probe.Dockerfile';probe.write_text('FROM scratch\nWORKDIR /app\n'+'\n'.join(copies)+'\n')
ignore=(repo/'server/docker/lingxiloop-server.Dockerfile.dockerignore').read_bytes();pathlib.Path(str(probe)+'.dockerignore').write_bytes(ignore)
env=dict(os.environ,BUILDX_CONFIG=str(root/'buildx'))
command=['docker','--context','default','buildx','build','--builder','default','--network','none','--progress','plain','--file',str(probe),'--output','type=local,dest='+str(out/'export'),str(repo)]
start=time.monotonic();run=subprocess.run(command,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,timeout=60)
(out/'buildkit.log').write_text(run.stdout)
assert run.returncode==0,run.stdout
payload=out/'export/app';inventory=[]
for p in sorted(payload.rglob('*')):
 if p.is_file():
  b=p.read_bytes();inventory.append({'path':p.relative_to(payload).as_posix(),'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()})
buffer=io.BytesIO()
with tarfile.open(fileobj=buffer,mode='w',format=tarfile.USTAR_FORMAT) as tar:
 for f in inventory:
  p=payload/f['path'];info=tarfile.TarInfo(f['path']);info.size=f['bytes'];info.mode=0o755 if os.access(p,os.X_OK) else 0o644;info.mtime=0;info.uid=info.gid=0;info.uname=info.gname='';tar.addfile(info,io.BytesIO(p.read_bytes()))
packed=buffer.getvalue()
receipt={'case':label,'base':subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip(),'dockerfileSha256':hashlib.sha256(df.read_bytes()).hexdigest(),'ignoreSha256':hashlib.sha256(ignore).hexdigest(),'copyInstructions':copies,'scope':'actual BuildKit final-stage non-cross-stage source COPY payload only; excludes base image, node_modules, built SPA and OCI metadata','files':len(inventory),'bytes':sum(f['bytes'] for f in inventory),'zcodeFiles':sum(f['path'].startswith('third_party/zcode/') for f in inventory),'zcodeBytes':sum(f['bytes'] for f in inventory if f['path'].startswith('third_party/zcode/')),'deterministicTarBytes':len(packed),'deterministicGzipBytes':len(gzip.compress(packed,mtime=0)),'probeElapsedSeconds':round(time.monotonic()-start,3),'imagePulls':0,'productionRequests':0,'inventory':inventory}
(out/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({k:v for k,v in receipt.items() if k not in ['inventory','copyInstructions']}))
