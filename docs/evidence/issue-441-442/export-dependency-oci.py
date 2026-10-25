import tarfile,pathlib,json,gzip,hashlib,shutil,subprocess
root=pathlib.Path('/workspace/441-442-oci')
results={}
for label in ['baseline-deps','candidate-deps']:
 directory=root/(label+'.oci'); blobs=directory/'blobs/sha256';blobs.mkdir(parents=True,exist_ok=True)
 def blob(content):
  digest=hashlib.sha256(content).hexdigest();(blobs/digest).write_bytes(content);return digest,len(content)
 with tarfile.open(root/(label+'.docker.tar')) as tar:
  source=json.load(tar.extractfile('manifest.json'))[0]
  config=tar.extractfile(source['Config']).read();cfg_digest,cfg_size=blob(config)
  layers=[]
  for i,name in enumerate(source['Layers']):
   temp=blobs/('layer-'+str(i)+'.tmp')
   with temp.open('wb') as output,gzip.GzipFile(filename='',mode='wb',fileobj=output,compresslevel=6,mtime=0) as compressed,tar.extractfile(name) as data:shutil.copyfileobj(data,compressed)
   data=temp.read_bytes();digest=hashlib.sha256(data).hexdigest();temp.rename(blobs/digest)
   layers.append({'mediaType':'application/vnd.oci.image.layer.v1.tar+gzip','digest':'sha256:'+digest,'size':len(data),'uncompressedTarBytes':tar.getmember(name).size})
  manifest={'schemaVersion':2,'mediaType':'application/vnd.oci.image.manifest.v1+json','config':{'mediaType':'application/vnd.oci.image.config.v1+json','digest':'sha256:'+cfg_digest,'size':cfg_size},'layers':[{k:v for k,v in layer.items() if k!='uncompressedTarBytes'} for layer in layers]}
  md,ms=blob(json.dumps(manifest,separators=(',',':')).encode())
  (directory/'index.json').write_text(json.dumps({'schemaVersion':2,'manifests':[{'mediaType':manifest['mediaType'],'digest':'sha256:'+md,'size':ms,'platform':{'architecture':'amd64','os':'linux'}}]}))
  (directory/'oci-layout').write_text('{"imageLayoutVersion":"1.0.0"}')
  inspect=json.loads(subprocess.check_output(['docker','image','inspect','lingxiloop-441-442:'+label]))[0]
  results[label]={'imageId':inspect['Id'],'imageUncompressedBytes':inspect['Size'],'ociManifestDigest':'sha256:'+md,'compressedLayersBytes':sum(l['size'] for l in layers),'dependencyLayer':layers[-1],'baseLayers':layers[:-1]}
results['method']='Same pinned linux/amd64 Node22 base; actual Docker dependency-only images installed offline from integrity-checked original npm caches. OCI image layout exported from Docker save, each layer gzip level6 mtime0. This measures the production dependency layer, not full product images or registry/GHA transfer.'
pathlib.Path('/tmp/lingxi-441-442-evidence/dependency-oci-comparison.json').write_text(json.dumps(results,indent=2)+'\n')
print(json.dumps({k:{x:v[x] for x in ['imageUncompressedBytes','compressedLayersBytes','dependencyLayer']} for k,v in results.items() if isinstance(v,dict)},indent=2))
