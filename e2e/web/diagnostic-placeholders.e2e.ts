import { readFileSync } from 'node:fs'
import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

// Failure model: docs/evidence/issue-295/FAILURE-MODEL.md. Real decoder/store/UI;
// synthetic owning server projections, no production or paid model calls.
test('waiting, answers, reconnect/replay and empty terminal errors never expose system placeholders', {
  ...(process.env.ISSUE295_SNAPSHOTS ? {} : { skip: 'Requires synthetic owning-projection snapshots.' }),
}, async ({app,browser,screen}) => {
  const snapshots = JSON.parse(readFileSync(process.env.ISSUE295_SNAPSHOTS!,'utf8'))
  const send = (name: string) => browser.evaluate(snapshot => {
    window.dispatchEvent(new CustomEvent('native-streaming-snapshot',{detail: snapshot})); return true
  },snapshots[name])
  const noDiagnostics = async () => expect(await browser.evaluate(() => document.body.textContent)).not.toMatch(/尚未收到模型|displayable model text|起始偏移未提供|未提供可展示的|时间相对运行|模型区间包含准入|记录未提供的/)
  await app.open('/e2e/native-streaming.html?full=1')
  await send('waiting')
  await expect(browser.locator('[data-slot="typing-indicator"]')).toBeVisible()
  await noDiagnostics()
  await send('answer')
  await expect(screen.getByText('真实答案正在流式输出。',{exact: true})).toBeVisible()
  await send('legacy')
  await expect(screen.getByText('真实答案正在流式输出。',{exact: true})).toBeVisible()
  await noDiagnostics()
  await browser.locator('[data-slot="run-activity"] button').first().tap()
  await expect(screen.getByText('已核对题目条件。',{exact: true})).toBeVisible()
  await browser.locator('[data-slot="run-activity-details"] summary').tap()
  await screen.getByRole('button','查看 运行 详情').tap()
  await noDiagnostics()
  await app.screenshot('diagnostics-removed-real-activity-preserved')
  await browser.reload()
  await send('legacy')
  await expect(screen.getByText('真实答案正在流式输出。',{exact: true})).toBeVisible()
  await noDiagnostics()
  await browser.reload()
  await send('partial')
  await expect(screen.getByText('答复尚未完成',{exact: true})).toBeVisible()
  await expect(screen.getByRole('button','重试',{exact: true})).toBeVisible()
  await noDiagnostics()
  await browser.reload()
  await send('failed')
  await expect(screen.getByText('回复生成失败',{exact: true})).toBeVisible()
  await expect(screen.getByRole('button','重试',{exact: true})).toBeVisible()
  await noDiagnostics()
  await app.screenshot('diagnostics-removed-error-retry-preserved')
})
