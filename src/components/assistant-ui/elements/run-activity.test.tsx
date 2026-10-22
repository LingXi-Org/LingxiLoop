import assert from 'node:assert/strict'
import test from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { load } from 'cheerio'
import { RunActivity } from './run-activity'

test('public activity precedes secondary runtime details within the same disclosure', () => {
  const $ = load(renderToStaticMarkup(<RunActivity status="complete" statusLabel="已完成" entries={[{ id: 'tool:1', kind: 'tool', label: '检索', content: <p>公开资料检索</p> }]} open onOpenChange={() => {}} trace={<div data-testid="trace">真实瀑布图</div>} attention={<button type="button">审批</button>}><p>正文答复</p></RunActivity>))
  const panel = $('[data-slot="collapsible-content"]').first()
  assert.equal(panel.find('details[data-slot="run-activity-details"]').length, 1)
  assert.equal(panel.find('details summary').text(), '运行详情')
  assert.equal(panel.find('details').attr('open'), undefined)
  assert.ok(panel.html()!.indexOf('公开资料检索') < panel.html()!.indexOf('真实瀑布图'))
  assert.doesNotMatch(panel.text(), /审批|正文答复/)
})

test('controlled open state is retained across running and terminal renders without fabricated timing', () => {
  for (const status of ['running', 'complete', 'error', 'cancelled'] as const) {
    for (const open of [true, false]) {
      let changes = 0
      const $ = load(renderToStaticMarkup(<RunActivity status={status} statusLabel="状态" entries={[{ id: 'public:1', kind: 'commentary', label: '真实步骤', content: <p>公开过程</p> }]} open={open} onOpenChange={() => { changes++ }} />))
      assert.equal($('[data-slot="collapsible-trigger"]').first().attr('aria-expanded'), String(open))
      assert.equal(changes, 0)
      assert.doesNotMatch($.text(), /0 ms|0s|时间未知|耗时未知/)
    }
  }
})

test('history controls belong to the sole process disclosure even with no live entries', () => {
  const $ = load(renderToStaticMarkup(<RunActivity status="complete" statusLabel="已完成" entries={[]} open onOpenChange={() => {}} historyControls={<button type="button">加载更早活动</button>} />))
  assert.equal($('[data-slot="run-activity"]').length, 1)
  assert.equal($('[data-slot="collapsible-content"] button').text(), '加载更早活动')
})

test('task diagnostics use the same secondary disclosure and archives do not replace the current summary', () => {
  const props = { status: 'running' as const, statusLabel: '进行中', onOpenChange: () => {},
    entries: [{ id: 'host:current', kind: 'tool' as const, label: '当前检索', content: <p>当前记录</p> },
      { id: 'archive:old', kind: 'commentary' as const, label: '旧说明', history: true, content: <p>旧记录</p> }] }
  const $ = load(renderToStaticMarkup(<RunActivity {...props} open
    onInspectTask={() => {}} trace={<p>已有调用记录</p>} tasks={[{ id: 'child:real', label: '子任务', status: 'running' }]}
    />))
  assert.equal($('[data-slot="task-card-actions"] button').text(), '查看调用')
  assert.equal($('details[data-slot="run-activity-details"]').length, 1)
  const closed = load(renderToStaticMarkup(<RunActivity {...props} open={false} />))
  assert.match(closed.text(), /当前检索/)
  assert.doesNotMatch(closed.text(), /旧说明/)
})

test('the latest step shares the compact status row so completion does not retract a body-leading line', () => {
  const $ = load(renderToStaticMarkup(<RunActivity status="running" statusLabel="处理中" open={false} onOpenChange={() => {}}
    entries={[{ id: 'host:step', kind: 'tool', label: '查看公开资料', content: <p>过程详情</p> }]} />))
  assert.match($('[data-slot="collapsible-trigger"]').text(), /查看公开资料/)
  assert.equal($('[data-slot="run-activity"] p').length, 0)
})
