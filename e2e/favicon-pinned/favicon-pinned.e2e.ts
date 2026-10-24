import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

test('served favicon pixels and pinned title follow real API reloads', async ({ app, browser, screen }) => {
  await app.open('/e2e/favicon-pinned/index.html')
  const title = browser.locator('[data-conversation-id="ordinary"] [data-slot="item-title"]')
  const weight = () => browser.evaluate(() => getComputedStyle(document.querySelector('[data-conversation-id="ordinary"] [data-slot="item-title"]')!).fontWeight)
  await expect(title).toBeVisible()
  await expect.poll(weight).toBe('500')
  await screen.getByRole('button', '置顶 ordinary', { exact: true }).tap()
  await expect.poll(weight).toBe('600')
  await expect(browser.locator('[data-conversation-id="ordinary"] [aria-label="已置顶"]')).toBeVisible()
  await browser.reload()
  await expect(title).toBeVisible()
  await expect.poll(weight).toBe('600')
  await screen.getByRole('button', '取消置顶 ordinary', { exact: true }).tap()
  await expect.poll(weight).toBe('500')
  await expect(browser.locator('[data-conversation-id="ordinary"] [aria-label="已置顶"]')).toHaveCount(0)
  await browser.reload()
  await expect(title).toBeVisible()
  await expect.poll(weight).toBe('500')
  const favicon = await browser.evaluate(async () => {
    const links = [...document.querySelectorAll<HTMLLinkElement>('link[rel*="icon"]')].map(node => ({ rel: node.rel, href: node.href }))
    const image = new Image(); image.src = '/favicon-32.png?v=rounded-20261024'; await image.decode()
    const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 32
    const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0)
    return { links, alpha: context.getImageData(0, 0, 1, 1).data[3], width: innerWidth, documentWidth: document.documentElement.scrollWidth }
  })
  expect(favicon.alpha).toBe(0)
  expect(favicon.links.every(link => new URL(link.href).searchParams.get('v') === 'rounded-20261024')).toBe(true)
  expect(favicon.documentWidth).toBeLessThanOrEqual(favicon.width)
  console.log('FAVICON_PIN_EVIDENCE', JSON.stringify(favicon))
  await app.screenshot('rounded-assets-pinned-title')
})
