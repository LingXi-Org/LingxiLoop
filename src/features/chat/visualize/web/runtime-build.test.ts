import assert from 'node:assert/strict'
import { test } from 'node:test'
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { createContext, runInContext, runInNewContext } from 'node:vm'
import { AppBridge } from '@modelcontextprotocol/ext-apps/app-bridge'
import { z } from 'zod'

// Exercise the emitted guest against the real official host SDK without a
// browser. It validates the import rewrite, not visual paint or layout.
execFileSync(process.execPath,['scripts/build-visualize-runtime.mjs'],{stdio:'pipe'})
const runtime=await readFile('server/assets/visualize-runtime/gen-ui.js','utf8')
const manifest=JSON.parse(await readFile('server/assets/visualize-runtime/manifest.json','utf8'))

test('guest build removes unused Zod language/compiler payload while retaining official SDK validation',()=>{
  assert.ok(Buffer.byteLength(runtime)<300_000)
  const inputs=Object.keys(manifest.contributions)
  assert.ok(inputs.some(name=>name.includes('@modelcontextprotocol/ext-apps/')))
  assert.deepEqual(inputs.filter(name=>name.includes('/zod/v4/locales/')).map(name=>name.split('/').at(-1)),['en.js'])
  assert.equal(inputs.some(name=>name.endsWith('/core/compile.js')||name.endsWith('/classic/from-json-schema.js')),false)
  assert.equal(manifest.adaptation.zodNamespaceImports.length,4)
})

test('emitted guest handshakes, persists state, follows up and opens links through the real host SDK',async()=>{
  const root=Object.assign(new EventTarget(),{dataset:{} as Record<string,string>,style:{setProperty(){},colorScheme:''}})
  const document=Object.assign(new EventTarget(),{documentElement:root,body:{},readyState:'loading',getElementById:()=>({textContent:JSON.stringify({modelContent:{count:2},privateContent:null})})})
  const events=new EventTarget()
  const sandbox:Record<string,unknown>={console:{debug(){},warn(){},error(){}},document,Event,CustomEvent,TextEncoder,TextDecoder,URL,URLSearchParams,AbortController,AbortSignal,crypto,performance,structuredClone,setTimeout,clearTimeout,WeakRef,FinalizationRegistry,MutationObserver:class{observe(){}disconnect(){}},
    addEventListener:events.addEventListener.bind(events),removeEventListener:events.removeEventListener.bind(events),dispatchEvent:events.dispatchEvent.bind(events)}
  sandbox.window=sandbox
  const transport={onmessage:undefined as ((message:unknown)=>void)|undefined,onclose:undefined as (()=>void)|undefined,
    async start(){},async close(){transport.onclose?.()},async send(data:unknown){queueMicrotask(()=>{const event=Object.assign(new Event('message'),{data,source:sandbox.parent});events.dispatchEvent(event)})}}
  sandbox.parent={postMessage(data:unknown){queueMicrotask(()=>transport.onmessage?.(data))}}
  const bridge=new AppBridge(null,{name:'slim-guest-regression',version:'1'},{openLinks:{},experimental:{'zcode/gen-ui':{}}},{hostContext:{theme:'light','zcode/genUiState':{modelContent:{count:2},privateContent:null}}})
  const calls:unknown[]=[]
  bridge.setRequestHandler('zcode/gen-ui/state',{params:z.object({state:z.object({modelContent:z.unknown(),privateContent:z.unknown()})}).strict(),result:z.object({})},async params=>{
    calls.push({state:params.state});await bridge.sendHostContextChange({'zcode/genUiState':params.state});return {}
  })
  bridge.setRequestHandler('zcode/gen-ui/follow-up',{params:z.object({prompt:z.string().min(1),title:z.string().optional()}).strict(),result:z.object({})},async params=>{calls.push(params);return {}})
  bridge.onopenlink=async params=>{calls.push(params);return {}}
  const initialized=new Promise<void>(resolve=>{bridge.oninitialized=()=>resolve()})
  await bridge.connect(transport as Parameters<typeof bridge.connect>[0])
  const context=createContext(sandbox,{codeGeneration:{strings:false,wasm:false}})
  runInContext(runtime,context)
  try {
    await Promise.race([initialized,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Guest initialization timed out')),2000))])
    assert.equal(typeof sandbox.Tweak,'function','actual Tweak support remains available')
    const api=sandbox.zcode as {widgetState:unknown;setWidgetState(state:unknown):Promise<void>;sendFollowUpMessage(value:unknown):Promise<void>;openExternal(value:unknown):Promise<void>}
    await api.setWidgetState({modelContent:{count:3}})
    assert.deepEqual(JSON.parse(JSON.stringify(api.widgetState)),{modelContent:{count:3},privateContent:null})
    await api.sendFollowUpMessage({prompt:'Explain the saved count'})
    await api.openExternal({href:'https://example.invalid/learning'})
    assert.equal(calls.length,3)
    assert.throws(()=>api.setWidgetState({modelContent:'x'.repeat(17000)}),/16 KiB/)
    await assert.rejects(api.sendFollowUpMessage({prompt:' '}))
    assert.equal(calls.length,3,'invalid calls cannot cross the official bridge')
    events.dispatchEvent(Object.assign(new Event('message'),{source:{},data:{jsonrpc:'2.0',method:'ui/notifications/host-context-changed',params:{'zcode/genUiState':{modelContent:{count:999}}}}}))
    assert.equal((api.widgetState as {modelContent:{count:number}}).modelContent.count,3,'foreign-window messages remain rejected')
    assert.equal(Object.getOwnPropertyDescriptor(sandbox,'zcode')?.writable,false)
  } finally {events.dispatchEvent(new Event('pagehide'));await bridge.close()}
})

test('tiny icon bundle contains only proven names and identical official SVG node data',async()=>{
  const full:Record<string,unknown>={},small:Record<string,unknown>={}
  runInNewContext(await readFile('third_party/zcode/skills/visualize/assets/vendor/lucide-1.17.0.js','utf8'),full)
  const tiny=await readFile('server/assets/visualize-runtime/kit-icons.js','utf8')
  runInNewContext(tiny,small)
  assert.ok(Buffer.byteLength(tiny)<5000)
  const original=(full.lucide as {icons:Record<string,unknown>}).icons,subset=(small.lucide as {icons:Record<string,unknown>}).icons
  assert.deepEqual(Object.keys(subset).sort(),['ChevronLeft','ChevronRight','Play','Search'])
  for(const name of Object.keys(subset))assert.equal(JSON.stringify(subset[name]),JSON.stringify(original[name]))
})
