import { test } from '@e2e-dev/web'
import { expect } from 'e2e'
import { mkdir, readFile, writeFile } from 'node:fs/promises'

// Authored before implementation. This fixture is component evidence only;
// provider-backed product and authorization acceptance use separate real flows.
test.describe('Composable interactive explanations', { tags: ['web', 'interactive-ui'], timeout: 120_000,
  ...(process.env.E2E_INTERACTIVE_FIXTURE === '1' ? {} : { skip: 'Requires the isolated interactive-ui fixture server.' }),
}, () => {
  for (const theme of ['light', 'dark']) {
    test(`continuous controls, recovery and mixed composition (${theme})`, async ({ app, browser, screen }) => {
      await browser.setViewport({ width: 390, height: 844 })
      await app.open(`/e2e/interactive-ui.html?theme=${theme}`)
      const slider = screen.getByRole('slider', '发射角度')
      await expect(slider).toBeEnabled()
      const before = await browser.locator('[data-result="projectile"]').textContent()
      await slider.focus()
      await browser.keyboard.press('ArrowRight')
      await expect(slider).toHaveAttribute('aria-valuenow', '46')
      expect(await browser.locator('[data-result="projectile"]').textContent()).not.toBe(before)
      await expect.poll(() => browser.evaluate(() => Number(document.querySelector('[data-fixture-saves]')?.getAttribute('data-fixture-saves')))).toBe(1)
      expect(await browser.locator('[data-fixture-actions]').getAttribute('data-fixture-actions')).toBe('0')
      await browser.reload()
      await expect(slider).toHaveAttribute('aria-valuenow', '46')
      expect(await browser.locator('[data-fixture-actions]').getAttribute('data-fixture-actions')).toBe('0')
      await screen.getByRole('button', '下一步').tap()
      await expect(screen.getByText('比较同一速度下不同角度的射程。', { exact: true })).toBeVisible()
      await expect(screen.getByRole('table', '概念对比')).toBeVisible()
      expect(await browser.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await app.screenshot(`interactive-mixed-390-${theme}`)
    })
  }

  test('draft, pending and stale messages are read-only and invalid source keeps its explanation', async ({ app, screen }) => {
    for (const mode of ['draft', 'pending', 'stale']) {
      await app.open(`/e2e/interactive-ui.html?mode=${mode}`)
      await expect(screen.getByRole('slider', '发射角度')).toBeDisabled()
      await expect(screen.getByRole('button', '解释当前结果')).toBeDisabled()
    }
    await app.open('/e2e/interactive-ui.html?mode=invalid')
    await expect(screen.getByText('角度为45度时，在同一高度落地的射程最大。', { exact: true })).toBeVisible()
    await expect(screen.getByText('UnknownUnsafeComponent')).toBeHidden()
  })

  test('all scientific displays provide values and predictions remain local', async ({ app, browser, screen }) => {
    await app.open('/e2e/interactive-ui.html?scenario=science')
    for (const [kind, label] of [['projectile', '抛射轨迹'], ['functions', '函数曲线比较'], ['dct', 'DCT 图像重建'], ['clt', '样本均值分布'], ['monty', '蒙提霍尔选门实验']]) {
      await screen.getByRole('figure', label).scrollIntoView()
      await expect(browser.locator(`[data-result="${kind}"]`)).toBeVisible()
    }
    await screen.getByLabel('你的预测').fill('换门胜率更高')
    expect(await browser.locator('[data-fixture-actions]').getAttribute('data-fixture-actions')).toBe('0')
    await app.screenshot('interactive-science-values')
  })

  test('duplicate clicks submit once and uncertain failures retry the same request', async ({ app, browser, screen }) => {
    await app.open('/e2e/interactive-ui.html?mode=action-retry')
    await expect(screen.getByRole('button', '解释当前结果')).toBeEnabled()
    await browser.evaluate(() => {
      const button = [...document.querySelectorAll('button')].find(item => item.textContent === '解释当前结果')!
      button.click(); button.click()
      return true
    })
    await expect(screen.getByRole('button', '重试提交')).toBeVisible()
    await screen.getByRole('button', '重试提交').tap()
    await expect(screen.getByText('已提交', { exact: true })).toBeVisible()
    expect(await browser.locator('[data-fixture-actions]').getAttribute('data-fixture-actions')).toBe('2')
    expect(await browser.locator('[data-fixture-action-identities]').getAttribute('data-fixture-action-identities')).toBe('1')
    await screen.getByRole('button', '解释当前结果').tap()
    expect(await browser.locator('[data-fixture-actions]').getAttribute('data-fixture-actions')).toBe('2')
    await app.screenshot('interactive-idempotent-retry')
  })

  test('a conflicting save pauses edits until an explicit reload', async ({ app, browser, screen }) => {
    await app.open('/e2e/interactive-ui.html?mode=save-conflict')
    const slider = screen.getByRole('slider', '发射角度')
    await expect(slider).toBeEnabled()
    await slider.focus()
    await browser.keyboard.press('ArrowRight')
    await expect(screen.getByRole('button', '重新载入')).toBeVisible()
    await expect(slider).toBeDisabled()
    expect(await browser.locator('[data-fixture-actions]').getAttribute('data-fixture-actions')).toBe('0')
  })

  test('reloading after a save conflict keeps an unconfirmed action retryable with the same identity', async ({ app, browser, screen }) => {
    await app.open('/e2e/interactive-ui.html?mode=action-reload')
    await expect(screen.getByRole('button', '解释当前结果')).toBeEnabled()
    await screen.getByRole('button', '解释当前结果').tap()
    await expect(browser.locator('[data-fixture-actions]')).toHaveAttribute('data-fixture-actions', '1')
    await screen.getByRole('slider', '发射角度').focus()
    await browser.keyboard.press('ArrowRight')
    await expect(screen.getByRole('button', '重新载入')).toBeVisible()
    await screen.getByRole('button', '重新载入').tap()
    await expect(screen.getByRole('button', '重试提交')).toBeEnabled()
    await screen.getByRole('button', '重试提交').tap()
    await expect(screen.getByText('已提交', { exact: true })).toBeVisible()
    expect(await browser.locator('[data-fixture-actions]').getAttribute('data-fixture-actions')).toBe('2')
    expect(await browser.locator('[data-fixture-action-identities]').getAttribute('data-fixture-action-identities')).toBe('1')
    await app.screenshot('interactive-action-retry-after-state-reload')
  })

  test('an unconfirmed newer result keeps the committed revision editable until native delivery', async ({ app, browser, screen }) => {
    await app.open('/e2e/interactive-ui.html?mode=revision-pending')
    const previous = browser.locator('[data-revision="1"]').getByRole('slider', '发射角度')
    const next = browser.locator('[data-revision="2"]').getByRole('slider', '发射角度')
    await expect(previous).toBeEnabled()
    await expect(next).toBeDisabled()
    await screen.getByRole('button', '确认新版本送达').tap()
    await expect(previous).toBeDisabled()
    await expect(next).toBeEnabled()
    await app.screenshot('interactive-revision-native-delivery-boundary')
  })

  test('offscreen simulation cancels its worker and never labels old results as new parameters', async ({ app, browser, screen }) => {
    await browser.addInitScript(() => {
      const counters = { created: 0, terminated: 0 }
      ;(window as unknown as { workerEvidence: typeof counters }).workerEvidence = counters
      const OriginalWorker = window.Worker
      window.Worker = class extends OriginalWorker {
        constructor(url: string | URL, options?: WorkerOptions) { super(url, options); counters.created++ }
        override terminate() { counters.terminated++; super.terminate() }
      }
    })
    await browser.setViewport({ width: 390, height: 844 })
    await app.open('/e2e/interactive-ui.html?scenario=worker')
    const figure = screen.getByRole('figure', '样本均值分布')
    await figure.scrollIntoView()
    await expect(browser.locator('[data-result="clt"]')).toBeVisible()
    await screen.getByRole('button', '增加样本量').scrollIntoView()
    await expect.poll(() => browser.evaluate(() => document.querySelector('figure')!.getBoundingClientRect().top > innerHeight + 200)).toBe(true)
    await expect.poll(() => browser.evaluate(() => (window as unknown as { workerEvidence: { terminated: number } }).workerEvidence.terminated)).toBeGreaterThan(0)
    await screen.getByRole('button', '增加样本量').tap()
    await expect(browser.locator('[data-result="clt"]')).toHaveCount(0)
    await figure.scrollIntoView()
    await expect(browser.locator('[data-result="clt"]')).toBeVisible()
    expect(await browser.locator('[data-result="clt"]').textContent()).toContain('0.0138889')
    const evidence = await browser.evaluate(() => (window as unknown as { workerEvidence: { created: number; terminated: number } }).workerEvidence)
    expect(evidence.created).toBeGreaterThanOrEqual(2)
    await app.screenshot('interactive-worker-offscreen-recalculation')
  })

  test('M0 baseline locks performance gates before independent acceptance', async ({ app, browser, screen }) => {
    test.skip(process.env.E2E_INTERACTIVE_BASELINE !== '1', 'Run the separate M0 baseline before independent acceptance.')
    await browser.addInitScript(() => {
      const samples: Array<{ name: string; duration: number }> = []
      ;(window as unknown as { uiTimings: typeof samples }).uiTimings = samples
      new PerformanceObserver(list => { for (const entry of list.getEntries()) if (entry.name.startsWith('lingxiloop.ui.') && samples.length < 256) samples.push({ name: entry.name, duration: entry.duration }) }).observe({ entryTypes: ['measure'] })
    })
    await app.open('/e2e/interactive-ui.html?baseline=1')
    const slider = screen.getByRole('slider', '发射角度')
    await expect(slider).toBeEnabled()
    await slider.focus()
    for (let index = 0; index < 30; index++) await browser.keyboard.press(index % 2 ? 'ArrowLeft' : 'ArrowRight')
    const samples = await browser.evaluate(() => (window as unknown as { uiTimings: Array<{ name: string; duration: number }> }).uiTimings)
    const interactions = samples.filter(sample => sample.name.endsWith('.interaction')).map(sample => sample.duration).sort((a, b) => a - b)
    expect(interactions.length).toBeGreaterThanOrEqual(20)
    const p95 = interactions[Math.ceil(interactions.length * .95) - 1]
    const ready = samples.find(sample => sample.name.endsWith('.ready'))?.duration ?? NaN
    expect(Number.isFinite(ready)).toBe(true)
    const gates = { version: 1, measuredAt: new Date().toISOString(), viewport: { width: 1440, height: 960 },
      scenario: 'Single mixed lesson; 30 alternating keyboard updates; isolated production fixture', samples,
      baseline: { interactionP95Ms: p95, readyMs: ready },
      limits: { interactionP95Ms: Math.max(100, Math.ceil(p95 * 3)), readyMs: Math.max(2000, Math.ceil(ready * 3)) },
      policy: 'Freeze before independent runs: 3× baseline with a 100 ms interaction / 2000 ms readiness floor; never change gates after seeing acceptance results.',
    }
    await mkdir('artifacts/interactive-ui/m0', { recursive: true })
    await writeFile('artifacts/interactive-ui/m0/performance-gates.json', JSON.stringify(gates, null, 2))
    await app.screenshot('interactive-m0-baseline')
  })

  test('independent long-list keyboard and pointer interaction meets frozen gates', async ({ app, browser, screen }) => {
    test.skip(process.env.E2E_INTERACTIVE_ACCEPTANCE !== '1', 'Run with the frozen M0 performance gate artifact.')
    const gates = JSON.parse(await readFile('artifacts/interactive-ui/m0/performance-gates.json', 'utf8')) as { measuredAt: string; limits: { interactionP95Ms: number; readyMs: number } }
    await browser.addInitScript(() => {
      const samples: Array<{ name: string; duration: number }> = []
      ;(window as unknown as { uiTimings: typeof samples }).uiTimings = samples
      new PerformanceObserver(list => { for (const entry of list.getEntries()) if (entry.name.startsWith('lingxiloop.ui.') && samples.length < 512) samples.push({ name: entry.name, duration: entry.duration }) }).observe({ entryTypes: ['measure'] })
    })
    await browser.setViewport({ width: 360, height: 800 })
    await app.open('/e2e/interactive-ui.html?long=1&theme=dark')
    const last = screen.getByRole('slider', '发射角度').last()
    await last.scrollIntoView()
    await expect(last).toBeEnabled()
    await last.focus()
    for (let index = 0; index < 24; index++) await browser.keyboard.press(index % 2 ? 'ArrowLeft' : 'ArrowRight')
    const rect = await browser.evaluate(() => {
      const node = [...document.querySelectorAll('[data-slot="slider"]')].at(-1)!
      const bounds = node.getBoundingClientRect()
      return { x: bounds.left, y: bounds.top + bounds.height / 2, width: bounds.width }
    })
    await browser.mouse.move(rect.x + rect.width * .25, rect.y)
    await browser.mouse.down()
    for (let index = 1; index <= 12; index++) await browser.mouse.move(rect.x + rect.width * (.25 + index / 24), rect.y)
    await browser.mouse.up()
    expect(await last.getAttribute('aria-valuenow')).not.toBe('45')
    expect(await browser.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(await browser.locator('[data-fixture-actions]').getAttribute('data-fixture-actions')).toBe('0')
    const samples = await browser.evaluate(() => (window as unknown as { uiTimings: Array<{ name: string; duration: number }> }).uiTimings)
    const interactions = samples.filter(sample => sample.name.endsWith('.interaction')).map(sample => sample.duration).sort((a, b) => a - b)
    const interactionP95Ms = interactions[Math.ceil(interactions.length * .95) - 1]
    const readyMs = Math.max(...samples.filter(sample => sample.name.endsWith('.ready')).map(sample => sample.duration))
    expect(interactions.length).toBeGreaterThanOrEqual(20)
    expect(interactionP95Ms).toBeLessThanOrEqual(gates.limits.interactionP95Ms)
    expect(readyMs).toBeLessThanOrEqual(gates.limits.readyMs)
    await writeFile('artifacts/interactive-ui/m0/independent-performance.json', JSON.stringify({ measuredAt: new Date().toISOString(), gatesFrom: gates.measuredAt,
      scenario: '20 mixed lessons; 360 px; keyboard and continuous pointer changes', interactionP95Ms, readyMs, samples, limits: gates.limits }, null, 2))
    await app.screenshot('interactive-independent-long-list-360-dark')
  })

  test('official adapter and direct Renderer use the same controls in the current external-store runtime', async ({ app, browser, screen }) => {
    test.skip(process.env.E2E_INTERACTIVE_ADAPTER !== '1', 'Requires the separately installed M0 adapter fixture.')
    for (const theme of ['light', 'dark']) {
      await app.open(`/e2e/interactive-adapter.html?theme=${theme}`)
      const sliders = screen.getByRole('slider', '发射角度')
      await expect(sliders).toHaveCount(2)
      for (const index of [0, 1]) {
        await sliders.nth(index).focus()
        await browser.keyboard.press('ArrowRight')
        await expect(sliders.nth(index)).toHaveAttribute('aria-valuenow', '46')
      }
      await screen.getByRole('button', '解释当前结果').first().tap()
      await expect(browser.locator('[data-direct-actions]')).toHaveAttribute('data-direct-actions', '1')
      await screen.getByRole('button', '解释当前结果').last().tap()
      await expect(browser.locator('[data-adapter-appends]')).toHaveAttribute('data-adapter-appends', '0')
      await expect(screen.getByRole('button', 'Open OpenUI Inspect')).toBeHidden()
      const themeEvidence = await browser.evaluate(() => [...document.querySelectorAll('[data-m0-variant]')].map(node => {
        const style = getComputedStyle(node)
        return { variant: node.getAttribute('data-m0-variant'), color: style.color, background: style.backgroundColor, font: style.fontFamily }
      }))
      await writeFile(`artifacts/interactive-ui/m0/adapter-theme-${theme}.json`, JSON.stringify({ theme, themeEvidence,
        runtime: 'Current @assistant-ui/react useExternalStoreRuntime with an official present_openui Tool UI',
        adapter: '@openuidev/assistant-ui@0.1.2; isolated compatible Zustand 4; host ThemeProvider disabled',
        customLearningAction: 'Direct Renderer delivers the authorized interaction event; the official present adapter ignores this custom action type.' }, null, 2))
      await app.screenshot(`interactive-m0-adapter-${theme}`)
    }
  })

  test('reduced-motion CSS and the touch pointer path preserve continuous control', async ({ app, browser, screen }) => {
    test.skip(process.env.E2E_INTERACTIVE_MOTION !== '1', 'Attach the official engine to an isolated Chrome through E2E_CDP_URL.')
    await browser.setViewport({ width: 390, height: 844 })
    await app.open('/e2e/interactive-ui.html?motion=1')
    // The engine currently defaults the native media preference to no-preference.
    // CDP sets only the test environment; all verification uses the official engine.
    const targets = await fetch(`${process.env.E2E_CDP_URL}/json/list`).then(response => response.json()) as Array<{ url: string; webSocketDebuggerUrl: string }>
    const page = targets.find(target => target.url === `${process.env.E2E_BASE_URL}/e2e/interactive-ui.html?motion=1`)
    if (!page) throw new Error('Dedicated motion-test page not found')
    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(page.webSocketDebuggerUrl)
      const timeout = setTimeout(() => { socket.close(); reject(new Error('Motion preference setup timed out')) }, 5_000)
      socket.onopen = () => socket.send(JSON.stringify({ id: 1, method: 'Emulation.setEmulatedMedia', params: { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] } }))
      socket.onerror = () => { clearTimeout(timeout); reject(new Error('Motion preference setup failed')) }
      socket.onmessage = event => {
        const response = JSON.parse(String(event.data)) as { id?: number; error?: { message: string } }
        if (response.id !== 1) return
        clearTimeout(timeout); socket.close()
        if (response.error) reject(new Error(response.error.message)); else resolve()
      }
    })
    const slider = screen.getByRole('slider', '发射角度')
    await expect(slider).toBeEnabled()
    expect(await browser.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true)
    const geometry = await browser.evaluate(() => {
      const root = document.querySelector('[data-slot="slider"]')!, thumb = root.querySelector('[role="slider"]')!
      const bounds = root.getBoundingClientRect()
      return { x: bounds.left, y: bounds.top + bounds.height / 2, width: bounds.width, touchAction: getComputedStyle(root).touchAction, transition: getComputedStyle(thumb).transitionDuration }
    })
    expect(geometry.touchAction).toBe('none')
    expect(parseFloat(geometry.transition)).toBeLessThanOrEqual(.00001)
    await browser.mouse.move(geometry.x + geometry.width / 2, geometry.y)
    await browser.mouse.down()
    // Native pointer capture is active; exercise the touch-specific PointerEvent
    // path without claiming physical-device coverage from desktop Chromium.
    await browser.evaluate(({ x, y, width }) => {
      const root = document.querySelector('[data-slot="slider"]')!
      const captured = [root, ...root.querySelectorAll('*')].find(node => node.hasPointerCapture(1))
      if (!captured) throw new Error('Native pointer capture was not acquired')
      for (let index = 1; index <= 10; index++) captured.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true, pointerId: 1, pointerType: 'touch', isPrimary: true, buttons: 1, clientX: x + width * (.5 + index / 40), clientY: y,
      }))
      return true
    }, geometry)
    await browser.mouse.up()
    expect(Number(await slider.getAttribute('aria-valuenow'))).toBeGreaterThan(45)
    expect(await browser.locator('[data-fixture-actions]').getAttribute('data-fixture-actions')).toBe('0')
    await writeFile('artifacts/interactive-ui/m0/motion.json', JSON.stringify({ measuredAt: new Date().toISOString(),
      media: 'Native Chrome prefers-reduced-motion: reduce set through CDP; read and asserted through @e2e-dev/web',
      transition: geometry.transition, touchAction: geometry.touchAction,
      pointerEvidence: 'Synthetic touch PointerEvents during native pointer capture; not physical touch hardware',
      finalAngle: await slider.getAttribute('aria-valuenow'), actionRequests: 0 }, null, 2))
    await app.screenshot('interactive-reduced-motion-touch-pointer')
  })
})
