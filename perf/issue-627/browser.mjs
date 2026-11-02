import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright')
const root = resolve(import.meta.dirname, '../..'), port = 5187
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'ignore' })
let browser
try {
  const deadline = Date.now() + 30000
  while (true) {
    try { if ((await fetch(`http://127.0.0.1:${port}`)).ok) break } catch {}
    assert.ok(Date.now() < deadline, 'Vite did not start'); await new Promise(done => setTimeout(done, 100))
  }
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] })
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } })
  const errors = []; page.on('pageerror', error => errors.push(String(error)))
  await page.goto(`http://127.0.0.1:${port}/perf/issue-627/browser.html`)
  await page.locator('[data-slot="run-activity"] button').first().click()
  const identities = () => page.locator('[data-slot="run-activity"] [data-native-part="tool-call"]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-part-identity')))
  await page.locator('[data-slot="run-activity"] [data-tool-state="incomplete"]').waitFor()
  const first = await identities(); assert.equal(first.length, 2)
  assert.equal(await page.locator('[data-message-region="attention"] [data-native-part="tool-call"]').count(), 0)
  assert.equal(await page.locator('[data-slot="run-activity"] [data-tool-state="running"]').count(), 1)
  await page.screenshot({ path: `${root}/perf/issue-627/evidence/partial-running.png` })
  await page.locator('[data-stage="partial-retry"]').click()
  await page.getByText('后续检查已完成，未发现附件。首次失败记录保留。', { exact: false }).waitFor()
  const final = await identities(); assert.equal(final.length, 3); assert.deepEqual(final.slice(0, 2), first)
  assert.equal(await page.locator('[data-message-region="attention"] [data-native-part="tool-call"]').count(), 0)
  assert.equal(await page.locator('[data-slot="run-activity"] [data-tool-state="incomplete"]').count(), 1)
  await page.screenshot({ path: `${root}/perf/issue-627/evidence/completed-retry.png` })
  await page.reload(); await page.locator('[data-slot="run-activity"] button').first().click()
  assert.deepEqual(await identities(), final, 'refresh preserves original calls and retry order')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: `${root}/perf/issue-627/evidence/completed-mobile.png`, fullPage: true })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  await page.locator('[data-stage="cancel"]').click()
  await page.waitForFunction(() => document.querySelector('[data-slot="run-activity"]')?.getAttribute('data-status') === 'cancelled')
  // A different message owns its own disclosure state.
  const trigger = page.locator('[data-slot="run-activity"] button').first()
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click()
  assert.equal((await identities()).length, 2)
  assert.ok((await page.locator('[data-slot="run-activity"]').innerText()).includes('已取消'))
  await page.screenshot({ path: `${root}/perf/issue-627/evidence/cancelled-mobile.png`, fullPage: true })
  assert.deepEqual(errors, [])
  await writeFile(`${root}/perf/issue-627/evidence/browser.json`, JSON.stringify({ passed: true, browser: await browser.version(), first, final, checks: ['actual NativeMessageContent with real local Worker snapshots', 'failure plus live peer in same disclosure', 'later batch and answer retain first failed identity', 'retry is a separate original receipt', 'refresh retains call order', '390px no overflow', 'cancelled call stays in process'], productionRequests: 0, pageErrors: errors },null,2)+'\n')
  console.log('PASS #627 browser replay, retry, refresh and cancellation; desktop and 390px screenshots')
} finally { await browser?.close(); vite.kill() }
