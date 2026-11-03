import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import test from 'node:test'
import ts from 'typescript'
import * as builder from './build-design-editor.mjs'

test('Design separates exact critical native source programs before entering synchronous consumers', async () => {
  assert.equal(typeof builder.splitCriticalDesignSources,'function')
  const original=await readFile('third_party/baoyu-design/upstream/claude-design/scripts/editor/assets/index-CYLuwRoc.js','utf8')
  const expected=new Map(),tree=ts.createSourceFile('pin.js',original,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS)
  const ids={IO:'react',FO:'reactDom',OO:'support',MO:'picker'}
  function visit(n){if(ts.isVariableDeclaration(n)&&ids[n.name.text])expected.set(ids[n.name.text],n.initializer.text);ts.forEachChild(n,visit)}visit(tree)
  const split=builder.splitCriticalDesignSources(original)
  assert.equal(expected.size,4);assert.equal(split.files.size,4)
  for(const[id,text]of expected){const item=split.programs[id],bytes=split.files.get(item.file);assert.equal(bytes.toString(),text);assert.equal(item.sha256,createHash('sha256').update(bytes).digest('hex'));assert.ok(!split.source.includes(JSON.stringify(text)))}
  assert.throws(()=>builder.splitCriticalDesignSources(original.replace('MO=','MissingMO=')),/critical/)
})

test('critical preparation coalesces, preserves successful code and retries before native initialization exactly once', async () => {
  assert.equal(typeof builder.createDesignStartup,'function')
  const calls=[],bodies={react:'native react',support:'native support'};let fail=true,initialized=0,earlyReadySignals=0
  const host={Event:class {},dispatchEvent:()=>{earlyReadySignals++},fetch:async(url,options)=>{calls.push({url,options});return{ok:!(url.endsWith('support.js')&&fail),text:async()=>bodies[url.endsWith('support.js')?'support':'react']}}}
  const programs={react:{url:'https://assets.test/react.js',integrity:'sha256-test-react'},support:{url:'https://assets.test/support.js',integrity:'sha256-test-support'}}
  const startup=builder.createDesignStartup(programs,host)
  startup.run(()=>{initialized++;assert.deepEqual({...startup.sources},bodies)})
  const pending=startup.prepare();assert.equal(startup.prepare(),pending)
  await pending;assert.equal(startup.status,'failed');assert.equal(initialized,0)
  assert.equal(startup.sources.react,'native react')
  fail=false;await startup.prepare();assert.equal(startup.status,'ready');assert.equal(initialized,1)
  startup.run(()=>{initialized++});await startup.prepare();assert.equal(initialized,1)
  assert.equal(earlyReadySignals,0,'preparation must not signal readiness before the native module body resumes')
  assert.equal(calls.filter(x=>x.url.endsWith('react.js')).length,1);assert.equal(calls.filter(x=>x.url.endsWith('support.js')).length,2)
  assert.ok(calls.every(x=>x.options.credentials==='omit'&&x.options.integrity.startsWith('sha256-')))
})
