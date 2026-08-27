import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('packaged notification window uses the registered app protocol', () => {
  const source = readFileSync(new URL('../../electron/main.cjs', import.meta.url), 'utf8')
  const body = source.match(/function notificationUrl\(\) \{([\s\S]*?)\n\}/)?.[1] ?? ''
  assert.match(body, /app:\/\/lingxiloop\/index\.html#notifications/)
  assert.doesNotMatch(body, /file:\/\//)
})
