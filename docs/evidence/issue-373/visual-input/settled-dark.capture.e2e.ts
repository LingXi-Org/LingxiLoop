import { test } from '@e2e-dev/web'
import { writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'

test('capture settled dark text at 390px on the original visual input source', async ({ app, browser }) => {
  await browser.setViewport({ width: 390, height: 900 })
  await app.open('/e2e/visual-input.html?theme=light&capture=settled-dark')
  await browser.locator('[contenteditable="true"]').waitFor({ state: 'visible' })
  await browser.evaluate(async () => {
    await (window as unknown as { visualInputStream(): Promise<Record<string, string | number>[]> }).visualInputStream()
    document.documentElement.classList.add('dark'); document.documentElement.dataset.theme = 'dark'
    return null
  })
  const source = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  const result = await browser.evaluate(async ({ source }) => {
    await new Promise<null>(resolve => requestAnimationFrame(() => resolve(null)))
    await new Promise(resolve => setTimeout(resolve, 850))
    const viewport = document.querySelector('[data-chat-viewport]')!
    const bounds = viewport.getBoundingClientRect()
    const words = [...document.querySelectorAll<HTMLElement>('[data-msg-id="history-11"] [data-streaming-fresh]')]
      .filter(node => { const rect = node.getBoundingClientRect(); return rect.bottom > bounds.top && rect.top < bounds.bottom })
    if (!words.length) throw new Error('No visible original streamed body text')
    const colors = () => [...new Set(words.map(node => getComputedStyle(node).color))]
    const first = colors()
    await new Promise<null>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(null))))
    const stable = JSON.stringify(first) === JSON.stringify(colors())
    if (!stable) throw new Error('Text color has not settled')
    const background = getComputedStyle(document.querySelector('[data-lingxi-assistant-thread]')!).backgroundColor
    const canvas = document.createElement('canvas'); canvas.width = 1; canvas.height = 1
    const context = canvas.getContext('2d')!
    const rgb = (color: string) => { context.clearRect(0, 0, 1, 1); context.fillStyle = color; context.fillRect(0, 0, 1, 1); return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3) }
    const luminance = (values: number[]) => values.map(value => { const c = value / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4 }).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0)
    const bg = luminance(rgb(background))
    return { source, theme: document.documentElement.dataset.theme,
      waitAfterThemeFrameMs: 850, stableAcrossTwoFrames: stable, visibleWordSamples: words.length,
      width: innerWidth, documentWidth: document.documentElement.scrollWidth, viewportWidth: viewport.clientWidth,
      background, backgroundSrgb: rgb(background), colors: first.map(color => { const channels = rgb(color), fg = luminance(channels); return { color, srgb: channels, contrastToThreadBackground: (Math.max(bg, fg) + .05) / (Math.min(bg, fg) + .05) } }) }
  }, { source })
  console.log('SETTLED_DARK_EVIDENCE', JSON.stringify(result))
  await writeFile('docs/evidence/issue-373/visual-input/settled-dark-metrics.json', JSON.stringify(result, null, 2))
  await app.screenshot('settled-dark-390')
})
