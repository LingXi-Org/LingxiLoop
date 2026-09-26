import assert from 'node:assert/strict'
import test from 'node:test'
import { createProductTools } from '../agent-runtime/tools.js'

test('the LingxiOS registry exposes every product capability exactly once', () => {
  const tools = createProductTools(() => { throw new Error('unused') })
  const actions = tools.map(tool => tool.action)
  assert.equal(new Set(actions).size, actions.length)
  assert.deepEqual([...new Set(actions.map(action => action.split('.')[0]))], [
    'files', 'calendar', 'documents', 'canvas', 'learning', 'teacher', 'directory', 'handoffs', 'research',
    'polls', 'chat', 'knowledge', 'email', 'presentations', 'routines',
  ])
})
