import test from 'node:test'
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {nativeCommand,nativeOperation} from './native-operator.mjs'
test('native maintenance has fixed finite actions and no Docker/network-policy mutation',()=>{
 for(const action of ['query','install','validate','start','probe','docker-plan']){
  const source=nativeCommand('a',action)
  const result=spawnSync('python3',['-c','import ast,shlex,sys;ast.parse(shlex.split(sys.argv[1])[2])',source])
  assert.equal(result.status,0)
  assert.doesNotMatch(source,/os\.replace[^\n]*daemon|systemctl[^\n]*(?:restart|enable)|--insecure|curl[^\n]*['"]-k['"]/)
 }
 assert.throws(()=>nativeCommand('c','start'));assert.throws(()=>nativeCommand('a','restart-docker'))
})
test('unconfirmed terminal output is never retried, and fixed host/action receipt is returned',async()=>{
 let calls=0
 const env={KOMODO_API_KEY:'private',KOMODO_API_SECRET:'private'}
 const fetcher=async(_url,init)=>{calls++;const body=JSON.parse(init.body);assert.equal(body.target.params.server,'shanghai-b');assert.equal(body.terminal,'issue-514-native-b-query');return new Response('{"verified":false}\n')}
 assert.equal((await nativeOperation('b','query',{env,fetcher})).receipt.verified,false)
 await assert.rejects(nativeOperation('b','query',{env,fetcher:async()=>{calls++;return new Response('incomplete')}}),/UNCONFIRMED/)
 assert.equal(calls,2)
})
test('provider filter preserves original, excludes TLS bypass, resumes atomically and refuses drift',()=>{
 const script=`import shlex,sys,tempfile,pathlib,json,hashlib
source=shlex.split(sys.argv[1])[2].split('try:\\n with deadline():print')[0]
scope={};exec(source,scope)
with tempfile.TemporaryDirectory() as directory:
 p=pathlib.Path(directory)/'provider.yaml'
 original=json.dumps({'proxies':[{'name':'safe','type':'ss','server':'example.test','port':443,'password':'fixture-private'},{'name':'unsafe','type':'vless','server':'example.test','port':443,'skip-cert-verify':True}],'rules':['MATCH,REJECT']}).encode()
 p.write_bytes(original);expected=hashlib.sha256(original).hexdigest()
 scope['PROVIDER']=p;scope['provider_read']=lambda path=None:(path or p).read_bytes();scope['system_state']=lambda:{'ActiveState':'inactive'}
 result=scope['filter_provider'](expected)
 assert result['nodeCount']==1 and result['excludedNodeCount']==1
 assert json.loads(p.read_bytes())=={'proxies':[json.loads(original)['proxies'][0]]}
 assert p.with_name('mihomo-provider.uploaded-'+expected+'.yaml').read_bytes()==original
 assert scope['filter_provider'](expected)==result
 p.write_text('{}')
 try:scope['filter_provider'](expected);raise AssertionError('accepted drift')
 except RuntimeError as error:assert str(error)=='PROVIDER_CHANGED_SINCE_APPROVAL'
for raw in [b'proxies: []\\nproxies: []',b'proxies: &a [*a]']:
 try:scope['provider_nodes'](raw);raise AssertionError('accepted duplicate/alias')
 except RuntimeError:pass
`
 const result=spawnSync('python3',['-c',script,nativeCommand('a','filter-provider','a'.repeat(64))],{encoding:'utf8'})
 assert.equal(result.status,0,result.stderr)
 assert.equal(result.stdout,'')
})
