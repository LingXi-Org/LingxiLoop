import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { toolDisplay } from './runActivity'

// Failure inventory: docs/evidence/issue-215-218/README.md, written before fix.
function sources(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? sources(path.join(root, entry.name)) : entry.name.endsWith('.ts') ? [path.join(root, entry.name)] : [])
}
test('every registered product action has specific copy and equivalent public alias', () => {
  const actions = new Set(sources('server/src').flatMap(file => [...readFileSync(file, 'utf8').matchAll(/nativeTool\('([^']+)'/g)].map(match => match[1])))
  assert.ok(actions.size > 70)
  const titles = new Map<string, string>()
  for (const action of actions) {
    const display = toolDisplay(action)
    assert.notEqual(display.title, '处理任务', action)
    assert.ok(!titles.has(display.title), `${action} shares generic title with ${titles.get(display.title)}`)
    titles.set(display.title, action)
    assert.deepEqual(toolDisplay(action.replace('.', '__')), display, action)
  }
})
test('runtime public actions and unknown identifiers have safe labels', () => {
  for (const action of ['task.read_evidence', 'task.read_attachment', 'catalog.discover', 'response.upgrade', 'task.inspect']) {
    assert.notEqual(toolDisplay(action).title, '处理任务', action)
    assert.deepEqual(toolDisplay(action.replace('.', '__')), toolDisplay(action))
  }
  assert.equal(toolDisplay('untrusted__PRIVATE_VALUE').title, '处理任务')
})
