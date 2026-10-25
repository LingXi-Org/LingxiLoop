import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { importNodes, subscriptionURL, promote } from './refresh.mjs'
const valid = 'proxies:\n  - {name: test, type: ss, server: proxy.example.com, port: 443, cipher: aes-128-gcm, password: fixture}\nexternal-controller: 0.0.0.0:9090\nrules: [MATCH,DIRECT]\n'
test('imports only nodes; rejects duplicate names, aliases and unknown node control fields', () => {
 assert.deepEqual(Object.keys(importNodes(valid)), ['proxies'])
 for (const input of ['proxies: []', 'proxies: [', 'proxies: &x [*x]', valid.replace('password: fixture','password: fixture, dialer-proxy: DIRECT'), valid.replace('port: 443','port: 0')]) assert.throws(() => importNodes(input))
 const node=importNodes(valid).proxies[0];assert.throws(()=>importNodes(JSON.stringify({proxies:[node,node]})))
})
test('secret URL requires exact HTTPS origin and no credentials', () => {
 assert.equal(subscriptionURL('https://sub.example.com/path?token=fixture','https://sub.example.com').hostname,'sub.example.com')
 for (const x of ['http://sub.example.com/a','https://evil.example/a','https://user:pass@sub.example.com/a']) assert.throws(()=>subscriptionURL(x,'https://sub.example.com'))
})
test('failed syntax refresh preserves last validated provider byte for byte', async () => {
 const dir=await mkdtemp(join(tmpdir(),'mihomo-test-'))
 try {const nodes=importNodes(valid);await promote({directory:dir,nodes,validate:async()=>{}});const old=await readFile(join(dir,'provider.json'),'utf8');await assert.rejects(promote({directory:dir,nodes:{proxies:[]},validate:async()=>{throw Error('fixture failure')}}));assert.equal(await readFile(join(dir,'provider.json'),'utf8'),old)} finally {await rm(dir,{recursive:true,force:true})}
})
