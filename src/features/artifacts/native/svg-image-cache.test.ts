import assert from 'node:assert/strict'
import test from 'node:test'
import {cachedSvgImage,rememberSvgImage,observeSvgImage} from './svg-image-cache'

test('completed SVG images respect entry and byte budgets and reuse the least recent slot',()=>{
  for(let i=0;i<12;i++)rememberSvgImage(`small-${i}`,`image-${i}`)
  assert.equal(Array.from({length:12},(_,i)=>cachedSvgImage(`small-${i}`)).filter(Boolean).length,8)
  assert.equal(cachedSvgImage('small-0'),undefined)
  for(let i=0;i<8;i++)rememberSvgImage(`replace-${i}`,'image')
  rememberSvgImage('replace-7','updated')
  assert.equal(Array.from({length:8},(_,i)=>cachedSvgImage(`replace-${i}`)).filter(Boolean).length,8,'replacing a completed key must not evict an unrelated image')
  cachedSvgImage('replace-0');rememberSvgImage('new','image')
  assert.equal(cachedSvgImage('replace-1'),undefined)
  assert.equal(cachedSvgImage('replace-0'),'image')
  const large='x'.repeat(500000)
  for(let i=0;i<8;i++)rememberSvgImage(`large-${i}`,large)
  const retained=Array.from({length:8},(_,i)=>{const key=`large-${i}`,value=cachedSvgImage(key);return value?2*(key.length+value.length):0})
  assert.ok(retained.filter(Boolean).length<=8)
  assert.ok(retained.reduce((sum,size)=>sum+size,0)<=4*1024*1024)
  rememberSvgImage('oversized','x'.repeat(3*1024*1024))
  assert.equal(cachedSvgImage('oversized'),undefined)
})

test('recovering an image updates its visible copies and unsubscribed consumers stay detached',()=>{
  const values:string[]=[],stop=observeSvgImage('shared',url=>values.push(url))
  rememberSvgImage('shared','ready');assert.deepEqual(values,['ready'])
  stop();stop();rememberSvgImage('shared','new');assert.deepEqual(values,['ready'])
  const other:string[]=[],again=observeSvgImage('shared',url=>other.push(url))
  stop();rememberSvgImage('shared','recovered');assert.deepEqual(other,['recovered'])
  again()
})
