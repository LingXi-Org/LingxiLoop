import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { mock, test } from 'node:test'

mock.module('html-to-image/dist/html-to-image.js?raw', { defaultExport: '/* capture fixture */' })
const { buildWebDocument } = await import('./document')
const kit = await readFile('third_party/zcode/skills/visualize/assets/visualize.html', 'utf8')
const kitHash = createHash('sha256').update(kit).digest('hex')
const required = ['vendor/floating-ui-core-1.7.3.min.js', 'vendor/floating-ui-dom-1.7.4.min.js', 'vendor/lucide-1.17.0.js']
const source = (name: string) => name === 'visualize.html' ? kit : `/* resource:${name} */`

// Failure model: waiting for the pinned kit serializes its already-known vendor
// reads; speculative work for an unknown kit or duplicated reads would be waste.
test('known fixed kit dependencies start before the kit completes, once and in original output order', async () => {
  const calls: string[] = []
  let finishKit!: (value: string) => void
  const kitReady = new Promise<string>(resolve => { finishKit = resolve })
  const pending = buildWebDocument('<svg/>', null, async name => { calls.push(name); return name === 'visualize.html' ? kitReady : source(name) }, kitHash)
  try {
    assert.deepEqual(calls.filter(name => required.includes(name)), required, 'fixed dependencies should not wait for the kit response')
    finishKit(kit)
    const result = await pending
    const ordinary = await buildWebDocument('<svg/>', null, async name => source(name))
    assert.equal(result, ordinary, 'scheduling must preserve the complete document, CSP and script ordering')
    for (const name of required) assert.equal(calls.filter(value => value === name).length, 1)
    assert.equal(calls.includes('calendar.js'), false)
    assert.equal(calls.includes('vendor/d3-7.9.0.min.js'), false)
    assert.ok(result.indexOf(source(required[0])) < result.indexOf(source(required[1])))
  } finally { finishKit(kit); await pending }
})

test('an unknown kit keeps demand-based dependencies, including optional authored D3 and calendar', async () => {
  const calls: string[] = []
  let finishKit!: (value: string) => void
  const kitReady = new Promise<string>(resolve => { finishKit = resolve })
  const fragment = '<viz-calendar/><script src="https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js"></script>'
  const pending = buildWebDocument(fragment, null, async name => { calls.push(name); return name === 'visualize.html' ? kitReady : source(name) }, 'unknown-kit')
  assert.equal(calls.some(name => name.startsWith('vendor/')), false)
  finishKit(kit)
  const result = await pending
  assert.equal(calls.filter(name => name === 'calendar.js').length, 1)
  assert.equal(calls.filter(name => name === 'vendor/d3-7.9.0.min.js').length, 1)
  assert.ok(result.includes(source('calendar.js')))
  assert.ok(result.includes(source('vendor/d3-7.9.0.min.js')))
})

test('a fixed dependency failure rejects preparation while the kit remains pending', async () => {
  let finishKit!: (value: string) => void
  const kitReady = new Promise<string>(resolve => { finishKit = resolve })
  const pending = buildWebDocument('<svg/>', null, async name => {
    if (name === required[0]) throw new Error('fixture resource denied')
    return name === 'visualize.html' ? kitReady : source(name)
  }, kitHash)
  try {
    const result = await Promise.race([pending.then(() => 'resolved', error => String(error)), new Promise(resolve => setTimeout(() => resolve('still waiting for kit'), 100))])
    assert.match(String(result), /fixture resource denied/)
  } finally { finishKit(kit); await pending.catch(() => undefined) }
})
