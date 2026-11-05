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
