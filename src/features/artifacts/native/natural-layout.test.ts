import assert from 'node:assert/strict'
import test from 'node:test'
import {createNode,createPage} from '../../../../shared/artifact-document'
import {NaturalLayouts,withNaturalLayout} from './natural-layout'
import {elementBounds} from './visibility'

test('natural note geometry reaches visibility calculations without changing stored content or fixed objects',()=>{
  const page=createPage('contents'),note={...createNode('note','note'),height:40},shape=createNode('shape','shape')
  page.nodes={note,shape};page.nodeOrder=['note','shape']
  const original=JSON.stringify(page),sizes=new NaturalLayouts().forPage(page.id)
  sizes.set(note,{width:240,height:425.9375});sizes.set(shape,{width:999,height:999})
  const view=withNaturalLayout(page,sizes)
  assert.equal(view.nodes.note!.height,425.9375)
  assert.equal(view.nodes.shape,shape)
  assert.equal(view.nodeOrder,page.nodeOrder)
  assert.equal(JSON.stringify(page),original)
  assert.ok(elementBounds(view).find(bounds=>bounds.id==='note')!.height>425)
  const edited={...page,nodes:{...page.nodes,note:{...note,text:'另一位作者修改的内容'}}}
  assert.equal(withNaturalLayout(edited,sizes),edited,'old node layout does not override a new immutable node')
})

test('natural layout caches evict pages and keep recent page identities within the eight-page bound',()=>{
  const layouts=new NaturalLayouts(),first=layouts.forPage('first'),zero=layouts.forPage('page-0')
  for(let i=1;i<7;i++)layouts.forPage(`page-${i}`)
  assert.equal(layouts.size,8)
  assert.equal(layouts.forPage('first'),first)
  layouts.forPage('next')
  assert.equal(layouts.size,8)
  const evicted=layouts.forPage('page-0')
  assert.notEqual(evicted,zero)
  assert.equal(layouts.forPage('first'),first)
  assert.equal(layouts.size,8)
})
