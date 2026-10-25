import test from 'node:test'
import assert from 'node:assert/strict'
import { executeBootstrap } from './transport.mjs'
import { buildInstallQueryCommand } from './index.mjs'
import { spawnSync } from 'node:child_process'
test('install query reads an absent receipt without running the installer',()=>{
  const result=spawnSync('/bin/bash',['-c',buildInstallQueryCommand({opsSha:'f'.repeat(40)})],{encoding:'utf8',timeout:5000})
  assert.equal(result.status,0,result.stderr)
  assert.equal(JSON.parse(result.stdout).receipt,null)
  assert.equal(JSON.parse(result.stdout).intent,null)
})
test('fixed bootstrap actions isolate terminal streams and serialize host effects', async t => {
  const prior = { key: process.env.KOMODO_API_KEY, secret: process.env.KOMODO_API_SECRET }
  process.env.KOMODO_API_KEY='test-existing-key';process.env.KOMODO_API_SECRET='test-existing-secret'
  t.after(()=>{for(const [name,value]of [['KOMODO_API_KEY',prior.key],['KOMODO_API_SECRET',prior.secret]]){if(value===undefined)delete process.env[name];else process.env[name]=value}})
  const calls=[]
  const fetcher=async(url,init)=>{calls.push({url,init,body:JSON.parse(init.body)});return new Response('{"version":1,"hashes":{}}\n')}
  await executeBootstrap('a','inventory',undefined,{fetcher})
  await executeBootstrap('a','query-credentials',undefined,{fetcher})
  assert.notEqual(calls[0].body.terminal,calls[1].body.terminal)
  for(const call of calls){assert.equal(call.body.target.params.server,'shanghai-a');assert.match(call.body.command,/flock --exclusive --timeout 120/);assert.equal(call.init.redirect,'error');assert(!call.init.body.includes('test-existing-secret'))}
  const tunnel={host:'a',tunnelId:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',origin:'http://127.0.0.1:17951',remoteConfigSha256:'a'.repeat(64)}
  await executeBootstrap('a','tunnel',{...tunnel,action:'query'},{fetcher})
  await executeBootstrap('a','tunnel',{...tunnel,action:'install'},{fetcher})
  assert.notEqual(calls[2].body.terminal,calls[3].body.terminal)
  assert.doesNotMatch(calls[2].body.command,/operator\.lock/)
  assert.match(calls[3].body.command,/flock --exclusive --timeout 120/)
  await assert.rejects(executeBootstrap('a','arbitrary-shell','rm -rf /',{fetcher}),/INVALID_BOOTSTRAP_ACTION/)
})
