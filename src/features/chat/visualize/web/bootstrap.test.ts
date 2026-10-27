import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import { readFile } from 'node:fs/promises'
import { transform } from 'esbuild'

test('capture loads only through the private channel and never consumes an author replacement global', async () => {
  const links: {onload():void;onerror():void;attrs:Record<string,string>}[]=[], sent: {type:string;error?:string}[]=[]
  const port={postMessage:(value:typeof sent[number])=>sent.push(value),start(){},onmessage:async(_event:{data:unknown})=>{}}
  let imported=0, captured=0
  const window={setTimeout:()=>0,clearTimeout(){},parent:{postMessage(){}},htmlToImage:{toCanvas:()=>{throw new Error('legacy must not be consumed')}}}
  const document={head:{append:(link:typeof links[number])=>links.push(link)},createElement:()=>({attrs:{},remove(){}}),fonts:{ready:Promise.resolve()},body:{}}
  const {code}=await transform(await readFile(new URL('./bootstrap.ts',import.meta.url),'utf8'),{loader:'ts',format:'iife',globalName:'Fixture'})
  const source=code.replace(/import\([^)]*\)/,'importCapture(url)')
  runInNewContext(`${source}; Fixture.trustedBootstrap({url:'https://app.test/assets/capture.js',integrity:'sha256-fixture'})`,{window,document,innerWidth:10,innerHeight:10,
    Element:{prototype:{setAttribute(this:typeof links[number],name:string,value:string){this.attrs[name]=value}}},
    EventTarget:{prototype:{addEventListener(){}}},MessageChannel:class{port1=port;port2={}},
    importCapture:async()=>{imported++;return {toCanvas:async()=>{captured++;throw new Error('trusted module reached')}}}})
  assert.equal(links.length,0,'bootstrap must not preload capture on startup')
  window.htmlToImage={toCanvas:()=>{throw new Error('author replacement was consumed')}}
  const first=port.onmessage({data:{type:'capture',id:'first'}})
  assert.equal(links.length,1)
  assert.equal(links[0].attrs.integrity,'sha256-fixture')
  links[0].onerror();await first
  assert.match(sent.at(-1)?.error ?? '',/resource failed/)
  const retry=port.onmessage({data:{type:'capture',id:'retry',rect:{x:0,y:0,width:10,height:10},pixelRatio:1}})
  assert.equal(links.length,2,'failed preloads are retryable')
  assert.match(links[1].attrs.href,/capture-retry=1/,'a failed browser module-map entry must not poison recovery')
  links[1].onload();await retry
  assert.equal(imported,1)
  assert.equal(captured,1)
  assert.match(sent.at(-1)?.error ?? '',/trusted module reached/)
})
