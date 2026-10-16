import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

for (const theme of ['light', 'dark']) {
  test(`mobile omits the complete map without reserving a gutter (${theme})`, async ({ app, browser }) => {
    await browser.setViewport({ width: 390, height: 640 })
    await app.open(`/e2e/question-index/index.html?turns=320&theme=${theme}`)
    await expect(browser.locator('[data-msg-id="q-320"]')).toBeVisible()
    await expect(browser.locator('[data-question-index]')).toHaveCount(0)
    await expect(browser.locator('[data-slot="conversation-map-tick"]')).toHaveCount(0)
    expect(await browser.evaluate(() => {
      const viewport = document.querySelector('[data-chat-viewport]')!.getBoundingClientRect()
      const readingArea = document.querySelector('[data-chat-reading-area]')!.getBoundingClientRect()
      return { noGutter: viewport.left === readingArea.left, overflow: document.documentElement.scrollWidth > innerWidth }
    })).toEqual({ noGutter: true, overflow: false })
    await app.screenshot(`official-map-hidden-mobile-${theme}`)
  })
}

test('crossing the mobile breakpoint unmounts the map and an open preview', async ({ app, browser }) => {
  await browser.setViewport({ width: 1440, height: 900 })
  await app.open('/e2e/question-index/index.html?theme=dark')
  await expect(browser.locator('[data-slot="conversation-map-tick"]')).toHaveCount(40)
  await browser.locator('[data-slot="conversation-map-tick"][aria-label^="第30次提问"]').hover()
  await expect(browser.locator('[data-base-ui-portal]')).toContainText('第30次提问')
  await browser.setViewport({ width: 767, height: 900 })
  await expect(browser.locator('[data-question-index]')).toHaveCount(0)
  await expect(browser.locator('[data-base-ui-portal]')).toHaveCount(0)
  await browser.setViewport({ width: 768, height: 900 })
  await expect(browser.locator('[data-slot="conversation-map-tick"]')).toHaveCount(40)
  await expect.poll(() => browser.evaluate(() => {
    const marker = document.querySelector('[data-slot="conversation-map-tick"][aria-current="true"]')!
    const rect = marker.getBoundingClientRect()
    const viewport = document.querySelector('[data-question-index-scroll]')!.getBoundingClientRect()
    return rect.top >= viewport.top && rect.bottom <= viewport.bottom
  })).toBe(true)
  await app.screenshot('official-map-desktop-breakpoint')
})
