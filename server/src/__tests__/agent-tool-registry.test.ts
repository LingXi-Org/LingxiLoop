import assert from 'node:assert/strict'
import test from 'node:test'
import { createProductTools } from '../agent-runtime/tools.js'

test('the LingxiOS registry exposes every product capability exactly once', () => {
  const tools = createProductTools(() => { throw new Error('unused') })
  const actions = tools.map(tool => tool.action)
  assert.equal(new Set(actions).size, actions.length)
  assert.deepEqual([...new Set(actions.map(action => action.split('.')[0]))], [
    'visualize', 'files', 'documents', 'canvas', 'learning', 'teacher', 'directory', 'research',
    'polls', 'chat', 'knowledge', 'presentations', 'routines',
  ])
  assert.deepEqual(actions.filter(action => action.startsWith('visualize.')), [
    'visualize.read_reference', 'visualize.save', 'visualize.read', 'visualize.export',
  ])
})
