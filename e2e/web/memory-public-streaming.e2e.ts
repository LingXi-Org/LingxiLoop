import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

// Failure model: docs/evidence/issue-245/FAILURE-MODEL.md. Actual production
// decoder/store/React components; synthetic wire snapshots, no paid provider.
test.describe('Memory public streaming', { tags: ['memory-public-streaming'],
  ...(process.env.E2E_MEMORY_PRIVACY_FIXTURE === '1' ? {} : { skip: 'Requires the isolated component fixture.' }),
}, () => {
  test('public explanations and a memory tool stay in order while SSE remains open', async ({ app, browser, screen }) => {
    await app.open('/e2e/native-streaming.html')
    const send = async (stage: number) => browser.evaluate((stage: number) => {
      const publicText = (id: string, text: string) => ({ type: 'text', text, providerMetadata: { lingxiloop: { activity: { version: 1, id, kind: 'commentary', label: '公开说明' } } } })
      window.dispatchEvent(new CustomEvent('native-streaming-snapshot', { detail: { message: {
        id: 'run-run', role: 'assistant', createdAt: '2026-10-20T00:00:00Z',
        content: [publicText('before', '我先查看你授权的记忆。'), ...(stage >= 2 ? [{ type: 'tool-call', toolCallId: 'host:memory', toolName: 'memory.list', args: {}, argsText: '',
          ...(stage >= 3 ? { result: { status: 'completed' } } : {}), providerMetadata: { lingxiloop: { activity: { version: 1, id: 'host:memory', kind: 'tool', label: '查看记忆' } } } }] : []),
          ...(stage >= 3 ? [publicText('after', '已查到目录，正在核对相关条目。')] : []),
          ...(stage >= 4 ? [{ type: 'text', text: '检查已完成。' }] : [])],
        status: stage >= 4 ? { type: 'complete', reason: 'stop' } : { type: 'running' },
        metadata: { unstable_state: null, unstable_annotations: [], unstable_data: [], steps: [], custom: { runId: 'run', activityPresentation: { version: 1 }, activityHistory: { total: 7, attention: 1 },
          harness: { runId: 'run', requestVersion: 1, fence: 1, messageFence: stage >= 4 ? 1 : 0, lastSeq: stage,
            lifecycle: stage >= 4 ? 'succeeded' : 'leased', delivery: stage >= 4 ? 'delivered' : null, artifacts: [] } } },
      } } }))
      return true
    }, stage)
    await send(1)
    await expect(browser.locator('[data-slot="run-activity"] button').first()).toContainText('我先查看你授权的记忆。')
    await browser.locator('[data-slot="run-activity"] button').first().tap()
    await send(2)
    await expect(browser.locator('[data-native-part="tool-call"]')).toBeVisible()
    await expect(screen.getByText('我先查看你授权的记忆。', { exact: true })).toBeVisible()
    await send(3)
    await expect(screen.getByText('已查到目录，正在核对相关条目。', { exact: true })).toBeVisible()
    await expect(screen.getByText('我先查看你授权的记忆。', { exact: true })).toBeVisible()
    expect(await browser.evaluate(() => [...document.querySelectorAll('[data-slot="run-activity"] [data-native-part]')].map(node => node.getAttribute('data-native-part')))).toEqual(['text', 'tool-call', 'text'])
    expect(await browser.locator('[data-native-part="tool-call"]').count()).toBe(1)
    expect(await browser.evaluate(() => /查看全部活动|查看需要注意的记录|PRIVATE_REASONING/.test(document.body.textContent ?? ''))).toBe(false)
    await app.screenshot('memory-interleaved-before-final')
    await send(4)
    await expect(screen.getByText('检查已完成。', { exact: true })).toBeVisible()
    await expect(screen.getByText('我先查看你授权的记忆。', { exact: true })).toBeVisible()
    await app.screenshot('memory-interleaved-complete')
  })
})
