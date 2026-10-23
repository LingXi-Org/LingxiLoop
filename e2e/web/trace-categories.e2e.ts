import { test } from '@e2e-dev/web'
import { expect } from 'e2e'
import { createRunView } from '@lyyzka/lingxios/ui'
import { createNativeMessage } from '../../src/lib/nativeMessage'
import type { RunTrace,TraceSpan } from '../../src/lib/runTrace'

const span = (id: string,name: string,kind: TraceSpan['kind'],workKind?: TraceSpan['workKind']): TraceSpan => ({
  id,name,kind,workKind,status: 'complete',start: 100,end: 400,durationMs: 300,
  tokensIn: null,tokensOut: null,cost: null,costEstimated: false,children: [],
})
const trace: RunTrace = { version: 1,startedAt: 1000,timingBasis: 'execution',truncated: false,limitations: [],root: {
  ...span('root','运行','agent'),start: 0,end: 900,durationMs: 900,tokensIn: 12,tokensOut: 3,cost: 0.001,
  children: [
    { ...span('model','生成回复','llm'),tokensIn: 12,tokensOut: 3,cost: 0.001 },
    span('skill','读取技能说明','tool','skill'),span('read','阅读资料','tool','retrieval'),
    { ...span('failed','保存文档','tool','tool'),status: 'error' },
    { ...span('retry','保存文档','tool','tool'),start: 450,end: 550,durationMs: 100 },
    { ...span('child','独立子任务','agent','subtask'),start: 200,end: 800,durationMs: 600,children: [
      { ...span('nested','子任务读取','tool','retrieval'),start: 250,end: 600,durationMs: 350 },
    ] },
    { ...span('historical','历史调用','tool','tool'),start: null,end: null,durationMs: 134,status: 'cancelled' },
  ],
} }
const frame = () => ({ message: createNativeMessage({ id: 'run-run',role: 'assistant',createdAt: new Date(1000).toISOString(),
  content: [{ type: 'text',text: '合成最终答复。',providerMetadata: { lingxiloop: { activity: { version: 1,id: 'answer:1:0',kind: 'answer',label: '答复' } } } }],
  status: { type: 'complete',reason: 'stop' },custom: { runId: 'run',activityPresentation: { version: 1 },
    activityTasks: { version: 1,tasks: [{ id: 'child',label: '独立子任务',status: 'complete' }] },
    harness: { ...createRunView('run'),requestVersion: 1,fence: 1,lifecycle: 'succeeded',delivery: 'delivered',artifacts: [] },runTrace: trace },
}) })

for (const [theme,width] of [['light',390],['dark',1440]] as const) test(`work categories retain actual hierarchy, retries and history ${theme} ${width}`,async ({ app,browser,screen }) => {
  await browser.setViewport({ width,height: 1100 })
  await app.open('/e2e/native-streaming.html')
  await browser.evaluate(dark=>{document.documentElement.classList.toggle('dark',dark);return true},theme === 'dark')
  const send = () => browser.evaluate(value=>{ window.dispatchEvent(new CustomEvent('native-streaming-snapshot',{detail:JSON.parse(value)}));return true },JSON.stringify(frame()))
  const open = async () => {
    await browser.locator('[data-slot="run-activity"] button').first().press('Enter')
    await browser.locator('[data-slot="run-activity-details"] summary').press('Enter')
  }
  await send();await open()
  await expect(screen.getByRole('region','运行瀑布图')).toBeVisible()
  for (const kind of ['model','skill','retrieval','tool','subtask']) await expect(browser.locator(`[data-trace-group="${kind}"]`)).toBeVisible()
  await expect(screen.getByRole('button','收起 运行',{exact:true})).toHaveCount(0)
  await expect(browser.locator('[data-trace-span-id="nested"]')).toHaveAttribute('data-trace-parent-id','child')
  await expect(browser.locator('[data-trace-span-id="nested"]')).toHaveCount(1)
  await expect(browser.locator('[data-trace-span-id="failed"]')).toHaveAttribute('data-trace-status','error')
  await expect(browser.locator('[data-trace-span-id="retry"]')).toHaveAttribute('data-trace-status','complete')
  const original = await browser.evaluate(()=>[...document.querySelectorAll<HTMLElement>('[data-trace-span-id]')].map(node=>{
    const lane=node.querySelector<HTMLElement>(':scope > [data-trace-row] > [data-trace-lane]')!
    return {id:node.dataset.traceSpanId ?? null,parent:node.dataset.traceParentId ?? null,status:node.dataset.traceStatus ?? null,start:lane.dataset.traceStart ?? null,end:lane.dataset.traceEnd ?? null}
  }))
  await screen.getByRole('button','收起 独立子任务').press('Enter')
  await expect(screen.getByRole('button','查看 子任务读取 详情')).not.toBeVisible()
  await send()
  await expect(screen.getByRole('button','展开 独立子任务')).toBeVisible()
  await screen.getByRole('button','展开 独立子任务').press('Enter')
  await screen.getByRole('button','检索与阅读 2',{exact:true}).tap()
  await expect(screen.getByRole('button','查看 子任务读取 详情')).toBeVisible()
  await expect(screen.getByRole('button','查看 保存文档 详情')).toHaveCount(0)
  await screen.getByRole('button','全部 9',{exact:true}).tap()
  await screen.getByRole('button','技能 1',{exact:true}).tap()
  await screen.getByRole('button','查看调用',{exact:true}).press('Enter')
  await expect(screen.getByRole('button','查看 独立子任务 详情')).toHaveAttribute('aria-pressed','true')
  await expect(screen.getByRole('button','全部 9',{exact:true})).toHaveAttribute('aria-pressed','true')
  await screen.getByRole('button','查看 历史调用 详情').tap()
  await expect(browser.locator('[data-trace-time]')).toHaveCount(0)
  await expect(browser.locator('[data-trace-span-id="historical"]')).toHaveAttribute('data-trace-status','cancelled')
  await browser.reload();await send();await open()
  const restored = await browser.evaluate(()=>[...document.querySelectorAll<HTMLElement>('[data-trace-span-id]')].map(node=>{
    const lane=node.querySelector<HTMLElement>(':scope > [data-trace-row] > [data-trace-lane]')!
    return {id:node.dataset.traceSpanId ?? null,parent:node.dataset.traceParentId ?? null,status:node.dataset.traceStatus ?? null,start:lane.dataset.traceStart ?? null,end:lane.dataset.traceEnd ?? null}
  }))
  expect(restored).toEqual(original)
  expect(await browser.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await app.screenshot(`trace-categories-${theme}-${width}`)
})
