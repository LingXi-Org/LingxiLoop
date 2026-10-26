import { describe, expect, it, vi } from 'vitest'
import { verifyTarget, hostOperation, installManifest } from './adapters'
import type { Target, Manifest } from '../../../shared/release/protocol'
import type { ReleaseEnv } from './types'

const target = { artifact: { kind: 'image' }, verification: { readiness: ['node'], businessProbe: 'business' } } as Target
const env = { PROBES_JSON: JSON.stringify({ node: { url: 'https://trusted.example/ready?private=secret', status: 200, json: { ready: true } }, business: { url: 'https://trusted.example/business', status: 200 } }) } as ReleaseEnv
describe('bounded immutable manifest transfer', () => {
  const settings = { EXECUTORS_JSON: JSON.stringify({ b: 'https://executor.example' }), EXECUTOR_TOKEN: 'private-executor', CF_ACCESS_CLIENT_ID: 'private-access-id', CF_ACCESS_CLIENT_SECRET: 'private-access-secret' } as ReleaseEnv
  const manifest = { releaseId: 'same-immutable-release' } as Manifest
  it.each([28_489, 60_001])('settles a %i ms transfer within its fixed manifest allowance', async transferMs => {
    vi.useFakeTimers()
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation(ms => {
      const controller = new AbortController()
      setTimeout(() => controller.abort(new DOMException('bounded transport timeout', 'TimeoutError')), ms)
      return controller.signal
    })
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => new Promise((resolve, reject) => {
      const signal = init!.signal!
      const timer = setTimeout(() => resolve(Response.json({ releaseId: manifest.releaseId, manifestHash: 'exact-hash' }, { status: 201 })), transferMs)
      signal.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason) }, { once: true })
    }))
    try {
      const request = installManifest(settings, 'b', manifest, 'exact-hash').then(value => ({ ok: true, value }), error => ({ ok: false, error }))
      await vi.advanceTimersByTimeAsync(Math.min(transferMs, 60_000))
      if (transferMs < 60_000) expect(await request).toEqual({ ok: true, value: { releaseId: manifest.releaseId, manifestHash: 'exact-hash' } })
      else expect(await request).toMatchObject({ ok: false, error: { code: 'TRANSPORT_OUTCOME_UNKNOWN' } })
      expect(timeout).toHaveBeenCalledWith(60_000)
      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy.mock.calls[0]).toMatchObject(['https://executor.example/manifests', { method: 'POST', redirect: 'manual', body: JSON.stringify({ manifest, manifestHash: 'exact-hash' }), headers: { authorization: 'Bearer private-executor', 'CF-Access-Client-Id': 'private-access-id' } }])
    } finally { spy.mockRestore(); timeout.mockRestore(); vi.clearAllTimers(); vi.useRealTimers() }
  })
  it('keeps HTTP denials terminal without an internal replay', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 403 }))
    try { await expect(installManifest(settings, 'b', manifest, 'exact-hash')).rejects.toMatchObject({ code: 'AUTHENTICATION_FAILED' }); expect(spy).toHaveBeenCalledTimes(1) }
    finally { spy.mockRestore() }
  })
})
describe('read-only named probe transport classification', () => {
  it.each(['fetch', 'body', 'json'])('sanitizes %s failure into a retryable query error without credentials or URLs', async failure => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      if (failure === 'fetch') throw Error('private URL and credentials')
      if (failure === 'body') return new Response(new ReadableStream({ start(controller) { controller.error(Error('private response body')) } }))
      return new Response('private invalid JSON')
    })
    try {
      await expect(verifyTarget(env, target)).rejects.toMatchObject({ code: 'PROBE_QUERY_UNAVAILABLE', message: 'PROBE_QUERY_UNAVAILABLE' })
      expect(spy).toHaveBeenCalledTimes(1)
    } finally { spy.mockRestore() }
  })
  it('retains exact HTTP and JSON business assertions instead of retrying a failed assertion', async () => {
    for (const [response, code] of [[new Response(null, { status: 403 }), 'BUSINESS_PROBE_FAILED'], [Response.json({ ready: false }), 'BUSINESS_PROBE_CONTENT_MISMATCH']] as const) {
      const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response)
      try { await expect(verifyTarget(env, target)).rejects.toMatchObject({ code }); expect(spy).toHaveBeenCalledTimes(1) } finally { spy.mockRestore() }
    }
  })
})

describe('bounded read-only operation waiting', () => {
  const settings = { EXECUTORS_JSON: JSON.stringify({ a: 'https://executor.example' }), EXECUTOR_TOKEN: 'private-executor', CF_ACCESS_CLIENT_ID: 'private-access-id', CF_ACCESS_CLIENT_SECRET: 'private-access-secret' } as ReleaseEnv
  const manifest = { releaseId: 'bounded-wait' } as Manifest
  it('uses one authenticated GET with a timeout covering its requested 45-second wait, without POST', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout'), spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ status: 'running' }))
    try {
      expect(await hostOperation(settings, 'a', manifest, 'hash', 'main-runtime-a', 'apply', 1, false, 45)).toEqual({ status: 'running' })
      expect(spy).toHaveBeenCalledTimes(1)
      const [input, init] = spy.mock.calls[0]!, url = new URL(String(input))
      expect(url.searchParams.get('key')).toBe('bounded-wait:main-runtime-a:apply'); expect(url.searchParams.get('waitSeconds')).toBe('45')
      expect(init?.method).toBe('GET'); expect(init?.body).toBeUndefined(); expect(init?.headers).toMatchObject({ authorization: 'Bearer private-executor', 'CF-Access-Client-Id': 'private-access-id' })
      expect(timeout).toHaveBeenCalledWith(65_000)
    } finally { spy.mockRestore(); timeout.mockRestore() }
  })
  it('rejects invalid wait budgets before fetch and preserves ordinary typed GET body errors as unknown queries', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('truncated private JSON'))
    try {
      for (const wait of [-1, 46, NaN, Infinity]) await expect(hostOperation(settings, 'a', manifest, 'hash', 'main-runtime-a', 'apply', 1, false, wait)).rejects.toMatchObject({ code: 'INVALID_OPERATION_WAIT' })
      expect(spy).not.toHaveBeenCalled()
      await expect(hostOperation(settings, 'a', manifest, 'hash', 'main-runtime-a', 'apply', 1, false, 0.5)).rejects.toMatchObject({ code: 'EXECUTOR_QUERY_UNAVAILABLE' })
      expect(spy).toHaveBeenCalledTimes(1)
    } finally { spy.mockRestore() }
  })
  it.each(['probe', 'operation'])('does not disguise the exact provider capacity exception as a transient %s query', async kind => {
    const spy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(Error('Too many subrequests.'))
    try {
      await expect(kind === 'probe' ? verifyTarget(env, target) : hostOperation(settings, 'a', manifest, 'hash', 'main-runtime-a', 'apply', 1, false, 45)).rejects.toMatchObject({ code: 'WORKFLOW_SUBREQUEST_LIMIT' })
      expect(spy).toHaveBeenCalledTimes(1)
    } finally { spy.mockRestore() }
  })
})
