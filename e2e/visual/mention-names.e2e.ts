import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

// Failure cases: IDs leak into bubbles, prefixes match another member,
// code/email/link text is rewritten, or a roster rename leaves stale labels.
for (const width of [1440, 390]) {
  test(`sent mentions show member names (${width})`, async ({ app, browser, screen }) => {
    await browser.setViewport({ width, height: 960 })
    await app.open('/scripts/ui-experience-browser-check.html?surface=主应用&capture=1&theme=light&scenario=mention-names')
    if (width < 768) await browser.locator('[data-slot="sidebar"] [role="button"]').first().tap()
    const bubble = browser.locator('[data-msg-id="mention-names"] [data-message-bubble]')
    await expect(bubble).toBeVisible()
    await expect(bubble).toContainText('请找@思南，@所有人 @unknown @scouter')
    await expect(browser.locator('[data-msg-id="mention-names"] code').first()).toHaveText('@scout')
    await expect(screen.getByRole('button', '@scout')).toBeVisible()
    await expect(bubble).toContainText('mail@scout.cn')
    await app.screenshot(`sent-mention-names-${width}`)
  })
}
