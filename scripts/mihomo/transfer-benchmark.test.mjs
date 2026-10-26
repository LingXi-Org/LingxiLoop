import test from 'node:test'
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
test('download qualification rejects digest drift and authorization denial without retry or unsafe redirect',()=>{
 const script=`import importlib.util,io,hashlib,urllib.request,urllib.error
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('bench','scripts/mihomo/transfer-benchmark.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
blob=b'fixture-image-part';digest=m.sha(blob)
image={'configDigest':digest,'platformDigest':digest,'digest':digest,'archive':{'parts':[{'sha256':digest,'size':len(blob)}]}}
class Response(io.BytesIO):status=200
class Opener:
 def __init__(self,value):self.value=value;self.calls=0
 def open(self,request,timeout):
  self.calls+=1
  assert request.full_url=='https://release.lingxilearn.cn/v1/artifact-blobs/'+digest[7:]
  if isinstance(self.value,Exception):raise self.value
  return Response(self.value)
for value,status in [(blob,'download-verified'),(b'x'*len(blob),'unverified'),(urllib.error.HTTPError('https://release.lingxilearn.cn',403,'denied',{},None),'unverified')]:
 opener=Opener(value)
 with patch.object(m.urllib.request,'build_opener',return_value=opener),patch.object(m.pathlib.Path,'read_text',return_value='fixture-token-'*4):result=m.benchmark({'route':'r2','image':image})
 assert result['status']==status and result['retries']==0 and opener.calls==1
 assert result['imageLoaded']==False and result['dockerChanged']==False
 assert result['verifiedBytes']==(len(blob) if status=='download-verified' else 0)
request=urllib.request.Request('https://ghcr.io/v2/example/blobs/test',headers={'Authorization':'Bearer fixture-private'})
redirect=m.SafeRedirect().redirect_request(request,None,302,'',{},'https://pkg-containers.githubusercontent.com/blob?signature=fixture')
assert not redirect.has_header('Authorization')
try:m.SafeRedirect().redirect_request(request,None,302,'',{},'https://evil.example/blob');raise AssertionError('foreign redirect accepted')
except m.Refusal:pass
image['archive']['parts']*=7
opener=Opener(blob)
with patch.object(m.urllib.request,'build_opener',return_value=opener),patch.object(m.pathlib.Path,'read_text',return_value='fixture-token-'*4):result=m.benchmark({'route':'r2','image':image,'concurrency':3})
assert result['status']=='download-verified' and result['verifiedObjects']==7 and result['requests']==7 and result['verifiedBytes']==7*len(blob)
opener=Opener(urllib.error.HTTPError('https://release.lingxilearn.cn',403,'denied',{},None))
with patch.object(m.urllib.request,'build_opener',return_value=opener),patch.object(m.pathlib.Path,'read_text',return_value='fixture-token-'*4):result=m.benchmark({'route':'r2','image':image,'concurrency':3})
assert result['status']=='unverified' and result['retries']==0 and opener.calls<=3
`
 const result=spawnSync('python3',['-c',script],{encoding:'utf8'})
 assert.equal(result.status,0,result.stderr);assert.equal(result.stdout,'')
})
