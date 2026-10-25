import test from 'node:test'
import assert from 'node:assert/strict'
import { cloudflare, HOSTS, resumeDenied, deniedInCurrentRevision } from './core.mjs'
import { ingressFor, policyFor, policyMatches, all } from './resources.mjs'
test('each tunnel exposes only its exact hostname and loopback executor, with final 404', () => {
  for (const host of HOSTS) assert.deepEqual(ingressFor(host), [{ hostname: host.domain, service: 'http://127.0.0.1:17951' }, { service: 'http_status:404' }])
  assert.deepEqual(HOSTS.map(host => host.domain), ['release-a.lingxilearn.cn', 'release-b.lingxilearn.cn'])
})
test('Access permits one exact service token and rejects extra or broad policy', () => {
  const policy = policyFor('token-id')
  assert.equal(policyMatches([policy], 'token-id'), true)
  for (const policies of [[], [policy, { decision: 'bypass', include: [{ everyone: {} }] }], [{ ...policy, decision: 'allow' }], [{ ...policy, include: [{ any_valid_service_token: {} }] }], [{ ...policy, include: [{ service_token: { token_id: 'other' } }] }]]) assert.equal(policyMatches(policies, 'token-id'), false)
})
test('Cloudflare permission denial is surfaced once without retry or secret diagnostics', async () => {
  let calls = 0
  const client = cloudflare({ CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32), CLOUDFLARE_API_TOKEN: 'private-token' }, async (url, init) => {
    calls++; assert.equal(new URL(url).host, 'api.cloudflare.com'); assert.equal(init.redirect, 'error')
    return Response.json({ success: false, errors: [{ code: 10000, message: 'untrusted diagnostic private-token' }] }, { status: 403 })
  })
  await assert.rejects(client.request('/accounts/account/access/apps', 'POST', { domain: 'release-a.lingxilearn.cn' }), error => error.code === 'CF_HTTP_403' && !JSON.stringify(error).includes('private-token'))
  assert.equal(calls, 1)
})
test('inventory pagination checks all pages before deciding a name is absent', async () => {
  const pages = []
  const records = await all({ request: async path => { const page = Number(new URL(path, 'https://api.example').searchParams.get('page')); pages.push(page); return { result: [{ id: page }], result_info: { total_pages: 2 } } } }, '/accounts/test/access/apps')
  assert.deepEqual(pages, [1, 2]); assert.deepEqual(records, [{ id: 1 }, { id: 2 }])
})
test('a changed credential revision allows one authorized continuation while retaining denials', () => {
  const log = { state: { steps: [{ code: 'CF_HTTP_403', target: 'POST /fixed' }] }, record(step) { this.state.steps.push(step) } }
  const denied = () => deniedInCurrentRevision(log, step => step.target === 'POST /fixed')
  assert.equal(denied(), true)
  resumeDenied(log, 'a'.repeat(64))
  assert.equal(denied(), false)
  log.record({ code: 'CF_HTTP_403', target: 'POST /fixed' })
  assert.equal(denied(), true)
  assert.throws(() => resumeDenied(log, 'a'.repeat(64)), { code: 'CF_CREDENTIAL_REVISION_ALREADY_ATTEMPTED' })
  assert.equal(denied(), true)
  resumeDenied(log, 'b'.repeat(64))
  assert.equal(denied(), false)
  assert.equal(log.state.steps.filter(step => step.code === 'CF_HTTP_403').length, 2)
})
