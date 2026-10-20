import type { Browser } from '@e2e-dev/web'
import { expect } from 'e2e'

/** Verify the browser's native media setting through JS and the CSS cascade. */
export async function assertNativeReducedMotion(browser: Browser) {
  const media = await browser.evaluate(() => {
    const probe = document.createElement('style')
    probe.textContent = ':root{--acceptance-native-reduce:no}@media(prefers-reduced-motion:reduce){:root{--acceptance-native-reduce:yes}}'
    document.head.append(probe)
    const result = {
      matchMedia: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      cssMedia: getComputedStyle(document.documentElement).getPropertyValue('--acceptance-native-reduce').trim(),
    }
    probe.remove()
    return result
  })
  console.log('Native reduced-motion media', JSON.stringify(media))
  expect(media.matchMedia).toBe(true)
  expect(media.cssMedia).toBe('yes')
  return media
}
