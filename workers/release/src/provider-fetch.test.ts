import { describe, expect, it } from 'vitest'
import { handleProviderFetch, PROVIDER_FETCH_PATH, MAX_PROVIDER_BYTES, MAX_PROVIDER_INPUT_BYTES } from './provider-fetch'
async function guard(origin = 'https://provider.example') {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(origin))
  return { MIHOMO_ORIGIN_SHA256: Array.from(new Uint8Array(bytes), value => value.toString(16).padStart(2, '0')).join('') }
}
function request(value: unknown = { url: 'https://provider.example/subscribe?token=fixture-private' }, headers: Record<string, string> = {}) {
  return new Request(`https://release.test${PROVIDER_FETCH_PATH}`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer admin-fixture-secret', cookie: 'fixture-cookie', ...headers }, body: JSON.stringify(value) })
}
describe('one guarded-origin provider fetch', () => {
  it('performs exactly one GET of the original guarded URL with no incoming identity or headers', async () => {
    let calls = 0
    const response = await handleProviderFetch(request(), await guard(), async (input, init) => {
      calls++; expect(String(input)).toBe('https://provider.example/subscribe?token=fixture-private')
      expect(init?.method).toBe('GET'); expect(init?.redirect).toBe('manual'); expect(init?.signal).toBeInstanceOf(AbortSignal)
      expect(init?.headers).toBeUndefined(); expect(init?.body).toBeUndefined()
      return new Response('proxies: fixture-original', { headers: { 'set-cookie': 'private-provider-cookie', location: 'https://never.example/private' } })
    })
    expect(calls).toBe(1); expect(await response.text()).toBe('proxies: fixture-original')
    expect(response.headers.get('content-type')).toBe('application/octet-stream')
    expect(response.headers.get('cache-control')).toContain('private, no-store')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('location')).toBeNull(); expect(response.headers.get('set-cookie')).toBeNull()
  })
  it('uses normalized URL.origin including scheme and port, without storing or returning URL values', async () => {
    const response = await handleProviderFetch(request({ url: 'https://PROVIDER.example:443/secret-path?token=fixture-private' }), await guard(), async () => new Response('raw'))
    expect(await response.text()).toBe('raw')
    const wrong = await handleProviderFetch(request({ url: 'https://provider.example:8443/path' }), await guard(), async () => { throw Error('must not fetch') })
    expect(wrong.status).toBe(403); expect(await wrong.json()).toEqual({ error: 'PROVIDER_ORIGIN_MISMATCH' })
  })
  it('rejects a missing guard, foreign origin, userinfo, fragment, non-HTTPS and extra JSON fields before fetch', async () => {
    let called = false
    const fetcher: typeof fetch = async () => { called = true; return new Response('invalid') }
    expect((await handleProviderFetch(request(), {}, fetcher)).status).toBe(503)
    for (const url of ['https://foreign.example/private', 'https://u:p@provider.example/private', 'https://@provider.example/private', 'https://provider.example/private#fragment', 'https://provider.example/private#', 'http://provider.example/private']) expect((await handleProviderFetch(request({ url }), await guard(), fetcher)).ok).toBe(false)
    expect((await handleProviderFetch(request({ url: 'https://provider.example/private', headers: { authorization: 'ignored' } }), await guard(), fetcher)).status).toBe(400)
    expect(called).toBe(false)
  })
  it('bounds actual JSON input to 16 KiB even without a declared length', async () => {
    let called = false
    const response = await handleProviderFetch(request({ url: `https://provider.example/${'x'.repeat(MAX_PROVIDER_INPUT_BYTES)}` }), await guard(), async () => { called = true; return new Response('bad') })
    expect(response.status).toBe(413); expect(called).toBe(false)
    const malformed = new Request(`https://release.test${PROVIDER_FETCH_PATH}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"url":"secret-invalid-json' })
    expect(await (await handleProviderFetch(malformed, await guard())).json()).toEqual({ error: 'PROVIDER_INPUT_INVALID' })
  })
  it('never follows or exposes redirects, rejection bodies or Location, and stops at the first 403', async () => {
    for (const status of [302, 401, 403, 503]) {
      let calls = 0, canceled = false
      const source = new ReadableStream({ pull() {}, cancel() { canceled = true } })
      const response = await handleProviderFetch(request(), await guard(), async () => { calls++; return new Response(source, { status, headers: { location: 'https://foreign.example/?secret=fixture-secret' } }) })
      expect(calls).toBe(1); expect(canceled).toBe(true)
      expect(await response.json()).toEqual({ error: status === 302 ? 'PROVIDER_REDIRECT_REJECTED' : 'PROVIDER_UPSTREAM_REJECTED', upstreamStatus: status })
      expect(response.headers.get('location')).toBeNull()
    }
  })
  it('sanitizes thrown network diagnostics and performs no retry', async () => {
    let calls = 0
    const response = await handleProviderFetch(request(), await guard(), async () => { calls++; throw Error('private URL /token=fixture-private and identity') })
    expect(calls).toBe(1); expect(await response.json()).toEqual({ error: 'PROVIDER_FETCH_UNAVAILABLE' })
  })
  it('rejects a declared oversized response and aborts an unknown-length body at the streaming limit', async () => {
    const declared = await handleProviderFetch(request(), await guard(), async () => new Response('small', { headers: { 'content-length': String(MAX_PROVIDER_BYTES + 1) } }))
    expect(declared.status).toBe(413)
    let index = 0, canceled = false
    const streamed = await handleProviderFetch(request(), await guard(), async () => new Response(new ReadableStream<Uint8Array>({ pull(controller) { controller.enqueue(new Uint8Array(index++ === 0 ? MAX_PROVIDER_BYTES : 1)) }, cancel() { canceled = true } })))
    expect(streamed.status).toBe(413); expect(await streamed.json()).toEqual({ error: 'PROVIDER_RESPONSE_TOO_LARGE' }); expect(canceled).toBe(true)
  })
  it('accepts exactly the maximum body and exposes no partial transport exception details', async () => {
    const exact = await handleProviderFetch(request(), await guard(), async () => new Response(new Uint8Array(MAX_PROVIDER_BYTES)))
    expect((await exact.arrayBuffer()).byteLength).toBe(MAX_PROVIDER_BYTES)
    const bad = await handleProviderFetch(request(), await guard(), async () => new Response(new ReadableStream({ pull(controller) { controller.error(new Error('subscription URL secret')) } })))
    expect(bad.status).toBe(502); expect(await bad.json()).toEqual({ error: 'PROVIDER_BODY_UNAVAILABLE' })
  })
})

it('preserves original bytes without decoding and restricts the fixed API action to POST', async () => {
  const bytes = new Uint8Array([0, 255, 128, 65, 10])
  const response = await handleProviderFetch(request(), await guard(), async () => new Response(bytes))
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes)
  const get = await handleProviderFetch(new Request(`https://release.test${PROVIDER_FETCH_PATH}`), await guard())
  expect(get.status).toBe(405)
  const wrongPath = await handleProviderFetch(new Request('https://release.test/v1/bootstrap/other', { method: 'POST' }), await guard())
  expect(wrongPath.status).toBe(404)
})
