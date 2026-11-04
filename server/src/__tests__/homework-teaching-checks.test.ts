import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { ipv4HostBitClaims, t11ResponseChecks } from './fixtures/homework-teaching-checks.js'
import { homeworkLivePlan, homeworkProviderFailure } from './fixtures/homework-provider-failure.js'

test('retained A arithmetic failure and B goal failure are distinct from a full-table disclosure', async () => {
  const retained = JSON.parse(await readFile(new URL('../../../docs/evidence/issue-630/compiled-policy-partial.json', import.meta.url), 'utf8'))
  const a = retained.records.find((record: { id: string }) => record.id === 'A-2-turn-1')
  const b = retained.records.find((record: { id: string }) => record.id === 'B-2-turn-1')
  const aChecks = t11ResponseChecks('A', a.visible), bChecks = t11ResponseChecks('B', b.visible)
  assert.equal(aChecks.gates.fullTableBoundary, true)
  assert.equal(aChecks.gates.explicitHostBitClaimsConsistent, false)
  assert.deepEqual(aChecks.arithmetic, [{ hostBits: 3, statedPrefix: 27, expectedPrefix: 29, consistent: false }])
  assert.equal(bChecks.gates.fullTableBoundary, true)
  assert.equal(bChecks.gates.learnerAskedForTest, false)
  assert.equal(bChecks.gates.predictionMentioned, true, 'mentioning predictions is not asking the learner to propose a test')
  assert.equal(bChecks.semanticAcceptance, 'manual-review-required')
  assert.deepEqual(ipv4HostBitClaims('6台需要3位主机位，掩码变成 /29。'), [
    { hostBits: 3, statedPrefix: 29, expectedPrefix: 29, consistent: true },
  ])
  const goalAligned = t11ResponseChecks('B', '样例：60台可用192.168.10.0/26。请你提出一套连通性测试方案，再写出预测结果并解释可能的异常。')
  assert.ok(Object.values(goalAligned.gates).every(Boolean))
  assert.equal(goalAligned.semanticAcceptance, 'manual-review-required')
})

test('rate-limit diagnostics preserve only safe actual reset/quota metadata and never invent a cooldown', () => {
  const now = Date.parse('2026-11-02T10:00:00Z')
  const headers = new Headers({ 'retry-after': '120', 'x-ratelimit-remaining-requests': '0',
    'x-ratelimit-limit-requests': '12', authorization: 'synthetic-private-token', 'x-request-id': 'private-request-id' })
  const actual = homeworkProviderFailure({ status: 429, headers, request: 'private-request-body' }, now)
  assert.equal(actual.rateLimited, true)
  assert.equal(actual.retryNotBefore, '2026-11-02T10:02:00.000Z')
  assert.equal(actual.remainingRequests, 0)
  assert.equal(actual.limitRequests, 12)
  assert.doesNotMatch(JSON.stringify(actual), /synthetic-private-token|private-request-id|private-request-body|authorization/)
  assert.equal(homeworkProviderFailure({ status: 429 }, now).retryNotBefore, null)
  assert.equal(homeworkProviderFailure({ status: 429, headers: new Headers({ 'retry-after': 'Mon, 02 Nov 2026 10:03:00 GMT' }) }, now).retryAfterMs, 180000)
  assert.equal(homeworkProviderFailure({ status: 503, headers: new Headers({ 'retry-after-ms': '2500' }) }, now).retryAfterMs, 2500)
  assert.equal(homeworkProviderFailure({ status: 429, headers: new Headers({ 'retry-after': 'not-a-reset-time' }) }, now).retryNotBefore, null)
})

test('the minimum A/B replay requires four explicitly budgeted calls and never silently expands to the full suite', () => {
  assert.deepEqual(homeworkLivePlan({ caseSet: 'ab', repeats: '1', maxProviderCalls: '4' }),
    { caseSet: 'ab', repeats: 1, maxProviderCalls: 4, minimumCalls: 4 })
  assert.throws(() => homeworkLivePlan({ caseSet: 'ab', repeats: '1' }), /explicit available call budget/)
  assert.throws(() => homeworkLivePlan({ caseSet: 'ab', repeats: '1', maxProviderCalls: '3' }), /explicit available call budget/)
  assert.throws(() => homeworkLivePlan({ caseSet: 'full', repeats: '2', maxProviderCalls: '4' }), /between 11 and 22/)
  assert.throws(() => homeworkLivePlan({ maxProviderCalls: '100' }), /between 11 and 22/)
})
