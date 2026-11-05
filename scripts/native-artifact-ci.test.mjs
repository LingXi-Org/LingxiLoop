import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { BASELINE, FIDELITY_BASELINE, baselineFor, compactReceipt, configuration, publicEvidence, verifyDiagnosticPrerequisite } from './native-artifact-ci.mjs'

const env = {
  GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF_TYPE: 'branch', GITHUB_REF: 'refs/heads/codex/shared-artifact-editor',
  GITHUB_SHA: 'a'.repeat(40), GITHUB_REPOSITORY: 'LingXi-Org/LingxiLoop', NATIVE_ARTIFACT_PHASE: 'diagnostic',
  RUNNER_TEMP: '/tmp/runner', NATIVE_ARTIFACT_PRIVATE: '/tmp/runner/native-private', NATIVE_ARTIFACT_PUBLIC: '/workspace/results', NATIVE_ARTIFACT_BASELINE_ROOT: '/workspace/baseline',
}
test('acceptance keeps credential state outside the uploaded directory', () => {
  assert.equal(configuration(env).privateRoot, '/tmp/runner/native-private')
  for (const patch of [{ NATIVE_ARTIFACT_PRIVATE: '/workspace/results/private' }, { NATIVE_ARTIFACT_PUBLIC: '/tmp/runner' }, { NATIVE_ARTIFACT_PHASE: 'deploy' }]) assert.throws(() => configuration({ ...env, ...patch }))
})
test('diagnostic dispatch refuses production or automatic events and needs no prior run', async () => {
  await verifyDiagnosticPrerequisite(env, () => assert.fail('diagnostic has no prerequisite network call'))
  for (const patch of [{ GITHUB_REF: 'refs/heads/main' }, { GITHUB_EVENT_NAME: 'pull_request' }, { GITHUB_REF_TYPE: 'tag' }]) await assert.rejects(verifyDiagnosticPrerequisite({ ...env, ...patch }))
})
test('ten pairs require an actual successful diagnostic from the same SHA and workflow', async () => {
  const paired = { ...env, NATIVE_ARTIFACT_PHASE: 'paired', NATIVE_ARTIFACT_DIAGNOSTIC_RUN_ID: '12345', GH_TOKEN: 'private-test-value' }
  const receipt = { head_sha: env.GITHUB_SHA, event: 'workflow_dispatch', path: '.github/workflows/native-artifact-acceptance.yml', status: 'completed', conclusion: 'success', display_title: `Native artifact diagnostic ${env.GITHUB_SHA}` }
  const artifact = { phase: 'diagnostic', baselineCommit: BASELINE, candidateCommit: env.GITHUB_SHA, diagnosticPassed: true, qualified: false, checkpoint: { phase: 'complete', status: 'passed' }, measurement: { diagnosticPassed: true,
    samples: ['baseline', 'candidate'].flatMap(arm => ['design', 'slides'].flatMap(kind => ['fullNavigation', 'workbenchOpen'].map(mode => ({ arm, kind, mode, status: 'passed' })))) } }
  const reply = (run = receipt, expired = false) => async (url, options) => {
    assert.ok(url.startsWith('https://api.github.com/repos/LingXi-Org/LingxiLoop/actions/runs/12345'))
    assert.equal(options.redirect, 'error')
    return { status: 200, json: async () => url.includes('/artifacts?') ? { artifacts: [{ name: `native-artifact-diagnostic-${env.GITHUB_SHA}`, expired }] } : run }
  }
  await verifyDiagnosticPrerequisite(paired, reply(), async () => artifact)
  await verifyDiagnosticPrerequisite(paired, reply({ ...receipt, path: '.github/workflows/ci.yml' }), async () => artifact)
  for (const patch of [{ head_sha: 'b'.repeat(40) }, { conclusion: 'failure' }, { path: '.github/workflows/other.yml' }, { display_title: 'LingxiLoop CI' }]) await assert.rejects(verifyDiagnosticPrerequisite(paired, reply({ ...receipt, ...patch }), async () => artifact))
  for (const patch of [{ candidateCommit: 'b'.repeat(40) }, { phase: 'paired' }, { diagnosticPassed: false }, { measurement: { diagnosticPassed: true, samples: [] } }]) await assert.rejects(verifyDiagnosticPrerequisite(paired, reply(), async () => ({ ...artifact, ...patch })))
  await assert.rejects(verifyDiagnosticPrerequisite(paired, reply(receipt, true), async () => artifact))
})
test('artifact projection retains numeric measurements while dropping secrets, free text and URLs recursively', () => {
  const output = publicEvidence({ qualified: false, samples: [{ arm: 'baseline', kind: 'slides', status: 'passed', editableMs: 321, token: 'secret', cookie: 'x=y', failure: 'private message', source: '<script>', requests: [{ transferredBytes: 42, url: 'https://private.example/token' }], hostile: 'prompt text', nested: { authorization: 'secret', pss: { bytes: 456 }, decodedBytes: 123 } }], headers: { secret: 42 }, commit: 'a'.repeat(40), 'evil\nkey': 'passed' })
  assert.deepEqual(output, { qualified: false, samples: [{ arm: 'baseline', kind: 'slides', status: 'passed', editableMs: 321, nested: { pss: { bytes: 456 }, decodedBytes: 123 } }], commit: 'a'.repeat(40) })
  assert.deepEqual(publicEvidence({ failureCode: 'browser_timeout', failureStage: 'firstInput', failureObservations: { count: 3, source: 'private' } }), { failureCode: 'browser_timeout', failureStage: 'firstInput', failureObservations: { count: 3 } })
  assert.deepEqual(publicEvidence({ failureCode: 'secret-token', failureStage: 'arbitrary prompt' }), {})
})
test('manual workflow preserves dedicated services, published SDKs, no deployment, and narrow artifact upload', () => {
  const workflow = readFileSync(new URL('../.github/workflows/native-artifact-acceptance.yml', import.meta.url), 'utf8')
  for (const text of ['workflow_dispatch:', '127.0.0.1:25432:5432', '127.0.0.1:26379:6379', '127.0.0.1:25001:5001', '127.0.0.1:25200:5200', 'd004312841026a4d90dfbd9e8292a55cc29a2e95', 'path: native-artifact-results/', 'scripts/native-artifact-ci.mjs guard']) assert.ok(workflow.includes(text), text)
  assert.doesNotMatch(workflow, /pull_request:|push:|deploy\/cli|SIGILLO|OPENAI_API_KEY|upload-artifact[\s\S]*path:.*RUNNER_TEMP/)
  assert.match(workflow, /workflow_call:/)
  const registered = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8')
  assert.match(registered, /native-artifact-diagnostic, native-artifact-paired/)
  assert.match(registered, /uses: \.\/\.github\/workflows\/native-artifact-acceptance\.yml/)
  assert.match(registered, /changes:\n\s+if: github\.event_name != 'workflow_dispatch' \|\| !startsWith\(inputs\.scope, 'native-artifact-'\)/)
  assert.match(registered, /cancel-in-progress:.*!startsWith\(inputs\.scope, 'native-artifact-'\)/)
})
test('sanitized raw network records retain exact script accounting without URLs or payloads', () => {
  const report = publicEvidence({ requestsAtEditable: [{ url: 'https://grant.example/private.js?token=secret', type: 'Script', targetType: 'worker', start: 1, end: 2, status: 200, requestOrdinal: 7, network: true, scriptPath: true, transferredBytes: 1234, decodedBytes: 4321, decodedObserved: true, decodedBytesSource: 'Network.dataReceived', encoding: 'gzip', headers: { authorization: 'secret' }, source: 'prompt text', body: 'private body' }], scriptBytes: { requests: 1, transferredBytes: 1234, decodedBytes: 4321 } })
  assert.match(report.requestsAtEditable[0].resourceHash, /^[a-f0-9]{64}$/)
  assert.equal(report.requestsAtEditable[0].targetType, 'worker')
  assert.equal(report.requestsAtEditable[0].transferredBytes, 1234)
  assert.equal(report.requestsAtEditable[0].decodedBytes, 4321)
  assert.equal(report.requestsAtEditable[0].decodedBytesSource, 'Network.dataReceived')
  assert.equal(report.scriptBytes.requests, 1)
  assert.doesNotMatch(JSON.stringify(report), /grant\.example|secret|prompt|private body|authorization/)
  assert.deepEqual(publicEvidence({ setupFailure: { failureStage: 'fixture', failureCode: 'fixture_mismatch' }, downloadCompletedMs: 123, pageCountSource: 'pdfinfo', pageErrors: 0 }), { setupFailure: { failureStage: 'fixture', failureCode: 'fixture_mismatch' }, downloadCompletedMs: 123, pageCountSource: 'pdfinfo', pageErrors: 0 })
  assert.deepEqual(publicEvidence({ offlineHtml: { textVerified: true, networkRequests: 0, pages: 50, source: 'private' } }), { offlineHtml: { textVerified: true, networkRequests: 0, pages: 50 } })
  const benchmark = readFileSync(new URL('./native-artifact-benchmark.py', import.meta.url), 'utf8')
  for (const [, code] of benchmark.matchAll(/MeasurementFailure\(['"]([a-z_]+)['"]/g)) assert.equal(publicEvidence({ failureCode: code }).failureCode, code, `fixed measurement code must remain visible: ${code}`)
})
test('exact browser and platform metadata use strict formats and compact logs exclude raw network records', () => {
  const environment = publicEvidence({ browser: '154.0.8037.57', platform: 'Linux-6.11.0-1018-azure-x86_64-with-glibc2.39', viewport: [1440, 1000] })
  assert.equal(environment.browser, '154.0.8037.57')
  assert.equal(environment.platform, 'Linux-6.11.0-1018-azure-x86_64-with-glibc2.39')
  assert.deepEqual(publicEvidence({ browser: 'https://secret.example/154', platform: 'Linux-secret-token-x86_64' }), {})
  assert.deepEqual(publicEvidence({ browser: '154.0-token', platform: 'Linux-6.11.0-secret-x86_64-with-glibc2.39' }), {})
  const safe = { phase: 'diagnostic', diagnosticPassed: true, qualified: false, executionEnvironment: { node: 'v22.21.0' }, measurement: { environment,
    samples: [{ arm: 'candidate', kind: 'slides', mode: 'fullNavigation', status: 'passed', editableMs: 123, requestsAtEditable: [{ resourceHash: 'a'.repeat(64), transferredBytes: 200 }] }], summary: { observed: 123 }, gates: [] } }
  const receipt = compactReceipt(safe)
  assert.equal(receipt.environment.browser, '154.0.8037.57')
  assert.equal(receipt.environment.node, 'v22.21.0')
  assert.equal(receipt.samples[0].editableMs, 123)
  assert.doesNotMatch(JSON.stringify(receipt), /requestsAtEditable|resourceHash/)
})

test('fidelity profile pins the native baseline while retirement retains its original graph', () => {
  assert.equal(baselineFor(env),BASELINE)
  assert.equal(configuration({...env,NATIVE_ARTIFACT_PROFILE:'fidelity'}).baselineCommit,FIDELITY_BASELINE)
  assert.equal(configuration({...env,NATIVE_ARTIFACT_PROFILE:'fidelity'}).fidelity,true)
  assert.throws(()=>configuration({...env,NATIVE_ARTIFACT_PROFILE:'custom'}))
})

test('worker completion receipts retain measured bytes and strip request details', () => {
  const receipt = publicEvidence({failureObservations:{inflightRequests:[{url:'https://secret.example/worker.js?token=secret',type:'Script',network:true,scriptPath:true,headers:{authorization:'secret'},observedResponseHeadersBytes:149,transferredBytes:1230,decodedBytes:1000054,transferPending:false,transferredBytesSource:'PlaywrightHeaders+PerformanceResourceTiming'}]},failureCleanup:{pageNumber:1,originalHeadingRestored:true,saveAcknowledged:true}})
  assert.equal(receipt.failureObservations.inflightRequests[0].transferredBytes,1230)
  assert.equal(receipt.failureObservations.inflightRequests[0].observedResponseHeadersBytes,149)
  assert.equal(receipt.failureObservations.inflightRequests[0].transferredBytesSource,'PlaywrightHeaders+PerformanceResourceTiming')
  assert.equal(receipt.failureCleanup.originalHeadingRestored,true)
  assert.doesNotMatch(JSON.stringify(receipt),/secret|authorization|worker\.js/)
})
