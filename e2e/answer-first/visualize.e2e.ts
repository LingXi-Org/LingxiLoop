import { test } from '@e2e-dev/web'
import { expect } from 'e2e'
import { annotation, command, origin, snapshot } from './data'

test('a completed run waits for its verified delivery alias without requesting a UI run ID', async ({ app, browser, screen }) => {
  const text = '正文已经完整交付。\n\n::visualize{"path":"/fixture/acceptance.html","title":"交付引用"}'
  const view = (sourceMessageId: string | undefined, seq: number) => snapshot([{ type: 'text', text, ...annotation('delivery-reference-answer', 'answer') }], {
    seq, status: { type: 'complete', reason: 'stop' }, view: { lifecycle: 'succeeded', delivery: 'delivered', resultId: 'delivered-result' },
    custom: sourceMessageId ? { sourceMessageId } : {},
  })
  await fetch(`${origin}/__visualize_fixture/reset`)
  await command('reset', { snapshot: view(undefined, 1) })
  await browser.addInitScript(() => {
    const original = window.fetch.bind(window), acquisitions: string[] = []
    Object.assign(window, { __deliveryAcquisitions: acquisitions })
    window.fetch = (input, init) => {
      if (String(input).endsWith('/visualize/pages') && init?.method === 'POST') acquisitions.push(JSON.parse(String(init.body)).sourceMessageId)
      return original(input, init)
    }
  })
  await app.open('/e2e/answer-first.html')
  await expect(screen.getByText('正文已经完整交付。', { exact: true })).toBeVisible()
  await expect(screen.getByText('正在核对已交付的交互视图引用…', { exact: true })).toBeVisible()
  expect(await browser.evaluate(() => Reflect.get(window, '__deliveryAcquisitions'))).toEqual([])
  await expect(browser.locator('[data-testid="gen-ui-card"]')).toHaveCount(0)
  await command('publish', view('verified-delivery-source', 2))
  await expect(browser.locator('[data-testid="gen-ui-card"][data-gen-ui-phase="ready"]')).toHaveCount(1)
  expect(await browser.evaluate(() => Reflect.get(window, '__deliveryAcquisitions'))).toEqual(['verified-delivery-source'])
  await command('publish', view(undefined, 3))
  await expect(browser.locator('[data-fixture-received]')).toHaveAttribute('data-fixture-received', '3')
  await expect(browser.locator('[data-testid="gen-ui-card"][data-gen-ui-phase="ready"]')).toHaveCount(1)
  expect(await browser.evaluate(() => Reflect.get(window, '__deliveryAcquisitions'))).toEqual(['verified-delivery-source'])
  await app.screenshot('verified-delivery-reference-before-preview')
})

// Separate from the v2 handoff: production intentionally acquires a visualization
// only when complete. This covers completed replay/owner rebinding, not an iframe
// that supposedly existed before the completion gate.
test('completed replay preserves the visualization and owner change rebinds acquisition', async ({ app, browser }) => {
  const text = '这是可视化前的正文。\n\n::visualize{"path":"/fixture/acceptance.html","title":"合成交互结果"}\n\n这是可视化后的正文。'
  const view = (sourceMessageId: string, seq: number) => snapshot([{ type: 'text', text, ...annotation('visual-answer', 'answer') }], {
    seq, status: { type: 'complete', reason: 'stop' }, view: { lifecycle: 'succeeded', delivery: 'delivered' }, custom: { sourceMessageId },
  })
  await fetch(`${origin}/__visualize_fixture/reset`)
  await command('reset', { snapshot: view('source-a', 1) })
  await browser.addInitScript(() => {
    // Observe synthetic acquisition requests without intercepting their results.
    const original = window.fetch.bind(window)
    const acquisitions: string[] = []
    Object.assign(window, { __acquisitions: acquisitions })
    window.fetch = (input, init) => {
      if (String(input).endsWith('/visualize/pages') && init?.method === 'POST') {
        acquisitions.push(JSON.parse(String(init.body)).sourceMessageId)
        document.documentElement.dataset.fixtureVisualOwners = acquisitions.join(',')
      }
      return original(input, init)
    }
  })
  await app.open('/e2e/answer-first.html')
  await expect(browser.locator('[data-testid="gen-ui-card"][data-gen-ui-phase="ready"]')).toHaveCount(1)
  await browser.evaluate(() => { Object.assign(window, { __visualFrame: document.querySelector('iframe[data-visualize-guest]') }); return true })
  await command('publish', view('source-a', 2))
  await expect(browser.locator('[data-fixture-received]')).toHaveAttribute('data-fixture-received', '2')
  expect(await browser.evaluate(() => ({ same: Reflect.get(window, '__visualFrame') === document.querySelector('iframe[data-visualize-guest]'), owners: Reflect.get(window, '__acquisitions') }))).toEqual({ same: true, owners: ['source-a'] })
  await command('publish', view('source-b', 3))
  await expect(browser.locator('[data-fixture-received]')).toHaveAttribute('data-fixture-received', '3')
  await expect(browser.locator('html')).toHaveAttribute('data-fixture-visual-owners', 'source-a,source-b')
  await expect(browser.locator('[data-testid="gen-ui-card"][data-gen-ui-phase="ready"]')).toHaveCount(1)
  expect(await browser.evaluate(() => Reflect.get(window, '__acquisitions'))).toEqual(['source-a', 'source-b'])
  await expect(browser.locator('[data-testid="gen-ui-card"] iframe[data-visualize-guest]')).toHaveCount(1)
  expect(await browser.evaluate(() => ({
    changed: Reflect.get(window, '__visualFrame') !== document.querySelector('[data-testid="gen-ui-card"] iframe[data-visualize-guest]'),
    oldVisible: (Reflect.get(window, '__visualFrame') as HTMLIFrameElement).checkVisibility(),
  }))).toEqual({ changed: true, oldVisible: false })
  await app.screenshot('answer-first-visualize-owner-rebound')
})

test('a late old-owner acquisition cannot activate inside the new owner card', async ({ app, browser }) => {
  const text = '受控所有者切换。\n\n::visualize{"path":"/fixture/acceptance.html","title":"所有者切换"}'
  const view = (sourceMessageId: string, seq: number) => snapshot([{ type: 'text', text, ...annotation('late-owner-answer', 'answer') }], {
    seq, status: { type: 'complete', reason: 'stop' }, view: { lifecycle: 'succeeded', delivery: 'delivered' }, custom: { sourceMessageId },
  })
  await fetch(`${origin}/__visualize_fixture/reset`)
  await fetch(`${origin}/__visualize_fixture/fault?stage=late-create`)
  await command('reset', { snapshot: view('late-source-a', 1) })
  await browser.addInitScript(() => {
    const original = window.fetch.bind(window)
    window.fetch = async (input, init) => {
      const response = await original(input, init)
      if (String(input).endsWith('/visualize/pages') && init?.method === 'POST') {
        await response.clone().json()
        const owner = JSON.parse(String(init.body)).sourceMessageId
        document.documentElement.dataset.fixtureCompletedOwners = `${document.documentElement.dataset.fixtureCompletedOwners ?? ''},${owner}`
      }
      return response
    }
  })
  await app.open('/e2e/answer-first.html')
  await browser.evaluate(async () => {
    const deadline = performance.now() + 5000
    while (performance.now() < deadline) {
      const evidence = await (await fetch('/__visualize_fixture/evidence')).json()
      if (evidence.blocked.includes('late-create')) return true
      await new Promise(requestAnimationFrame)
    }
    throw new Error('Old owner did not reach the controlled acquisition boundary')
  })
  // Clear the fault for new requests while deliberately retaining the old POST.
  await fetch(`${origin}/__visualize_fixture/fault?stage=`)
  await command('publish', view('late-source-b', 2))
  await expect(browser.locator('[data-fixture-received]')).toHaveAttribute('data-fixture-received', '2')
  await expect(browser.locator('[data-testid="gen-ui-card"][data-gen-ui-phase="ready"]')).toHaveCount(1)
  await expect(browser.locator('html')).toHaveAttribute('data-fixture-completed-owners', ',late-source-b')
  await browser.evaluate(() => { Object.assign(window, { __newOwnerFrame: document.querySelector('[data-testid="gen-ui-card"] iframe[data-visualize-guest]') }); return true })
  await fetch(`${origin}/__visualize_fixture/fault?stage=&release=1`)
  await expect(browser.locator('html')).toHaveAttribute('data-fixture-completed-owners', ',late-source-b,late-source-a')
  await expect(browser.locator('[data-testid="gen-ui-card"] iframe[data-visualize-guest]')).toHaveCount(1)
  expect(await browser.evaluate(() => Reflect.get(window, '__newOwnerFrame') === document.querySelector('[data-testid="gen-ui-card"] iframe[data-visualize-guest]'))).toBe(true)
  await app.screenshot('answer-first-late-owner-response-isolated')
})
