import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readWebResource } from './resource.js'
import { createPublicResourceCache } from './public-resource-cache.js'

const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve() }

test('an idle public resource recovers through the authorized page within the original deadline', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const controller = new AbortController()
  let publicReads = 0, authorizedReads = 0, value: string | undefined
  const result = readWebResource('gen-ui.js', signal => {
    publicReads++
    return new Promise<Response>((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }))
  }, controller.signal, async () => { authorizedReads++; return new Response('verified runtime bytes') })
  void result.then(text => { value = text }, () => undefined)
  t.mock.timers.tick(5000); await flush()
  t.mock.timers.tick(250); await flush()
  try {
    assert.equal(value, 'verified runtime bytes')
    assert.equal(publicReads, 1)
    assert.equal(authorizedReads, 1)
  } finally { controller.abort(); await result.catch(() => undefined) }
})

for (const status of [401, 403, 429]) test(`HTTP ${status} does not invoke a recovery route`, async () => {
  let recoveries = 0
  await assert.rejects(readWebResource('gen-ui.js', async () => new Response('', { status }), new AbortController().signal,
    async () => { recoveries++; return new Response('must not be used') }), new RegExp(`HTTP ${status}`))
  assert.equal(recoveries, 0)
})

test('cancelling before recovery prevents a late authorized request', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const controller = new AbortController()
  let recoveries = 0
  const result = readWebResource('gen-ui.js', signal => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })), controller.signal,
    async () => { recoveries++; return new Response('late bytes') })
  const rejected = assert.rejects(result, /closed/)
  t.mock.timers.tick(5000); await flush(); controller.abort(new Error('closed')); t.mock.timers.tick(1000)
  await rejected; assert.equal(recoveries, 0)
})

test('authorized recovery bytes still require the declared public digest before caching', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('expected bytes')))].map(value => value.toString(16).padStart(2, '0')).join('')
  const cache = createPublicResourceCache(), controller = new AbortController()
  const result = cache.read('gen-ui.js', digest, () => readWebResource('gen-ui.js', signal => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })),
    controller.signal, async () => new Response('changed bytes')), controller.signal)
  const rejected = assert.rejects(result, /完整性校验失败/)
  t.mock.timers.tick(5000); await flush(); t.mock.timers.tick(250)
  await rejected
  assert.equal(await cache.read('gen-ui.js', digest, async () => 'expected bytes', controller.signal), 'expected bytes')
})
