import { mkdir, writeFile } from 'node:fs/promises'
import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

// Synthetic fixture only. See docs/visualize-range-failure-model.md.
test('range follows actual packet DOM through state, layout and font changes', async ({ app, browser }) => {
  await app.open('/e2e/visualize/index.html?implementation=product&window=1')
  const guest = browser.frameLocator('iframe[data-visualize-guest]:visible').frameLocator('iframe[data-visualize-content]')
  const root = guest.locator('.lx-window').first()
  const find = (selector: string) => guest.locator('.lx-window[aria-label="Packet window geometry"] ' + selector)
  const samples: unknown[] = []
  const check = async (label: string, base: number, size: number) => {
    await expect(root).toHaveAttribute('data-base', String(base))
    const end = Math.min(18, base + size)
    const geometry = async () => {
      const rect = await find('[data-window-outline]').boundingBox()
      const cells = await Promise.all(Array.from({ length: end - base }, (_, i) => find(`[data-packet="${base + i}"]`).boundingBox()))
      if (!rect || cells.some(cell => !cell)) return { error: 10000, rect, cells }
      const selected = cells.map(cell => cell!)
      const left = Math.min(...selected.map(cell => cell.x)), right = Math.max(...selected.map(cell => cell.x + cell.width))
      const top = Math.min(...selected.map(cell => cell.y)), bottom = Math.max(...selected.map(cell => cell.y + cell.height))
      return { error: Math.max(Math.abs(rect.x - left), Math.abs(rect.x + rect.width - right), Math.abs(rect.y - top), Math.abs(rect.y + rect.height - bottom)), rect, cells }
    }
    try { await expect.poll(async () => (await geometry()).error).toBeLessThan(1) }
    finally {
      samples.push({ label, base, size, ...await geometry() })
      await mkdir('.e2e/visualize-window', { recursive: true })
      await writeFile('.e2e/visualize-window/geometry.json', JSON.stringify(samples, null, 2))
    }
    await expect(find('[data-window-range]')).toHaveText(`窗口 [base=${base}, ${end - 1}]`)
    expect(await find('[data-in-window="true"]').count()).toBe(end - base)
  }
  await check('initial', 0, 4)
  // Test-only reproduction: nominal 72+8px arithmetic vs actual flex-shrunk row.
  await guest.getByRole('button', 'Show nominal-width failure', { exact: true }).tap()
  const bad = await guest.locator('[data-broken-outline]').boundingBox()
  const last = await guest.locator('[data-broken-packet="3"]').boundingBox()
  expect(bad!.x + bad!.width - last!.x - last!.width).toBeGreaterThan(50)
  samples.push({ label: 'synthetic-nominal-width-red', bad, last })
  await app.screenshot('synthetic-window-nominal-width-failure')

  await root.getByRole('button', '下一步', { exact: true }).tap()
  await check('sent', 0, 4)
  expect(await find('[data-packet-state="inflight"]').count()).toBe(4)
  await root.getByRole('button', '下一步', { exact: true }).tap()
  await check('ack', 4, 4)
  for (const size of [2, 4, 6]) {
    const slider = root.getByRole('slider', '窗口大小', { exact: true })
    await slider.press('Home')
    for (let i = 1; i < size; i++) await slider.press('ArrowRight')
    await check(`size-${size}`, 0, size)
    await root.getByRole('button', '下一步', { exact: true }).tap()
    await root.getByRole('button', '下一步', { exact: true }).tap()
    await check(`advance-${size}`, size, size)
  }
  await browser.setViewport({ width: 760, height: 960 })
  await check('resized', 6, 6)
  await guest.getByRole('button', 'Change inner geometry', { exact: true }).tap()
  await check('fractional-gap-border-scroll-scale', 6, 6)
  await guest.getByRole('button', 'Load local font', { exact: true }).tap()
  await expect(guest.locator('[data-font-status]')).toHaveText('loaded')
  await check('font-loaded', 6, 6)
  await guest.getByRole('button', 'Hide and reveal row', { exact: true }).tap()
  await check('revealed', 6, 6)
  // 4 gives a clipped final range 16..17, then empty at 18.
  await root.getByRole('slider', '窗口大小', { exact: true }).press('Home')
  for (let i = 1; i < 4; i++) await root.getByRole('slider', '窗口大小', { exact: true }).press('ArrowRight')
  for (let i = 0; i < 8; i++) await root.getByRole('button', '下一步', { exact: true }).tap()
  await check('partial-tail', 16, 4)
  await root.getByRole('button', '自动播放', { exact: true }).tap()
  await expect(root).toHaveAttribute('data-base', '18')
  await expect(find('[data-window-outline]')).toBeHidden()
  await expect(find('[data-window-range]')).toHaveText('全部已确认')
  await expect(root.getByRole('button', '下一步', { exact: true })).toBeDisabled()
  await expect(guest.locator('.lx-window').last()).toHaveAttribute('data-base', '0')
  await root.getByRole('button', '重置', { exact: true }).tap()
  await root.getByRole('button', '自动播放', { exact: true }).tap()
  await expect.poll(async () => Number(await root.getAttribute('data-base'))).toBeGreaterThan(0)
  await root.getByRole('button', '暂停', { exact: true }).tap()
  const pausedBase = Number(await root.getAttribute('data-base'))
  await check('autoplay-paused', pausedBase, 4)
  await app.screenshot('window-dom-range-correct')
  await mkdir('.e2e/visualize-window', { recursive: true })
  await writeFile('.e2e/visualize-window/geometry.json', JSON.stringify(samples, null, 2))
})
