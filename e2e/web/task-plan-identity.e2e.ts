import { readFileSync } from 'node:fs'
import { test } from '@e2e-dev/web'
import { expect, type JsonValue } from 'e2e'

// Frames come from the owning RunStreamProjection regression, not handwritten
// plan props. The existing fixture uses the real AssistantTransport and store.
test('one explicit task updates in place through streaming, stale replay and reload', async ({ app,browser,screen }) => {
  const frames = JSON.parse(readFileSync(process.env.TASK_PLAN_SNAPSHOTS ?? '.e2e/issue354-plans.json','utf8'))
  const send = (snapshot: JsonValue) => browser.evaluate(value => { window.dispatchEvent(new CustomEvent('native-streaming-snapshot',{ detail: value }));return true },snapshot)
  await browser.setViewport({ width: 390,height: 900 })
  await app.open('/e2e/native-streaming.html')
  await send(frames.snapshots[0])
  await browser.locator('[data-slot="run-activity"] button').first().press('Enter')
  const plan = browser.locator('[data-slot="agent-plan"]')
  await expect(plan).toHaveCount(1)
  await expect(screen.getByRole('progressbar','合成四步任务进度')).toHaveAttribute('aria-valuenow','0')
  const identity = await browser.evaluate(() => document.querySelector('[data-native-part="generative-ui"]')?.getAttribute('data-part-identity') ?? null)
  expect(typeof identity).toBe('string')
  for (const [index,percent] of [[1,'25'],[2,'100']] as const) {
    await send(frames.snapshots[index])
    await expect(plan).toHaveCount(1)
    await expect(screen.getByRole('progressbar','合成四步任务进度')).toHaveAttribute('aria-valuenow',percent)
    expect(await browser.evaluate(() => document.querySelector('[data-native-part="generative-ui"]')?.getAttribute('data-part-identity') ?? null)).toBe(identity)
  }
  await send(frames.snapshots[0])
  await expect(plan).toHaveCount(1)
  await expect(screen.getByRole('progressbar','合成四步任务进度')).toHaveAttribute('aria-valuenow','100')
  expect(await browser.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await app.screenshot('task-plan-single-completed-after-stale-replay')
  await browser.reload();await send({ message: frames.history.message })
  await browser.locator('[data-slot="run-activity"] button').first().press('Enter')
  await expect(plan).toHaveCount(1)
  await expect(screen.getByRole('progressbar','合成四步任务进度')).toHaveAttribute('aria-valuenow','100')
  await app.screenshot('task-plan-single-history-reload')
  await browser.reload();await send(frames.cancelled)
  await browser.locator('[data-slot="run-activity"] button').first().press('Enter')
  await expect(plan).toHaveCount(1)
  await expect(screen.getByRole('progressbar','合成四步任务进度')).toHaveAttribute('aria-valuenow','25')
  await app.screenshot('task-plan-cancelled-keeps-real-progress')
})
