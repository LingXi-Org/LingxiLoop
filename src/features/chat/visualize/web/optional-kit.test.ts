import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import { readFile } from 'node:fs/promises'
import { transform } from 'esbuild'

test('optional kit waits for DOM demand, covers dynamic icons, and retries a failed resource', async () => {
  const requested: {src:string;integrity:string;crossOrigin:string;onload():void;onerror():void}[]=[]
  let mutate=()=>{}, headMutation=()=>{}, icon=false, iconName='play', tooltip=false, carousel=false, rendered=0
  const document={head:{append:(script: typeof requested[number])=>requested.push(script)},createElement:()=>({remove(){}}),
    querySelector:(selector:string)=> selector.includes('data-lucide') ? icon : selector.includes('data-tooltip') ? tooltip : selector.includes('viz-carousel') ? carousel : false,
    querySelectorAll:(selector:string)=>selector.startsWith('[data-lucide]')&&icon?[{getAttribute:()=>iconName}]:[], addEventListener(){},removeEventListener(){}}
  const assets=Object.fromEntries(['kit-tooltip.js','kit-carousel.js','kit-tabs.js','kit-icons.js','vendor/lucide-1.17.0.js'].map(name=>[name,{url:`https://app.test/assets/${name}`,integrity:'sha256-fixture'}]))
  const {code}=await transform(await readFile(new URL('./optional-kit.ts',import.meta.url),'utf8'),{loader:'ts',format:'iife',globalName:'Fixture'})
  runInNewContext(`${code}; Fixture.optionalKitBootstrap(assets,[],['play','search','chevronleft','chevronright'])`,{assets,document,window:{addEventListener(){},lucide:{createIcons:()=>{rendered++;icon=false}}},MutationObserver:class{constructor(callback:(records:unknown[])=>void){mutate=()=>callback([{target:document,addedNodes:[]}]);headMutation=()=>callback([{target:document.head,addedNodes:[]}])}observe(){}disconnect(){}}})
  assert.equal(requested.length,0,'a static document has no optional resource work')
  icon=true; mutate()
  assert.equal(requested.length,1)
  assert.match(requested[0].src,/kit-icons/)
  assert.equal(requested[0].crossOrigin,'anonymous')
  assert.equal(requested[0].integrity,'sha256-fixture')
  requested[0].onload(); await Promise.resolve(); await Promise.resolve()
  assert.equal(rendered,1)
  mutate(); await Promise.resolve()
  assert.equal(requested.length,1,'rendered SVGs must not cause an observer loop')
  tooltip=true; carousel=true;mutate()
  assert.equal(requested.length,3)
  requested[1].onerror();await Promise.resolve();await Promise.resolve()
  headMutation();await Promise.resolve()
  assert.equal(requested.length,3,'a failed loader removing itself cannot cause a retry loop')
  mutate()
  assert.equal(requested.length,4,'later DOM or user intent retries the failed tooltip read')
  assert.match(requested[3].src,/tooltip/)
  icon=true;iconName='cloud';mutate();await Promise.resolve();await Promise.resolve();await Promise.resolve()
  assert.equal(requested.length,5)
  assert.match(requested[4].src,/lucide/,'unknown dynamic icons retain the full pinned compatibility library')
})
