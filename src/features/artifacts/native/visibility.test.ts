import assert from 'node:assert/strict'
import test from 'node:test'
import { createPage, createNode } from '../../../../shared/artifact-document'
import { elementBounds, expandVisibleNodes } from './visibility'

test('culling retains rotated descendants, active editor ancestors and flex siblings', () => {
  const page = createPage('page')
  const group = { ...createNode('group', 'group'), x: 100, y: 100, width: 200, height: 100, rotation: 90 }
  const child = { ...createNode('text', 'child'), parentId: 'group', x: 0, y: 0, width: 20, height: 10 }
  const sibling = { ...createNode('text', 'sibling'), parentId: 'group', x: 1000 }
  const other = { ...createNode('text', 'other'), x: 5000 }
  page.nodes = { group, child, sibling, other }; page.nodeOrder = ['group','child','sibling','other']
  const bounds = elementBounds(page).find(item => item.id === 'child')!
  assert.equal(Math.round(bounds.x), 238); assert.equal(Math.round(bounds.y), 48)
  assert.deepEqual([...expandVisibleNodes(page, [], ['child'])].sort(), ['child','group'])
  group.layout = { mode: 'flex' }
  assert.deepEqual([...expandVisibleNodes(page, ['child'])].sort(), ['child','group','sibling'])
  assert.ok(!expandVisibleNodes(page, ['child']).has('other'))
})

test('适配视图使用实际旋转外框，可见区域继续保留描边和阴影余量',()=>{
  const page=createPage('paint-bounds'),node={...createNode('shape','painted'),x:10,y:20,width:100,height:50,rotation:90,style:{strokeWidth:12,shadow:{x:3,y:4,blur:20,spread:5,color:'#000000'}}}
  page.nodes[node.id]=node;page.nodeOrder=[node.id]
  const raw=elementBounds(page,false)[0],paint=elementBounds(page)[0]
  for(const [key,value]of Object.entries({x:35,y:-5,width:50,height:100}))assert.ok(Math.abs(raw[key as 'x'|'y'|'width'|'height']-value)<1e-9)
  assert.ok(paint.x<=raw.x-12&&paint.y<=raw.y-12&&paint.width>=raw.width+24&&paint.height>=raw.height+24)
})
