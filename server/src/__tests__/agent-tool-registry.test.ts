import assert from 'node:assert/strict'
import test from 'node:test'
import { productSkills } from '../agent-runtime/system-skills.js'
import { createProductTools } from '../agent-runtime/tools.js'

test('the LingxiOS registry exposes every product capability exactly once', () => {
  const tools = createProductTools(() => { throw new Error('unused') })
  const actions = tools.map(tool => tool.action)
  assert.equal(new Set(actions).size, actions.length)
  assert.deepEqual([...new Set(actions.map(action => action.split('.')[0]))], [
    'files', 'documents', 'design', 'slides', 'learning', 'teacher', 'directory', 'research',
    'polls', 'chat', 'knowledge', 'routines', 'memory',
  ])
  assert.deepEqual(actions.filter(action => action.startsWith('visualize.')), [])
})

test('retired visualizations expose no skill, activation or authoring instructions', () => {
  assert.deepEqual(productSkills.filter(skill => skill.name === 'visualize' || skill.actions.some(action => action.startsWith('visualize.'))), [])
  assert.ok(productSkills.every(skill => !/visualize\.(?:save|read|chart|diagram|export)|ZCode/.test(skill.body)))
})
