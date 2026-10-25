from pathlib import Path
import shlex,os,subprocess,time,json
root=Path('/workspace/441-442-image-candidate')
source=root/'server/docker/lingxiloop-server.Dockerfile'
text=source.read_text()
# VFS copies the complete parent filesystem per COPY; consolidate only copies
# for local verification. Preserve original sources/destinations and build/check RUNs.
def cp_run(lines, mounts):
 commands=[]
 for line in lines:
  words=shlex.split(line);words.pop(0)
  prefix='/inputs'
  if words[0].startswith('--from='):
   prefix='/'+words.pop(0).split('=',1)[1]
  destination=words.pop()
  for path in words:
   src=prefix+'/'+path.lstrip('/')
   as_directory=destination.endswith('/') or len(words)>1
   file_destination=destination+'/' if as_directory else destination
   file_parent=destination if as_directory else str(Path(destination).parent)
   commands.append('if [ -d '+shlex.quote(src)+' ]; then mkdir -p '+shlex.quote(destination)+' && cp -a '+shlex.quote(src+'/.')+' '+shlex.quote(destination)+'/; else mkdir -p '+shlex.quote(file_parent)+' && cp -a '+shlex.quote(src)+' '+shlex.quote(file_destination)+'; fi')
 return 'RUN '+mounts+' \\\n    '+' && \\\n    '.join(commands)+'\n'
lines=text.splitlines(True)
spa=next(i for i,l in enumerate(lines) if l.startswith('FROM ') and 'AS spa-build' in l)
final=next(i for i,l in enumerate(lines[spa+1:],spa+1) if l.startswith('FROM '))
first_spa_copy=True
spa_copies=[];final_copies=[];output=[]
for i,line in enumerate(lines):
 if line.startswith('COPY ') and spa<i<final:
  if first_spa_copy:
   first_spa_copy=False;output.append(line)
  else:spa_copies.append(line)
 elif line.startswith('RUN npm run build'):
  output.append(cp_run(spa_copies,'--mount=type=bind,source=.,target=/inputs'))
  output.append(line)
 elif line.startswith('COPY ') and i>final:final_copies.append(line)
 elif line.startswith('ENV NODE_ENV=production'):
  output.append(cp_run(final_copies,'--mount=type=bind,source=.,target=/inputs --mount=type=bind,from=deps,source=/app,target=/deps/app --mount=type=bind,from=spa-build,source=/app,target=/spa-build/app'))
  output.append(line)
 else:output.append(line)
text=''.join(output)
parts=text.split('FROM ${NODE_BASE_IMAGE} AS spa-build')
for i,cache in enumerate(['server_npm_cache','web_npm_cache']):
 parts[i]=parts[i].replace('RUN --mount=type=secret,id=npm_token \\\n','RUN --mount=type=secret,id=npm_token \\\n    --mount=type=bind,from='+cache+',target=/npm-seed \\\n').replace('    NODE_AUTH_TOKEN=', '    cp -a /npm-seed/. /root/.npm/ && NODE_AUTH_TOKEN=').replace(' npm ci ', ' npm ci --offline ')
text='FROM ${NODE_BASE_IMAGE} AS spa-build'.join(parts)
file=root/'server/docker/consolidated-measurement.Dockerfile';file.write_text(text)
file.with_suffix(file.suffix+'.dockerignore').write_bytes(source.with_suffix(source.suffix+'.dockerignore').read_bytes())
os.environ['BUILDX_CONFIG']='/tmp/lingxi-buildx'
args=['docker','buildx','build','--platform','linux/amd64','--build-arg','NODE_BASE_IMAGE=accel.way2api.fun/docker.io/library/node@sha256:de170b39439eb0e5a3444ad7d60b015614a381e10fecae2e30ec9e735122f38d','--build-context','server_npm_cache=/workspace/441-442-checks/officeparser/lingxi-441-npm-cache','--build-context','web_npm_cache=/tmp/lingxi-442-cache-web','-f',str(file),'-t','lingxiloop-441-442:candidate-packaged','--load','--progress','plain','.']
start=time.monotonic()
with open('/tmp/lingxi-441-442-evidence/candidate-consolidated.log','w') as log: result=subprocess.run(args,cwd=root,stdout=log,stderr=subprocess.STDOUT)
Path('/tmp/lingxi-441-442-evidence/candidate-consolidated-result.json').write_text(json.dumps({'exitCode':result.returncode,'elapsedSeconds':time.monotonic()-start,'copyConsolidation':'Equivalent COPY source/destination groups consolidated for VFS disk limit; npm offline cached immutable tarballs; original build and packaged checks unchanged.'},indent=2)+'\n')
raise SystemExit(result.returncode)
