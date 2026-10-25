import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { feedbackFor, reportRelease } from './github-report.mjs'
const sha = 'a'.repeat(40), releaseId = 'release-1'
const config = { releaseId, appSha: sha, repository: 'LingXi-Org/LingxiLoop', runId: '123', releaseApiUrl: 'https://release.example', releaseToken: 'fixture-release-api', githubToken: 'fixture-ephemeral-github', maxWaitMs: 100, pollMs: 10 }
function fixture(statuses = ['accepted'], { existing = false, loseCreate = false, observationError, badSource = false } = {}) {
  const calls = [], writes = []; let created = existing, reads = 0, tick = 0
  const deployment = { id: 42, sha, task: 'lingxiloop-release', payload: { releaseId, appSha: sha } }
  const fetcher = async (input, init) => {
    const url = new URL(input); calls.push({ url, init })
    assert.equal(init.redirect, 'error'); assert.ok(init.signal instanceof AbortSignal)
    assert.equal(url.searchParams.has('token'), false)
    if (url.host === 'release.example') {
      assert.equal(init.headers.authorization, 'Bearer fixture-release-api')
      if (observationError) return Response.json({ error: 'no auth' }, { status: observationError })
      if (url.pathname.endsWith('/events')) return Response.json({ events: [], cursor: Number(url.searchParams.get('after')) })
      const status = statuses[Math.min(reads++, statuses.length - 1)]
      return Response.json({ releaseId, appSha: badSource ? 'b'.repeat(40) : sha, status, phase: status })
    }
    assert.equal(url.host, 'api.github.com'); assert.equal(init.headers.authorization, 'Bearer fixture-ephemeral-github')
    if (init.method === 'GET') return Response.json(created ? [deployment] : [])
    const body = JSON.parse(init.body); writes.push({ path: url.pathname, body })
    if (url.pathname.endsWith('/deployments')) {
      assert.equal(body.ref, sha); assert.equal(body.auto_merge, false); assert.deepEqual(body.payload, { releaseId, appSha: sha })
      created = true
      if (loseCreate) throw new Error('response lost after creation')
      return Response.json(deployment, { status: 201 })
    }
    assert.equal(body.auto_inactive ?? false, false)
    return Response.json({ id: 99 }, { status: 201 })
  }
  return { calls, writes, dependencies: { fetcher, now: () => tick, wait: async ms => { tick += ms } } }
}
test('accepted alone is a successful production outcome after queued and active observations', async () => {
  const f = fixture(['queued', 'active', 'accepted'])
  const result = await reportRelease(config, f.dependencies)
  assert.equal(result.outcome, 'accepted')
  const deployments = f.writes.filter(call => call.path.endsWith('/statuses')).map(call => call.body.state)
  assert.deepEqual(deployments, ['pending', 'pending', 'in_progress', 'success'])
  assert.equal(f.writes.filter(call => call.path.includes(`/statuses/${sha}`)).at(-1).body.state, 'success')
  assert.ok(f.calls.some(call => call.url.pathname.endsWith('/events')))
})
test('failed, recovered and blocked report explicit failure rather than accepted', async () => {
  for (const status of ['failed', 'recovered', 'blocked']) {
    const f = fixture([status]), result = await reportRelease(config, f.dependencies)
    assert.equal(result.outcome, 'failure'); assert.equal(result.controllerStatus, status)
    assert.equal(f.writes.filter(call => call.path.endsWith('/statuses')).at(-1).body.state, 'failure')
    assert.equal(f.writes.filter(call => call.path.includes(`/statuses/${sha}`)).at(-1).body.state, 'failure')
    assert.ok(!f.writes.some(call => call.body.state === 'success'))
  }
})
test('superseded becomes inactive and never a false success', async () => {
  const f = fixture(['superseded']), result = await reportRelease(config, f.dependencies)
  assert.equal(result.outcome, 'superseded')
  assert.equal(f.writes.filter(call => call.path.endsWith('/statuses')).at(-1).body.state, 'inactive')
  assert.equal(f.writes.filter(call => call.path.includes(`/statuses/${sha}`)).at(-1).body.state, 'pending')
})
test('observation timeout and auth/identity uncertainty remain pending, not production failures', async () => {
  for (const options of [{}, { observationError: 403 }, { observationError: 500 }, { badSource: true }]) {
    const f = fixture(['active'], options), result = await reportRelease(config, f.dependencies)
    assert.equal(result.outcome, 'unknown')
    assert.ok(!f.writes.some(call => ['success', 'failure', 'error'].includes(call.body.state)))
    assert.equal(f.writes.filter(call => call.path.endsWith('/statuses')).at(-1).body.state, 'pending')
  }
})
test('reuses an existing deployment and reconciles a lost create response before any retry', async () => {
  for (const options of [{ existing: true }, { loseCreate: true }]) {
    const f = fixture(['accepted'], options), result = await reportRelease(config, f.dependencies)
    assert.equal(result.deploymentId, 42)
    assert.equal(f.writes.filter(call => call.path.endsWith('/deployments')).length, options.existing ? 0 : 1)
  }
})
test('only the deterministic observer job gets write credentials and enabled builds use SHA concurrency', () => {
  const workflow = readFileSync('.github/workflows/ci.yml', 'utf8')
  const observer = workflow.split('\n  report-release:')[1]
  assert.match(observer, /timeout-minutes: 45/); assert.match(observer, /deployments: write/); assert.match(observer, /statuses: write/)
  assert.match(observer, /secrets.GITHUB_TOKEN/); assert.match(observer, /secrets.RELEASE_API_TOKEN/)
  assert.doesNotMatch(observer, /RELEASE_ADMIN_TOKEN|CLOUDFLARE_API_TOKEN/)
  assert.equal((workflow.match(/deployments: write/g) || []).length, 1)
  assert.equal((workflow.match(/statuses: write/g) || []).length, 1)
  assert.match(workflow, /group: \$\{\{ vars.RELEASE_CONTROLLER_ENABLED == 'true' && format\('lingxiloop-\{0\}', github.sha\) \|\| format\('lingxiloop-\{0\}', github.ref\) \}\}/)
  assert.match(workflow, /cancel-in-progress: \$\{\{ vars.RELEASE_CONTROLLER_ENABLED != 'true' && github.ref != 'refs\/heads\/main' \}\}/)
  const registration = workflow.split('\n  register-candidate:')[1].split('\n  report-release:')[0]
  assert.match(registration, /needs.checks.result == 'success'/)
  assert.match(registration, /needs.integration.result == 'success' \|\| needs.integration.result == 'skipped'/)
  assert.match(registration, /id: register/); assert.match(registration, /github-report.mjs emit/)
})
test('unknown statuses never map to success', () => {
  for (const status of ['queued', 'preparing', 'waiting', 'active', 'recovering', 'timeout', 'unknown']) assert.equal(feedbackFor(status).commit, 'pending')
})

test('registration outputs come only from the matching qualified manifest and actual controller receipt', () => {
  const directory = mkdtempSync(join(tmpdir(), 'lingxi-report-')), output = join(directory, 'output')
  const manifest = { releaseId, appSha: sha, checks: { commit: sha, conclusion: 'success' } }
  writeFileSync(join(directory, 'release-manifest.json'), JSON.stringify(manifest))
  writeFileSync(join(directory, 'release-submission.json'), JSON.stringify({ releaseId, appSha: sha }))
  const script = fileURLToPath(new URL('./github-report.mjs', import.meta.url))
  const options = { cwd: directory, env: { ...process.env, GITHUB_OUTPUT: output, GITHUB_SHA: sha }, encoding: 'utf8' }
  assert.equal(spawnSync(process.execPath, [script, 'emit'], options).status, 0)
  assert.equal(readFileSync(output, 'utf8'), `release_id=${releaseId}\napp_sha=${sha}\n`)
  writeFileSync(join(directory, 'release-submission.json'), JSON.stringify({ releaseId, appSha: 'b'.repeat(40) }))
  assert.equal(spawnSync(process.execPath, [script, 'emit'], options).status, 1)
})
