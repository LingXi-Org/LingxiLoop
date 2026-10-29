import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from '@e2e-dev/web'
import { expect } from 'e2e'
import { REACT_DELIVERY_TEXT as text, type ReactDeliveryEvidence, type ReactDeliveryFrame, type ReactDeliveryHarness, type ReactDeliveryScenario } from './contract'

const scenarioNames = ['append', 'replacement-failed', 'replacement-committed', 'cancelled', 'stale-reconnect', 'same-text-distinct-runs'] as const
const normalize = (value: string) => value.replace(/\s+/gu, ' ').trim()
const occurrences = (value: string, expected: string) => value.split(expected).length - 1

for (const width of [1280, 390]) {
  test(`real projection preserves answer identity through tools and recovery at ${width}px`, async ({ app, browser }) => {
    const path = resolve(process.env.E2E_REACT_DELIVERY_ARTIFACT ?? 'artifacts/react-delivery-366/snapshots.json')
    const evidence = JSON.parse(readFileSync(path, 'utf8')) as ReactDeliveryEvidence
    expect(evidence.version).toBe(1)
    expect(evidence.provenance.producer).toBe('native-event-projection-fixture')
    expect(evidence.provenance.commit).toMatch(/^[a-f0-9]{40}$/u)
    const observations: unknown[] = []
    await browser.setViewport({ width, height: 900 })
    // Reuse the page between isolated fixture states. Repeated Vite module
    // navigations exhausted Chromium resources; reset closes every stream and
    // clears all message state/counters without relaxing any scenario assertion.
    await app.open('/e2e/react-delivery/index.html')
    await expect(browser.locator('input')).toHaveCount(1)
    await browser.evaluate(async () => {
      const deadline = performance.now() + 5000
      while (!(window as Window & { reactDelivery?: ReactDeliveryHarness }).reactDelivery) {
        if (performance.now() > deadline) throw new Error('Fixture was not ready')
        await new Promise(resolve => setTimeout(resolve, 5))
      }
      return null
    })

    for (const name of scenarioNames) {
      const scenario = evidence.scenarios.find(item => item.name === name)
      expect(Boolean(scenario), `Missing owning integration scenario: ${name}`).toBe(true)
      if (!scenario) throw new Error(`Missing scenario ${name}`)
      expect(scenario.frames.length).toBeGreaterThan(1)
      expect(scenario.history.length).toBeGreaterThan(0)
      if (name === 'append') {
        const required = ['answer-a', 'first-tool-held', 'commentary', 'second-tool-held', 'answer-b', 'final']
        const indices = required.map(checkpoint => scenario.frames.findIndex(frame => frame.checkpoint === checkpoint))
        expect(indices.every((index, position) => index >= 0 && (position === 0 || index > indices[position - 1]!)),
          'The append scenario must include both projected held-tool states in order').toBe(true)
      }
      await browser.evaluate(async () => { await window.reactDelivery!.reset(); return null })

      let sawA = false
      let sawB = false
      let committedReplacement = false
      let firstIdentity: string | null = null
      let finalBodies: { id: string; text: string }[] = []
      for (const [index, frame] of scenario.frames.entries()) {
        if (name === 'stale-reconnect' && index === 2) {
          await browser.evaluate(async target => { await window.reactDelivery!.reconnect(target); return null }, { ...frame.target })
        }
        const observed = await browser.evaluate(async serialized => {
          const { frame, a, b, replacement } = JSON.parse(serialized) as { frame: ReactDeliveryFrame; a: string; b: string; replacement: string }
          const sample = () => [...document.querySelectorAll<HTMLElement>('[data-react-message]')].map(region => ({
            id: region.dataset.reactMessage!,
            text: [...region.querySelectorAll<HTMLElement>('[data-agent-body]')].map(body => body.textContent ?? '').join('\n'),
          }))
          const samples: { id: string; text: string }[][] = []
          let running = true
          const observe = () => { if (running) { samples.push(sample()); requestAnimationFrame(observe) } }
          requestAnimationFrame(observe)
          const start = performance.now()
          await window.reactDelivery!.push(frame)
          running = false
          const bodies = sample()
          const aNode = [...document.querySelectorAll<HTMLElement>('[data-agent-body] [data-part-identity], [data-part-identity] [data-agent-body]')]
            .find(node => node.textContent?.includes(a))
          const identity = aNode?.closest<HTMLElement>('[data-part-identity]')?.dataset.partIdentity ?? aNode?.dataset.partIdentity ?? null
          return { checkpoint: frame.checkpoint, bodies, samples, identity,
            contains: { a: bodies.some(body => body.text.includes(a)), b: bodies.some(body => body.text.includes(b)), replacement: bodies.some(body => body.text.includes(replacement)) },
            browserReplayToObservationMs: performance.now() - start }
        }, JSON.stringify({ frame, a: text.a, b: text.b, replacement: text.replacement }))

        const replacementCommit = name === 'replacement-committed' && frame.checkpoint === 'replacement-committed'
        if (sawA && !committedReplacement && !replacementCommit) {
          expect(observed.contains.a, `${name}/${frame.checkpoint}: A must remain ordinary answer text`).toBe(true)
          expect(observed.samples.every(sample => sample.some(body => body.text.includes(text.a))), `${name}/${frame.checkpoint}: no blank/demotion frame`).toBe(true)
        }
        if (replacementCommit) committedReplacement = true
        if (committedReplacement) {
          expect(observed.contains.replacement).toBe(true)
          expect(observed.contains.a).toBe(false)
          // The actual successful commit may change A to the replacement in one
          // frame; it must never expose both as an ordinary answer.
          expect(observed.samples.every(sample => {
            const value = sample.map(body => body.text).join('\n')
            return !(value.includes(text.a) && value.includes(text.replacement))
          })).toBe(true)
        } else expect(observed.contains.replacement).toBe(false)
        if (observed.contains.a && name !== 'same-text-distinct-runs') {
          expect(observed.identity, 'A needs a stable native segment identity').not.toBe(null)
          if (firstIdentity !== null) expect(observed.identity).toBe(firstIdentity)
          else firstIdentity = observed.identity
        }
        const body = observed.bodies.map(item => item.text).join('\n')
        expect(body).not.toContain(text.commentary)
        expect(body).not.toMatch(/PRIVATE_REACT_CANARY|reasoning_content|internal_chain_of_thought/u)
        if (name !== 'same-text-distinct-runs') {
          expect(occurrences(body, text.a)).toBeLessThanOrEqual(1)
          expect(occurrences(body, text.b)).toBeLessThanOrEqual(1)
        }
        if (sawB) expect(observed.contains.b).toBe(true)
        sawA ||= observed.contains.a
        sawB ||= observed.contains.b
        finalBodies = observed.bodies
        observations.push({ scenario: name, ...observed, samples: observed.samples.length })
      }

      expect(sawA).toBe(true)
      const actual = finalBodies.map(body => normalize(body.text))
      if (name === 'append' || name === 'stale-reconnect') {
        expect(actual).toEqual([normalize(`${text.a}\n\n${text.b}`)])
      } else if (name === 'replacement-committed') {
        expect(committedReplacement).toBe(true)
        expect(actual).toEqual([text.replacement])
      } else if (name === 'same-text-distinct-runs') {
        expect(new Set(finalBodies.map(body => body.id)).size).toBe(2)
        expect(actual).toEqual([text.a, text.a])
      } else expect(actual).toEqual([text.a])
      const wire = await browser.evaluate(() => window.reactDelivery!.evidence())
      expect(wire.mutations).toBe(0)
      if (name === 'stale-reconnect') expect(wire.streamConnections).toBeGreaterThan(1)
      await browser.locator('input').fill('正文仍可阅读，输入仍响应')
      await expect(browser.locator('input')).toHaveValue('正文仍可阅读，输入仍响应')
      await expect(browser.locator('[data-react-fixture-error]')).toHaveCount(0)
      // Honest terminal failures/cancellation remain visible; only transport
      // fixture failures are forbidden by the assertion above.
      if (name === 'replacement-failed' || name === 'cancelled') {
        await expect(browser.locator('[data-react-message][data-react-status="incomplete"]')).toHaveCount(1)
      }
      await app.screenshot(`react-${name}-${width}-live`)

      // Start with an empty client and read the independent canonical history
      // through the normal read client with a synthetic HTTP response, not the
      // final streamed frame. This does not independently prove authorization.
      await browser.evaluate(async serialized => {
        const frames = JSON.parse(serialized) as ReactDeliveryScenario['history']
        await window.reactDelivery!.reset(); await window.reactDelivery!.restore(frames); return null
      }, JSON.stringify(scenario.history))
      const restored = await browser.evaluate(() => [...document.querySelectorAll<HTMLElement>('[data-react-message]')].map(region => ({
        id: region.dataset.reactMessage!, text: [...region.querySelectorAll<HTMLElement>('[data-agent-body]')].map(body => body.textContent ?? '').join('\n'),
      })))
      expect(restored.map(body => ({ ...body, text: normalize(body.text) }))).toEqual(finalBodies.map(body => ({ ...body, text: normalize(body.text) })))
      await app.screenshot(`react-${name}-${width}-history`)
    }
    const output = resolve('.e2e/react-delivery')
    mkdirSync(output, { recursive: true })
    writeFileSync(resolve(output, `observations-${width}.json`), JSON.stringify({
      qualification: 'native-event projection fixture replay; browser DOM observations only, no ModelDriver/provider execution or authorization qualification, not provider TTFT or production timings',
      source: evidence.provenance, width, observations,
    }, null, 2))
  })
}
