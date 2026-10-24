import assert from 'node:assert/strict'
import { test } from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { load } from 'cheerio'
import { BloubAvatar } from './BloubAvatar'

// SSR checks the actual visibility/motion policy; clock/effect behavior is not
// represented as browser or measured-CPU verification.
test('static avatars keep their identity while active motion respects reduced motion', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const participant = { id: 'agent', name: '测试助手', role: 'helper', status: 'working' as const }
  let reduced = false
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { matchMedia: () => ({ matches: reduced }) } })
  try {
    const render = (animated: boolean) => load(renderToStaticMarkup(<BloubAvatar participant={participant} status="working" size={38} mode="chat" animated={animated} />))
    const still = render(false)
    assert.equal(still('.bloub-avatar-alive').length, 0)
    assert.equal(still('svg').attr('width'), '38')
    assert.equal(still('svg').attr('height'), '38')
    assert.equal(still('svg').attr('aria-label'), '测试助手 · 工作中')
    assert.ok(still('svg path').length > 0, 'the original SVG identity remains rendered')
    assert.equal(render(true)('.bloub-avatar-alive').length, 1)
    reduced = true
    assert.equal(render(true)('.bloub-avatar-alive').length, 0)
  } finally {
    if (previous) Object.defineProperty(globalThis, 'window', previous)
    else Reflect.deleteProperty(globalThis, 'window')
  }
})
