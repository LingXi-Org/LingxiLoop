import os,pathlib,subprocess,time,json
base='accel.way2api.fun/docker.io/library/node@sha256:de170b39439eb0e5a3444ad7d60b015614a381e10fecae2e30ec9e735122f38d'
prod_cache='/workspace/441-442-checks/officeparser/lingxi-441-npm-cache'
web_cache='/tmp/lingxi-442-cache-web'
evidence=pathlib.Path('/tmp/lingxi-441-442-evidence')
os.environ['BUILDX_CONFIG']='/tmp/lingxi-buildx'
for label,root,target in [('baseline-deps','/tmp/lingxi-441-442-baseline','measurement-runtime-deps'),('candidate-deps','/workspace/441-442-image-candidate','measurement-runtime-deps'),('candidate-full','/workspace/441-442-image-candidate','')]:
 root=pathlib.Path(root)
 source=root/'server/docker/lingxiloop-server.Dockerfile'
 text=source.read_text()
 parts=text.split('FROM ${NODE_BASE_IMAGE} AS spa-build')
 parts[0]=parts[0].replace('RUN --mount=type=secret,id=npm_token \\\n','RUN --mount=type=secret,id=npm_token \\\n    --mount=type=bind,from=server_npm_cache,target=/npm-seed \\\n').replace('    NODE_AUTH_TOKEN=', '    cp -a /npm-seed/. /root/.npm/ && NODE_AUTH_TOKEN=').replace(' npm ci ', ' npm ci --offline ')
 parts[1]=parts[1].replace('RUN --mount=type=secret,id=npm_token \\\n','RUN --mount=type=secret,id=npm_token \\\n    --mount=type=bind,from=web_npm_cache,target=/npm-seed \\\n').replace('    NODE_AUTH_TOKEN=', '    cp -a /npm-seed/. /root/.npm/ && NODE_AUTH_TOKEN=').replace(' npm ci ', ' npm ci --offline ')
 text='FROM ${NODE_BASE_IMAGE} AS spa-build'.join(parts)
 if target:
  text+='\nFROM ${NODE_BASE_IMAGE} AS measurement-runtime-deps\nWORKDIR /app\nCOPY --from=deps /app/node_modules ./node_modules\n'
 file=root/'server/docker/offline-measurement.Dockerfile'
 file.write_text(text)
 file.with_suffix(file.suffix+'.dockerignore').write_bytes(source.with_suffix(source.suffix+'.dockerignore').read_bytes())
 args=['docker','buildx','build','--platform','linux/amd64','--build-arg','NODE_BASE_IMAGE='+base,'--build-context','server_npm_cache='+prod_cache,'--build-context','web_npm_cache='+web_cache,'-f',str(file),'-t','lingxiloop-441-442:'+label,'--load','--progress','plain']
 if target:args+=['--target',target]
 args+=['.']
 start=time.monotonic()
 with (evidence/(label+'-offline.log')).open('w') as log: result=subprocess.run(args,cwd=root,stdout=log,stderr=subprocess.STDOUT)
 (evidence/(label+'-offline-result.json')).write_text(json.dumps({'elapsedSeconds':time.monotonic()-start,'exitCode':result.returncode,'baseImage':base,'source':str(root)},indent=2)+'\n')
 print(label,result.returncode,flush=True)
 if result.returncode:raise SystemExit(result.returncode)
