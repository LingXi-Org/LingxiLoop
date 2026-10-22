import assert from 'node:assert/strict'
import test from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { load } from 'cheerio'
import { TaskCard } from './task-card'
import { RunActivity } from './run-activity'
import { readActivityTasks } from '@/lib/runActivity'

test('official task card keeps truthful terminal states and actions accessible outside its transcript', () => {
  for (const [state, label] of [['working', '进行中'], ['done', '已完成'], ['partial', '部分完成'], ['blocked', '受阻'], ['unknown', '—']] as const) {
    const $ = load(renderToStaticMarkup(<TaskCard state={state} label="公开子任务" actions={<button type="button">授权</button>} result="已交付结果"><p>任务过程</p></TaskCard>))
    assert.equal($('[data-slot="task-card"]').attr('data-state'), state)
    assert.match($.text(), new RegExp(label))
    assert.equal($('[data-slot="task-card-transcript"]').length, 0)
    assert.equal($('[data-slot="task-card-actions"] button').text(), '授权')
    assert.match($.text(), /已交付结果/)
    assert.doesNotMatch($.text(), /0s|耗时未知/)
  }
})

test('real public task relationships form cards while tool content remains in event order once', () => {
  const tasks = readActivityTasks({ version: 1, tasks: [
    { id: 'parent', label: '资料研究', status: 'running' },
    { id: 'child', parentId: 'parent', label: '来源核验', status: 'complete' },
  ] })!.tasks
  const $ = load(renderToStaticMarkup(<RunActivity status="running" statusLabel="进行中" open onOpenChange={() => {}} tasks={tasks} entries={[
    { id: 'c1', kind: 'commentary', label: '公开过程', content: <p>先检查资料</p> },
    { id: 't1', taskId: 'child', kind: 'tool', label: '核验来源', content: <p>唯一的工具详情</p> },
    { id: 'c2', kind: 'commentary', label: '检查结束', content: <p>后整理结果</p> },
  ]} />))
  assert.equal($('[data-slot="task-card"][data-task-id="parent"]').length, 1)
  const text = $.text()
  assert.equal(text.split('唯一的工具详情').length - 1, 1)
  assert.ok(text.indexOf('先检查资料') < text.indexOf('唯一的工具详情'))
  assert.ok(text.indexOf('唯一的工具详情') < text.indexOf('后整理结果'))
  assert.equal($('[data-activity-kind="tool"]').attr('data-task-id'), 'child')
  assert.doesNotMatch(text, /0 ms|耗时未知/)
})

test('missing or invalid task metadata leaves plain activities visible without invented tasks', () => {
  for (const tasks of [undefined, readActivityTasks({ version: 1, tasks: [
    { id: 'orphan', parentId: 'absent', label: '不可用关系', status: 'running' },
  ] })?.tasks]) {
    const $ = load(renderToStaticMarkup(<RunActivity status="complete" statusLabel="已完成" open onOpenChange={() => {}} tasks={tasks} entries={[{ id: 'tool', kind: 'tool', taskId: 'orphan', label: '真实工具', content: <p>平铺详情</p> }]} />))
    assert.equal($('[data-slot="task-card"]').length, 0)
    assert.equal($('[data-activity-kind="tool"]').text(), '平铺详情')
  }
})
