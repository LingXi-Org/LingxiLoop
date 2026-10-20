import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

// Failure model (before implementation): a leading space after an inline
// element consumes a word slot; a new structural block clears both old words
// even when it contains only one word; fixing either can reparse/reanimate all
// stable blocks or duplicate the caret. Use the real renderer/runtime fixture.
test.describe('Whole text-part streaming tail', {
  ...(process.env.E2E_STREAMING_FIXTURE === '1' ? {} : { skip: 'Requires the streaming renderer fixture server.' }),
}, () => {
  test('inline boundaries preserve whitespace without counting it as a word', async ({ app, browser }) => {
    await app.open('/scripts/streaming-browser-check.html')
    await expect(browser.locator('#body')).toHaveText('准备')
    const results = await browser.evaluate(async () => {
      const results = []
      for (const [text, expected] of [
        ['one **two**', 'one two'], ['**one** two', 'one two'],
        ['**one**\t  two', 'one\t  two'], ['甲 **乙**', '甲 乙'], ['**甲** 乙', '甲 乙'],
      ]) {
        window.dispatchEvent(new CustomEvent('streaming-text-step', { detail: { text } }))
        // Let a same-visible-text Markdown replacement reach the runtime before
        // comparing text; otherwise the previous rendering can satisfy the wait.
        await new Promise(requestAnimationFrame)
        await new Promise(requestAnimationFrame)
        const start = performance.now()
        while (document.querySelector('#body')!.textContent !== expected) {
          if (performance.now() - start > 3000) throw new Error('Text did not arrive')
          await new Promise(requestAnimationFrame)
        }
        await new Promise(requestAnimationFrame)
        results.push({ text: document.querySelector('#body')!.textContent,
          fresh: [...document.querySelectorAll('#body [data-streaming-fresh="true"]')].map(node => node.textContent) })
      }
      return results
    })
    expect(results).toEqual([
      { text: 'one two', fresh: ['one', 'two'] }, { text: 'one two', fresh: ['one', 'two'] },
      { text: 'one\t  two', fresh: ['one', 'two'] }, { text: '甲 乙', fresh: ['甲', '乙'] }, { text: '甲 乙', fresh: ['甲', '乙'] },
    ])
    console.log('Inline tail windows:', JSON.stringify(results))
    await app.screenshot('inline-whitespace-tail')
  })

  test('one word in a new block retains the preceding word across structural boundaries', async ({ app, browser }) => {
    await app.open('/scripts/streaming-browser-check.html')
    await expect(browser.locator('#body')).toHaveText('准备')
    const results = await browser.evaluate(async () => {
      const results = []
      for (const [text, expected] of [
        ['one two', 'one two'], ['one two\n\nthree', 'one twothree'],
        ['one two\n\nthree four', 'one twothree four'], ['甲乙\n\n丙', '甲乙丙'],
        ['## 甲乙\n\n丙', '甲乙丙'], ['甲乙\n\n- 丙', '甲乙丙'],
      ]) {
        window.dispatchEvent(new CustomEvent('streaming-text-step', { detail: { text } }))
        await new Promise(requestAnimationFrame)
        await new Promise(requestAnimationFrame)
        const start = performance.now()
        while (document.querySelector('#body')!.textContent!.replaceAll('\n', '') !== expected) {
          if (performance.now() - start > 3000) throw new Error('Text did not arrive')
          await new Promise(requestAnimationFrame)
        }
        await new Promise(requestAnimationFrame)
        results.push({ fresh: [...document.querySelectorAll('#body [data-streaming-fresh="true"]')].map(node => node.textContent),
          carets: [...document.querySelectorAll('#body [data-streaming-caret]')].filter(node => node.getBoundingClientRect().width > 0).length })
      }
      return results
    })
    expect(results).toEqual([
      { fresh: ['one', 'two'], carets: 1 }, { fresh: ['two', 'three'], carets: 1 },
      { fresh: ['three', 'four'], carets: 1 }, { fresh: ['乙', '丙'], carets: 1 },
      { fresh: ['乙', '丙'], carets: 1 }, { fresh: ['乙', '丙'], carets: 1 },
    ])
    console.log('Cross-block tail windows:', JSON.stringify(results))
    const settled = await browser.evaluate(async () => {
      await new Promise(resolve => setTimeout(resolve, 850))
      return { fresh: [...document.querySelectorAll('#body [data-streaming-fresh="true"]')].map(node => node.textContent),
        staleBlue: [...document.querySelectorAll('#body [data-streaming-fresh="false"]')]
          .some(node => getComputedStyle(node).color !== getComputedStyle(node.parentElement!).color) }
    })
    expect(settled).toEqual({ fresh: ['乙', '丙'], staleBlue: false })
    await app.screenshot('cross-block-one-word-tail')
  })

  // A pending visualize reference splits one native part into separate
  // MarkdownText providers. They must still share its tail and single caret.
  test('visualize text slices share the original text-part window', async ({ app, browser }) => {
    await app.open('/scripts/streaming-browser-check.html?visualize=1')
    await expect(browser.locator('#body')).toHaveText('准备')
    const result = await browser.evaluate(async () => {
      const text = 'one two\n\n::visualize{"path":"/fixture.html"}\n\nthree'
      window.dispatchEvent(new CustomEvent('streaming-text-step', { detail: { text } }))
      const start = performance.now()
      while ([...document.querySelectorAll('.im-markdown')].map(node => node.textContent).join('') !== 'one twothree') {
        if (performance.now() - start > 3000) throw new Error('Split text did not arrive')
        await new Promise(requestAnimationFrame)
      }
      await new Promise(requestAnimationFrame)
      return { fresh: [...document.querySelectorAll('#body [data-streaming-fresh="true"]')].map(node => node.textContent),
        carets: [...document.querySelectorAll('#body [data-streaming-caret]')].filter(node => node.getBoundingClientRect().width > 0).length }
    })
    expect(result).toEqual({ fresh: ['two', 'three'], carets: 1 })
    console.log('Visualize-split tail:', JSON.stringify(result))
    const staleBlue = await browser.evaluate(async () => {
      await new Promise(resolve => setTimeout(resolve, 850))
      return [...document.querySelectorAll('#body [data-streaming-fresh="false"]')]
        .some(node => getComputedStyle(node).color !== getComputedStyle(node.parentElement!).color)
    })
    expect(staleBlue).toBe(false)
    await app.screenshot('visualize-split-tail')
  })
})
