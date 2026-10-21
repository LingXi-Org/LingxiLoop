import { readFileSync } from 'node:fs'
import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

test.describe('Open-source run trace', { ...(process.env.ISSUE283_SNAPSHOTS ? {} : { skip: 'Requires synthetic owning-projection snapshots.' }) }, () => {
  for (const theme of ['light','dark']) for (const width of [390,1440]) test(`trace tree, metrics, safe details and replay ${theme} ${width}`, async ({ app,browser,screen }) => {
    const snapshots = JSON.parse(readFileSync(process.env.ISSUE283_SNAPSHOTS!,'utf8'))
    for (const snapshot of Object.values(snapshots)) {
      const root = (snapshot as { message: { metadata: { custom: { runTrace: { root: { children: { id: string; children: Record<string,unknown>[] }[] } } } } } }).message.metadata.custom.runTrace.root
      const child = root.children.find(span => span.id === 'synthetic-child')!
      child.children.push({ ...child.children[0],id: 'synthetic-late-descendant',name: '后代结束更晚',start: 1900,end: 2200,durationMs: 300,children: [] })
    }
    await browser.setViewport({ width,height: 1100 })
    await app.open('/e2e/native-streaming.html')
    const send = (name: string) => browser.evaluate(snapshot => { window.dispatchEvent(new CustomEvent('native-streaming-snapshot',{detail: snapshot})); return true },snapshots[name])
    await browser.evaluate(dark => { document.documentElement.classList.toggle('dark',dark); return true },theme === 'dark')
    await send('running')
    await expect(screen.getByText('最终正文',{exact:true})).toBeVisible()
    await browser.locator('[data-slot="run-activity"] button').first().press('Enter')
    await expect(screen.getByRole('region','运行瀑布图')).toBeVisible()
    await expect(browser.locator('[data-trace-slowest]')).toBeVisible()
    await screen.getByRole('button','查看 阅读文档 详情').tap()
    await expect(screen.getByText('公开文档名',{exact:true})).toBeVisible()
    await screen.getByRole('button','收起 合成子任务').press('Enter')
    await expect(screen.getByRole('button','查看 子任务工具 详情')).not.toBeVisible()
    await screen.getByRole('button','展开 合成子任务').tap()
    await expect(screen.getByRole('button','查看 子任务工具 详情')).toBeVisible()
    const clock = await browser.locator('[data-trace-clock]').textContent()
    await browser.evaluate(async () => { await new Promise(resolve => setTimeout(resolve,350)); return true })
    expect(await browser.locator('[data-trace-clock]').textContent()).not.toBe(clock)
    await send('cancelled')
    await expect(browser.locator('[data-slot="run-activity"]')).toHaveAttribute('data-status','cancelled')
    const frozen = await browser.locator('[data-trace-clock]').textContent()
    await browser.evaluate(async () => { await new Promise(resolve => setTimeout(resolve,350)); return true })
    expect(await browser.locator('[data-trace-clock]').textContent()).toBe(frozen)
    await send('failed')
    await expect(browser.locator('[data-slot="run-activity"]')).toHaveAttribute('data-status','error')
    await send('completed')
    expect(await browser.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(await browser.evaluate(() => document.body.textContent)).not.toMatch(/PRIVATE|\$0\.0000|sk-/)
    expect(await browser.evaluate(() => document.querySelector('[data-slot="run-activity"]')?.textContent ?? '')).not.toContain('最终正文')
    const geometry = await browser.evaluate(async () => {
      await Promise.all(document.getAnimations().filter(animation => animation.effect?.getTiming().iterations !== Infinity)
        .map(animation => animation.finished.catch(() => {})))
      const axis = document.querySelector<HTMLElement>('[data-trace-axis]')!
      const axisBox = axis.getBoundingClientRect()
      const axisEnd = Number(axis.dataset.traceAxisEnd)
      const lanes = [...document.querySelectorAll<HTMLElement>('[data-trace-lane]')]
      const rowGeometry = lanes.map(lane => {
        const box = lane.getBoundingClientRect(),bar = lane.querySelector<HTMLElement>('[data-trace-bar]')
        const barBox = bar?.getBoundingClientRect()
        const metrics = lane.nextElementSibling as HTMLElement
        const label = metrics.querySelector<HTMLElement>('[data-testid="timeline-dense-duration"]')!
        const labelBox = label.getBoundingClientRect()
        return { left: box.left,width: box.width,
          start: lane.dataset.traceStart === '' ? null : Number(lane.dataset.traceStart),
          end: lane.dataset.traceEnd === '' ? null : Number(lane.dataset.traceEnd),
          barLeft: barBox?.left ?? null,barRight: barBox?.right ?? null,
          labelLeft: labelBox.left,labelRight: labelBox.right,labelTop: labelBox.top,labelBottom: labelBox.bottom,
          textFits: label.scrollWidth <= label.clientWidth && label.scrollHeight <= label.clientHeight,
          metricsTop: metrics.getBoundingClientRect().top,metricsBottom: metrics.getBoundingClientRect().bottom }
      })
      const badge = document.querySelector<HTMLElement>('[data-trace-slowest]')!
      const badgeBox = badge.getBoundingClientRect(),row = badge.closest('[data-trace-row]')!.getBoundingClientRect()
      return { axisLeft: axisBox.left,axisWidth: axisBox.width,axisEnd,rows: rowGeometry,
        badgeInline: badgeBox.top >= row.top && badgeBox.bottom <= row.bottom,
        maxBarRight: Math.max(...rowGeometry.map(item => item.barRight ?? 0)) }
    })
    console.log('TRACE_GEOMETRY',JSON.stringify({theme,width,...geometry}))
    expect(geometry.axisEnd).toBeGreaterThan(2200)
    expect(geometry.badgeInline).toBe(true)
    for (const row of geometry.rows) {
      expect(Math.abs(row.left-geometry.axisLeft)).toBeLessThanOrEqual(1)
      expect(Math.abs(row.width-geometry.axisWidth)).toBeLessThanOrEqual(1)
      expect(row.textFits).toBe(true)
      expect(row.labelTop).toBeGreaterThanOrEqual(row.metricsTop)
      expect(row.labelBottom).toBeLessThanOrEqual(row.metricsBottom)
      if (row.barRight !== null && row.barLeft !== null && row.start !== null && row.end !== null) {
        expect(Math.abs(row.barLeft-(geometry.axisLeft+row.start/geometry.axisEnd*geometry.axisWidth))).toBeLessThanOrEqual(1)
        expect(Math.abs(row.barRight-(geometry.axisLeft+row.end/geometry.axisEnd*geometry.axisWidth))).toBeLessThanOrEqual(1)
        expect(row.labelLeft-row.barRight).toBeGreaterThanOrEqual(0)
      }
    }
    expect(geometry.axisLeft+geometry.axisWidth-geometry.maxBarRight).toBeGreaterThan(5)
    await app.screenshot(`run-trace-${theme}-${width}`)
    await screen.getByRole('button','收起 合成子任务').press('Enter')
    expect(await browser.locator('[data-trace-axis]').getAttribute('data-trace-axis-end')).toBe(String(geometry.axisEnd))
    await app.screenshot(`run-trace-collapsed-${theme}-${width}`)
    await browser.reload(); await send('completed')
    await browser.locator('[data-slot="run-activity"] button').first().press('Enter')
    await expect(screen.getByRole('region','运行瀑布图')).toBeVisible()
    await expect(screen.getByText('最终正文',{exact:true})).toBeVisible()
  })
})

// A real scrollbar must not narrow the body independently of its axis header.
test('trace axis stays aligned while a long tree scrolls', {
  ...(process.env.ISSUE283_SNAPSHOTS ? {} : { skip: 'Requires synthetic owning-projection snapshots.' }),
},async ({app,browser,screen}) => {
  const snapshot = JSON.parse(readFileSync(process.env.ISSUE283_SNAPSHOTS!,'utf8')).completed
  const root = snapshot.message.metadata.custom.runTrace.root
  const tool = root.children.find((span: {kind: string}) => span.kind === 'tool')
  root.children.push(...Array.from({length: 30},(_,index) => ({...tool,id: `scroll-${index}`,name: `合成滚动步骤 ${index+1}`})))
  await browser.setViewport({width:390,height:1000})
  await app.open('/e2e/native-streaming.html')
  await browser.evaluate(value => { window.dispatchEvent(new CustomEvent('native-streaming-snapshot',{detail: value})); return true },snapshot)
  await browser.locator('[data-slot="run-activity"] button').first().press('Enter')
  await expect(screen.getByRole('region','运行瀑布图')).toBeVisible()
  const result = await browser.evaluate(() => {
    const viewport = document.querySelector<HTMLElement>('[data-trace-viewport]')!
    viewport.scrollTop = 200
    const axis = document.querySelector<HTMLElement>('[data-trace-axis]')!.getBoundingClientRect()
    return { scrolls: viewport.scrollHeight > viewport.clientHeight,scrollTop: viewport.scrollTop,
      allAligned: [...document.querySelectorAll<HTMLElement>('[data-trace-lane]')].every(lane => {
        const box = lane.getBoundingClientRect()
        return Math.abs(box.left-axis.left) <= 1 && Math.abs(box.width-axis.width) <= 1
      }) }
  })
  expect(result.scrolls).toBe(true)
  expect(result.scrollTop).toBeGreaterThan(0)
  expect(result.allAligned).toBe(true)
  await app.screenshot('run-trace-scrolled-narrow')
})
