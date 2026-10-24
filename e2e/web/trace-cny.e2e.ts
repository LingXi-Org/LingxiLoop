import { readFileSync } from 'node:fs'
import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

test('captured RMB embedding cost and its K-token tariff survive live trace, history and reload',async ({ app,browser,screen }) => {
  const frames = JSON.parse(readFileSync(process.env.ISSUE297_CNY_SNAPSHOTS ?? '.e2e/issue297-cny-snapshots.json','utf8'))
  await browser.setViewport({ width: 390,height: 1000 })
  for (const phase of ['live','history','replay']) {
    await app.open('/e2e/native-streaming.html')
    await browser.evaluate(snapshot=>{ window.dispatchEvent(new CustomEvent('native-streaming-snapshot',{ detail: snapshot }));return true },frames[phase])
    await browser.locator('[data-slot="run-activity"] button').first().press('Enter')
    await browser.locator('[data-slot="run-activity-details"] summary').press('Enter')
    await expect(screen.getByRole('region','运行瀑布图')).toBeVisible()
    const proId = frames[phase].message.metadata.custom.runTrace.root.children.find((item: { model?: string })=>item.model === 'Pro/BAAI/bge-m3').id
    await browser.locator(`[data-trace-span-id="${proId}"] [aria-controls]`).press('Enter')
    const content = await browser.evaluate(()=>document.querySelector('[data-slot="trace-waterfall"]')?.textContent ?? '')
    expect(content).toContain('¥0.0000007 CNY')
    expect(content).toContain('¥0.000070 / 千输入 tokens')
    expect(content).not.toContain('$0.0000001')
    expect(content).not.toMatch(/PRIVATE_SYNTHETIC_INPUT|synthetic-test-key/)
    expect(await browser.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await app.screenshot(`trace-cny-${phase}`)
    await browser.reload()
  }
})
