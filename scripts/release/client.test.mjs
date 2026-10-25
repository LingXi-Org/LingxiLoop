import { test } from 'node:test'
import assert from 'node:assert/strict'
import { callRelease } from './client.mjs'
test('all callers use fixed API, token headers and reject credential-bearing URLs', async () => {
  const calls = []
  const options = { url: 'https://release.example/', token: 'test-token', fetch: async (url, init) => { calls.push({ url: String(url), init }); return Response.json({ releaseId: 'r1' }) } }
  await callRelease('submit', { manifest: { releaseId: 'r1' } }, options)
  assert.equal(calls[0].url, 'https://release.example/v1/releases')
  assert.equal(calls[0].init.headers.authorization, 'Bearer test-token')
  assert.equal(calls[0].init.redirect, 'error')
  await assert.rejects(callRelease('get', { releaseId: '../../etc' }, options), /INVALID_RELEASE_ID/)
  await assert.rejects(callRelease('get', { releaseId: 'r1' }, { ...options, url: 'https://secret@example.com/' }), /INVALID_RELEASE_ORIGIN/)
})
test('an HTTP error is surfaced without echoing provider text or credentials', async () => {
  await assert.rejects(callRelease('resume', { releaseId: 'r1' }, { url: 'https://release.example/', token: 'test', fetch: async () => Response.json({ error: 'WORKFLOW_STILL_IN_FLIGHT' }, { status: 409 }) }), { message: 'WORKFLOW_STILL_IN_FLIGHT', status: 409 })
})
