import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

// Replays only synthetic test conversations recorded by the real product Worker.
test.describe('Recorded native stream', {
  ...(process.env.E2E_STREAMING_REPLAY ? {} : { skip: 'Set E2E_STREAMING_REPLAY to the local integration artifact URL.' }),
}, () => {
  test('worker snapshots keep the browser responsive and finish with the canonical text', async ({ app, browser }) => {
    await app.open('/e2e/native-streaming.html')
    await expect(browser.locator('input')).toHaveCount(1)
    const evidence = await browser.evaluate(async path => {
      const payload = await fetch(path).then(response => response.json())
      const frames = Array.isArray(payload) ? payload.map(item => item.snapshot) : payload.snapshots
      const texts = (message: { content: { type: string; text?: string; providerMetadata?: { lingxiloop?: { activity?: { kind: string } } } }[] }) => message.content
        .filter(part => part.type === 'text' && part.providerMetadata?.lingxiloop?.activity?.kind !== 'commentary').map(part => part.text).join('\n')
      let maxBlock = 0, previousTick = performance.now(), visible = false, blankFrames = 0
      const timer = setInterval(() => { const now = performance.now(); maxBlock = Math.max(maxBlock, now - previousTick); previousTick = now }, 25)
      for (const snapshot of frames) {
        window.dispatchEvent(new CustomEvent('native-streaming-snapshot', { detail: snapshot }))
        await new Promise(resolve => setTimeout(resolve, 35))
        const text = document.querySelector('.im-markdown')?.textContent ?? ''
        if (visible && !text && texts(snapshot.message)) blankFrames++
        visible ||= text.length > 0
      }
      await new Promise(resolve => setTimeout(resolve, 1000))
      clearInterval(timer)
      const final = texts(frames.at(-1).message)
      return { snapshots: frames.length, maxBlock, blankFrames, expected: final.replace(/\s+/g, ''),
        text: (document.querySelector('.im-markdown')?.textContent ?? '').replace(/\s+/g, '') }
    }, process.env.E2E_STREAMING_REPLAY!)
    console.log(`Recorded stream evidence: ${JSON.stringify({ ...evidence, expected: evidence.expected.length, text: evidence.text.length })}`)
    expect(evidence.snapshots).toBeGreaterThan(5)
    expect(evidence.blankFrames).toBe(0)
    expect(evidence.maxBlock).toBeLessThan(500)
    await app.screenshot('native-streaming-real-worker-replay')
    await app.open('/e2e/native-streaming.html')
    await expect(browser.locator('input')).toHaveCount(1)
    const restored = await browser.evaluate(async path => {
      const payload = await fetch(path).then(response => response.json())
      const final = Array.isArray(payload) ? payload.at(-1).snapshot : payload.snapshots.at(-1)
      window.dispatchEvent(new CustomEvent('native-streaming-snapshot', { detail: final }))
      await new Promise(resolve => setTimeout(resolve, 250))
      return (document.querySelector('.im-markdown')?.textContent ?? '').replace(/\s+/g, '')
    }, process.env.E2E_STREAMING_REPLAY!)
    expect(evidence.text).toBe(restored)
    expect(restored.length).toBeGreaterThan(200)
    await browser.locator('input').fill('完整链路仍可输入')
    await expect(browser.locator('[role="alert"]')).toHaveCount(0)
  })
})
