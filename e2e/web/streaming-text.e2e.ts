import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

// Serve with: node node_modules/vite/bin/vite.js --port 5196 --strictPort
// Run with E2E_STREAMING_FIXTURE=1 E2E_BASE_URL=http://127.0.0.1:5196:
// npm run test:e2e:web -- e2e/web/streaming-text.e2e.ts --output artifacts/streaming-fix
// Failure cases: bursts skip intermediate text; asynchronous Markdown strands blue spans;
// old blocks replay entry; completion/replacement leaves a cursor; code/table/citation
// boundaries move the tail; narrow screens overflow.
test.describe('Streaming renderer', {
  ...(process.env.E2E_STREAMING_FIXTURE === '1' ? {} : { skip: 'Requires the streaming renderer fixture server.' }),
}, () => {
  for (const theme of ['light', 'dark']) {
    test(`bursts reveal continuously and the tail settles (${theme})`, async ({ app, browser }) => {
      await browser.setViewport({ width: theme === 'dark' ? 390 : 1440, height: 960 })
      await app.open(`/scripts/streaming-browser-check.html?theme=${theme}`)
      await expect(browser.locator('#body')).toContainText('准备')
      const step = (text: string, done = false) => browser.evaluate(({ text, done }) => {
        return window.dispatchEvent(new CustomEvent('streaming-text-step', { detail: { text, done } }))
      }, { text, done })
      const burst = '准备' + '连续输出的中文内容需要逐步呈现而不是整段闪现。'.repeat(12)
      const samples = await browser.evaluate(async (text) => {
        window.dispatchEvent(new CustomEvent('streaming-text-step', { detail: { text, done: false } }))
        const lengths: number[] = []
        let entry = false
        const start = performance.now()
        while (performance.now() - start < 1800) {
          await new Promise(requestAnimationFrame)
          const root = document.querySelector('#body')!
          lengths.push(root.textContent!.length)
          entry ||= [...root.querySelectorAll('[data-streaming-word]')].some(word => getComputedStyle(word).animationName === 'enter')
        }
        return { lengths: [...new Set(lengths)], entry }
      }, burst)
      expect(samples.lengths.filter(length => length > 2 && length < burst.length).length).toBeGreaterThan(3)
      expect(samples.entry).toBe(true)
      console.log(`Streaming frame samples (${theme}): ${JSON.stringify(samples)}`)
      await expect(browser.locator('#body')).toHaveText(burst)
      await expect(browser.locator('[data-streaming-fresh="true"]')).toHaveCount(2)
      const caret = await browser.evaluate(() => {
        const node = document.querySelector('[data-streaming-caret]')!
        const r = node.getBoundingClientRect()
        return { width: r.width, height: r.height, margin: getComputedStyle(node).marginLeft }
      })
      expect(caret).toEqual({ width: 2, height: 16, margin: '2px' })
      await expect(browser.locator('.im-markdown > :last-child [data-streaming-caret]')).toHaveCount(1)
      await app.screenshot(`streaming-burst-${theme}`)
      const markdown = `${burst}\n\n- **正在输出** [引用](#cite-S1)\n\n| 成员 | 角色 |\n| --- | --- |\n| 司南 | 协调 |\n\n> 引用内容保持排版\n\n@同事  \`inline code\`\n\n尾部继续`
      await step(markdown)
      await expect(browser.locator('.im-markdown > :last-child')).toHaveText('尾部继续')
      await expect(browser.locator('#body table')).toHaveCount(1)
      await expect(browser.locator('#body [data-streamdown="strong"]')).toHaveText('正在输出')
      await expect(browser.locator('#body blockquote')).toHaveText('引用内容保持排版')
      await expect(browser.locator('#body [data-mention-id="fixture-colleague"]')).toHaveCount(1)
      await expect(browser.locator('#body :not(pre) > code')).toHaveText('inline code')
      await app.screenshot(`streaming-markdown-${theme}`)
      await step(markdown + '\n\n```js\nconst value = 42\n')
      await expect(browser.locator('pre code')).toContainText('const value = 42')
      await expect(browser.locator('.im-markdown > :last-child [data-streaming-caret]')).toHaveCount(1)
      await step('已完成的正文。', true)
      await expect(browser.locator('#body')).toHaveText('已完成的正文。')
      await expect(browser.locator('.im-markdown > :last-child [data-streaming-caret]')).toHaveCount(0)
      expect(await browser.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await app.screenshot(`streaming-complete-${theme}`)
    })
  }
  test('completion drains pending text and cancellation clears decoration', async ({ app, browser }) => {
    await app.open('/scripts/streaming-browser-check.html')
    await expect(browser.locator('#body')).toContainText('准备')
    const final = '准备' + '正常结束后不能丢失已经接收的正文。'.repeat(20)
    await browser.evaluate(text => {
      return window.dispatchEvent(new CustomEvent('streaming-text-step', { detail: { text, done: true } }))
    }, final)
    await expect(browser.locator('#body')).toHaveText(final)
    await expect(browser.locator('.im-markdown > :last-child [data-streaming-caret]')).toHaveCount(0)
    await browser.evaluate(() => {
      return window.dispatchEvent(new CustomEvent('streaming-text-step', { detail: { text: '新一轮正在输出'.repeat(30), done: false } }))
    })
    await expect(browser.locator('.im-markdown > :last-child [data-streaming-caret]')).toHaveCount(1)
    await browser.evaluate(() => {
      return window.dispatchEvent(new CustomEvent('streaming-text-step', { detail: { text: '已停止', done: false, cancelled: true } }))
    })
    await expect(browser.locator('#body')).toHaveText('已停止')
    await expect(browser.locator('.im-markdown > :last-child [data-streaming-caret]')).toHaveCount(0)
    await app.screenshot('streaming-cancelled')
  })
  test('reduced motion preference bypasses the reveal queue', async ({ app, browser }) => {
    await browser.addInitScript(() => {
      const matchMedia = window.matchMedia.bind(window)
      window.matchMedia = query => {
        const media = matchMedia(query)
        if (query === '(prefers-reduced-motion: reduce)') Object.defineProperty(media, 'matches', { value: true })
        return media
      }
    })
    await app.open('/scripts/streaming-browser-check.html')
    await expect(browser.locator('#body')).toContainText('准备')
    const text = '减少动态效果时直接显示正文。'.repeat(20)
    const rendered = await browser.evaluate(async text => {
      window.dispatchEvent(new CustomEvent('streaming-text-step', { detail: { text, done: false } }))
      const lengths: number[] = []
      const start = performance.now()
      while (document.querySelector('#body')!.textContent !== text) {
        if (performance.now() - start > 1500) throw new Error('Reduced-motion text did not commit')
        lengths.push(document.querySelector('#body')!.textContent!.length)
        await new Promise(requestAnimationFrame)
      }
      return { text: document.querySelector('#body')!.textContent, lengths }
    }, text)
    expect(rendered.text).toBe(text)
    expect(rendered.lengths.every(length => length === 2 || length === text.length)).toBe(true)
    await app.screenshot('streaming-reduced-motion')
  })
})

// These are renderer/runtime fixtures, not live-provider acceptance.
test.describe('Official element integration', {
  ...(process.env.E2E_STREAMING_FIXTURE === '1' ? {} : { skip: 'Requires the streaming renderer fixture server.' }),
}, () => {
  test('same input retains upstream entry, color transition and caret styles', async ({ app, browser }) => {
    await app.open('/scripts/streaming-browser-check.html?reference=1')
    await expect(browser.locator('#body')).toHaveText('准备')
    const text = 'Here is what changed in the latest release: the composer now'
    const samples = await browser.evaluate(async text => {
      const result: { text: string; fresh: string[] }[] = []
      for (let count = 1; count <= text.split(' ').length; count++) {
        const part = text.split(' ').slice(0, count).join(' ')
        window.dispatchEvent(new CustomEvent('streaming-text-step', { detail: { text: part, done: false } }))
        const start = performance.now()
        while (performance.now() - start < 88 || document.querySelector('#body')!.textContent !== part) {
          if (performance.now() - start > 3000) throw new Error('Reveal did not catch up')
          await new Promise(requestAnimationFrame)
        }
        result.push({ text: part, fresh: [...document.querySelectorAll('#body [data-streaming-fresh="true"]')].map(n => n.textContent!) })
      }
      const read = (root: Element) => {
        const word = root.querySelector(':scope > span > span')!
        const caret = root.querySelector('[aria-hidden="true"]')!
        const outer = getComputedStyle(word.parentElement!), inner = getComputedStyle(word), cursor = getComputedStyle(caret)
        return { entry: outer.animationName, entryDuration: outer.animationDuration,
          transition: inner.transitionProperty, duration: inner.transitionDuration,
          width: cursor.width, height: cursor.height, margin: cursor.marginLeft,
          radius: cursor.borderRadius, pulse: cursor.animationName, background: cursor.backgroundColor }
      }
      return { result, official: read(document.querySelector('#official [data-slot="streaming-text"]')!),
        product: read(document.querySelector('#body [data-slot="streaming-text"]')!) }
    }, text)
    expect(samples.official).toEqual(samples.product)
    expect(samples.product.width).toBe('2px')
    expect(samples.product.duration).toBe('0.7s')
    expect(samples.product.entryDuration).toBe('0.5s')
    expect(samples.result.every(sample => sample.fresh.join(' ') === sample.text.split(' ').slice(-2).join(' '))).toBe(true)
    console.log('Official vs product', JSON.stringify(samples))
    await app.screenshot('official-source-product-same-input')
    await browser.evaluate(text => window.dispatchEvent(new CustomEvent('streaming-text-step', { detail: { text, done: true } })), text)
    await expect(browser.locator('#body [data-streaming-caret]')).toHaveCount(0)
    await app.screenshot('official-source-product-complete')
  })

  test('Chinese and mixed leaves settle continuously without replaying stable blocks', async ({ app, browser }) => {
    await app.open('/scripts/streaming-browser-check.html')
    await expect(browser.locator('#body')).toHaveText('准备')
    const result = await browser.evaluate(async () => {
      const frame = () => new Promise(requestAnimationFrame)
      const step = async (text: string, done = false) => {
        window.dispatchEvent(new CustomEvent('streaming-text-step', { detail: { text, done } }))
        const start = performance.now()
        while (document.querySelector('#body')!.textContent !== text.replaceAll('**', '').replaceAll('\n\n', '')) {
          if (performance.now() - start > 3000) throw new Error('Text did not arrive')
          await frame()
        }
        return start
      }
      const initialStart = await step('甲乙丙丁')
      const old = document.querySelectorAll('#body [data-streaming-fresh]')[2]
      const initialCaret = document.querySelector('#body [data-streaming-caret]')
      if (!old || !initialCaret) throw new Error('Initial streaming token or caret is missing')
      const blue = getComputedStyle(initialCaret).backgroundColor
      const foreground = getComputedStyle(old.parentElement!).color
      const arrivalColor = getComputedStyle(old).color
      // Text arrival can precede the fresh registry and its foreground-to-blue
      // transition. Establish blue before testing the later blue-to-foreground
      // transition, within the initial step's existing deadline.
      while (true) {
        if (!old.isConnected || document.querySelectorAll('#body [data-streaming-fresh]')[2] !== old) {
          throw new Error('Initial streaming token was replaced before reaching blue')
        }
        if (old.getAttribute('data-streaming-fresh') === 'true' && getComputedStyle(old).color === blue) break
        if (performance.now() - initialStart > 3000) throw new Error('Initial fresh token did not reach blue')
        await frame()
      }
      const blueReadyMs = Math.round(performance.now() - initialStart)
      const initialFresh = [...document.querySelectorAll('#body [data-streaming-fresh="true"]')].map(n => n.textContent)
      const colors = new Set<string>()
      const before = getComputedStyle(old).color
      // Observe the real transition while the SDK reveals the appended text.
      // Waiting for the full body first can miss the entire 700ms transition.
      window.dispatchEvent(new CustomEvent('streaming-text-step', { detail: { text: '甲乙丙丁 English **中文**' } }))
      const start = performance.now()
      while (performance.now() - start < 850) { colors.add(getComputedStyle(old).color); await frame() }
      const receivedMixed = document.querySelector('#body')!.textContent === '甲乙丙丁 English 中文'
      const end = getComputedStyle(old).color
      const identity = document.querySelectorAll('#body [data-streaming-fresh]')[2] === old
      const fresh = [...document.querySelectorAll('#body [data-streaming-fresh="true"]')].map(n => n.textContent)
      await step('甲乙丙丁 English **中文**\n\n尾部')
      const stable = document.querySelector('.im-markdown > :first-child')!
      let mutations = 0
      const observer = new MutationObserver(records => { mutations += records.length })
      observer.observe(stable, { subtree: true, attributes: true, childList: true, characterData: true })
      window.dispatchEvent(new CustomEvent('streaming-text-step', { detail: { text: '甲乙丙丁 English **中文**\n\n尾部继续增长' } }))
      const next = performance.now()
      while (performance.now() - next < 850) await frame()
      observer.disconnect()
      const stableBlue = [...stable.querySelectorAll('[data-streaming-fresh="true"]')]
        .some(node => getComputedStyle(node).color !== getComputedStyle(node.parentElement!).color)
      return { colors: [...colors], arrivalColor, blueReadyMs, before, blue, foreground, initialFresh, end, receivedMixed, identity, fresh, mutations, stableBlue,
        visibleCarets: [...document.querySelectorAll('[data-streaming-caret]')].filter(n => n.getBoundingClientRect().width > 0).length }
    })
    console.log('Chinese transition and stable block', JSON.stringify(result))
    expect(result.initialFresh).toEqual(['丙', '丁'])
    expect(result.before).toBe(result.blue)
    expect(result.before === result.foreground).toBe(false)
    expect(result.receivedMixed).toBe(true)
    expect(result.colors.length).toBeGreaterThan(3)
    expect(result.before === result.end).toBe(false)
    expect(result.end).toBe(result.foreground)
    expect(result.identity).toBe(true)
    expect(result.fresh).toEqual(['中', '文'])
    expect(result.mutations).toBe(0)
    expect(result.stableBlue).toBe(false)
    expect(result.visibleCarets).toBe(1)
    await app.screenshot('chinese-mixed-tail')
  })

  test('failure, replacement and history retain text without decoration', async ({ app, browser }) => {
    await app.open('/scripts/streaming-browser-check.html')
    await expect(browser.locator('#body')).toHaveText('准备')
    const result = await browser.evaluate(async () => {
      window.dispatchEvent(new CustomEvent('streaming-text-step', { detail: { text: '失败前收到的正文  保留空格\n以及换行', failed: true } }))
      const start = performance.now()
      while (performance.now() - start < 900) await new Promise(requestAnimationFrame)
      return { text: document.querySelector('#body')!.textContent,
        carets: document.querySelectorAll('[data-streaming-caret]').length,
        fresh: document.querySelectorAll('[data-streaming-fresh="true"]').length }
    })
    expect(result).toEqual({ text: '失败前收到的正文  保留空格\n以及换行', carets: 0, fresh: 0 })
    await browser.evaluate(() => window.dispatchEvent(new CustomEvent('streaming-text-step', { detail: { text: '切换后的历史', done: true, id: 'another-thread-message' } })))
    await expect(browser.locator('#body')).toHaveText('切换后的历史')
    await expect(browser.locator('[data-streaming-word]')).toHaveCount(0)
    await app.open('/scripts/streaming-browser-check.html?history=1')
    await expect(browser.locator('#body')).toHaveText('历史正文 保持 Markdown，不重新播放。')
    await expect(browser.locator('[data-streaming-word]')).toHaveCount(0)
    await expect(browser.locator('[data-streaming-caret]')).toHaveCount(0)
    await app.screenshot('history-no-replay')
  })
})
