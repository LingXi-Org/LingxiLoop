import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { resolveToolDisplay, toolDisplay } from './runActivity'

// Failure inventory: docs/evidence/issue-215-218/README.md, written before fix.
test('tool receipts and old synthesized summaries avoid delivery implementation commentary', () => {
  for (const action of ['visualize.save','visualize.chart','visualize.diagram','visualize.sliding_window']) {
    assert.equal(toolDisplay(action,'completed').summary,'可视化内容已保存。')
    assert.match(toolDisplay(action,'failed').summary!,/重试/)
    assert.equal(resolveToolDisplay(action,'completed',{...toolDisplay(action),summary: '可视化内容已保存；展示引用是否交付会在答复中确认。'}).summary,'可视化内容已保存。')
  }
  assert.equal(resolveToolDisplay('visualize.save','completed',{...toolDisplay('visualize.save'),summary: '已经保存三组数据的对比图。'}).summary,'已经保存三组数据的对比图。')
})
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
