import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

// E2E_BASE_URL=https://www.assistant-ui.com E2E_OFFICIAL_STREAMING=1
// npm run test:e2e:web -- e2e/web/streaming-text-official.e2e.ts --video on
// Captures the actual upstream site, without replacing its network or source.
test('official Streaming text live reference', {
  ...(process.env.E2E_OFFICIAL_STREAMING === '1' ? {} : { skip: 'Opt-in upstream visual reference.' }),
}, async ({ app, browser }) => {
  await app.open('/elements/streaming-text')
  await expect(browser.locator('[data-slot="streaming-text"]')).toHaveCount(1)
  console.log('Upstream buttons', await browser.evaluate(() => [...document.querySelectorAll('button')]
    .map(node => ({ text: node.textContent, label: node.getAttribute('aria-label') })).filter(x => /replay|restart/i.test(`${x.text} ${x.label}`))))
  await app.screenshot('official-streaming-page')
  console.log('Official element', await browser.evaluate(() => {
    const root = document.querySelector('[data-slot="streaming-text"]')!
    return { text: root.textContent, html: root.outerHTML }
  }))
})
