import { describe, expect, it, vi } from 'vitest'
import { verifyTarget } from './adapters'
import type { Target } from '../../../shared/release/protocol'
import type { ReleaseEnv } from './types'

const target = { artifact: { kind: 'image' }, verification: { readiness: ['node'], businessProbe: 'business' } } as Target
const env = { PROBES_JSON: JSON.stringify({ node: { url: 'https://trusted.example/ready?private=secret', status: 200, json: { ready: true } }, business: { url: 'https://trusted.example/business', status: 200 } }) } as ReleaseEnv
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
