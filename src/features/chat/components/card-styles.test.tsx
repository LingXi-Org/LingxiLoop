import assert from 'node:assert/strict'
import test from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { createRunView, type ResponseEnvelope } from '@lyyzka/lingxios/ui'
import { AttachmentCard } from '@/components/assistant-ui/elements/attachment-card'
import { ArtifactCard } from '@/components/assistant-ui/elements/artifact-card'
import { PollCard } from '@/components/assistant-ui/elements/poll-card'
import { ProgressCard } from '@/components/assistant-ui/elements/progress-card'
import { DeliveryCard, RunProgressCard } from './RunResultCards'

test('attachment previews preserve file types and never turn opaque IDs or unsafe URLs into links', () => {
  const image = renderToStaticMarkup(<AttachmentCard filename="参考.png" mimeType="image/png" data="https://example.com/reference.png" sourceType="url" />)
  assert.match(image, /<img[^>]+alt="参考.png"/)
  const document = renderToStaticMarkup(<AttachmentCard filename="报告.pdf" mimeType="application/pdf" data="https://example.com/report.pdf" sourceType="url" />)
  assert.doesNotMatch(document, /<img/)
  assert.match(document, /打开附件：报告.pdf/)
  for (const [data, sourceType] of [['file-secret', 'id'], ['javascript:alert(1)', 'url']] as const) {
    const html = renderToStaticMarkup(<AttachmentCard filename="文件" mimeType="application/pdf" data={data} sourceType={sourceType} />)
    assert.doesNotMatch(html, /href=|<img/)
  }
})

test('poll lists retain single and multiple selection semantics and collapse submitted choices into a receipt', () => {
  const props = { title: '评审时间', options: [{ value: 'a', label: '周二', description: '10:00' }, { value: 'b', label: '周三', disabled: true }], value: ['a'], submitted: false, closed: false, onChange: () => {}, onSubmit: () => {} }
  for (const multiple of [true, false]) {
    const html = renderToStaticMarkup(<PollCard {...props} multiple={multiple} />)
    assert.match(html, multiple ? /type="checkbox"/ : /type="radio"/)
    assert.match(html, /checked=""/)
    assert.match(html, /disabled=""/)
    assert.match(html, /提交投票/)
  }
  const receipt = renderToStaticMarkup(<PollCard {...props} multiple={false} submitted />)
  assert.match(receipt, /已提交投票/)
  assert.doesNotMatch(receipt, /周三|<button/)
  const closed = renderToStaticMarkup(<PollCard {...props} value={[]} multiple={false} closed />)
  assert.match(closed, /投票已结束/)
  assert.doesNotMatch(closed, /<button/)
})

test('step results distinguish failed execution from failed delivery without inventing completed work', () => {
  const view = createRunView('run')
  view.lifecycle = 'failed'
  const failed = renderToStaticMarkup(<RunProgressCard view={view} error="Tool execution timed out" />)
  assert.match(failed, /工具执行超时/)
  assert.match(failed, /尚无已提交的答复/)
  assert.doesNotMatch(failed, /答复已生成/)
  view.lifecycle = 'succeeded'
  view.goalOutcome = { status: 'satisfied', requestVersion: 1, verification: 'passed' }
  view.delivery = 'failed'
  view.message = { version: 2, runId: 'run', agentId: 'agent', sessionId: 'session', body: '答复',
    envelope: { version: 1, body: '答复', requestVersion: 1, evidenceSnapshotId: 'evidence', citations: [], artifacts: [], goalOutcome: view.goalOutcome } }
  const delivery = renderToStaticMarkup(<RunProgressCard view={view} />)
  assert.match(delivery, /答复已生成/)
  assert.match(delivery, /投递未完成/)
  const reasoning = renderToStaticMarkup(<ProgressCard title="处理进度" steps={[{ id: 'reasoning', label: '思考过程', status: 'running', detail: '实际返回的内容' }]} />)
  assert.match(reasoning, /aria-current="step"/)
  assert.match(reasoning, /实际返回的内容/)
})

test('delivery manifests and previews expose labelled actions without unauthenticated download links', () => {
  const artifacts: ResponseEnvelope['artifacts'] = [{ path: '/workspace/报告.pdf', mime: 'application/pdf', size: 1024, sha256: 'a'.repeat(64) }]
  const html = renderToStaticMarkup(<DeliveryCard artifacts={artifacts} busy onDownload={() => {}} />)
  assert.match(html, /交付清单/)
  assert.match(html, /1.0 KB/)
  assert.match(html, /aria-label="下载 报告.pdf"/)
  assert.match(html, /disabled=""/)
  assert.doesNotMatch(html, /href=/)
  const preview = renderToStaticMarkup(<ArtifactCard title="调研报告" meta="12 页" preview={<div>真实封面</div>} onOpen={() => {}} openLabel="打开演示" />)
  assert.match(preview, /<button[^>]+aria-label="打开演示：调研报告"/)
})
