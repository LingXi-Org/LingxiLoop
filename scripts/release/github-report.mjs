import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const idPattern = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,95}$/
const shaPattern = /^[a-f0-9]{40}$/
const states = new Set(['queued', 'preparing', 'waiting', 'active', 'accepted', 'failed', 'recovering', 'recovered', 'blocked', 'superseded'])
export function feedbackFor(status) {
  if (status === 'accepted') return { outcome: 'accepted', deployment: 'success', commit: 'success', terminal: true, description: 'Production accepted by the release controller' }
  if (['failed', 'recovered', 'blocked'].includes(status)) return { outcome: 'failure', deployment: 'failure', commit: 'failure', terminal: true, description: `Controller ${status}; production candidate is not accepted` }
  if (status === 'superseded') return { outcome: 'superseded', deployment: 'inactive', commit: 'pending', terminal: true, description: 'Superseded candidate; inactive and not production accepted' }
  return { outcome: 'pending', deployment: status === 'active' || status === 'recovering' ? 'in_progress' : 'pending', commit: 'pending', terminal: false, description: `Controller ${status || 'unknown'}; awaiting production acceptance` }
}
function fail(code) { return Object.assign(new Error(code), { code }) }
async function jsonRequest(fetcher, url, options, namespace) {
  let response
  try { response = await fetcher(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(15000) }) }
  catch { throw fail(`${namespace}_RESPONSE_UNCERTAIN`) }
  if (!response.ok) { await response.body?.cancel(); throw Object.assign(fail(`${namespace}_HTTP_${response.status}`), { status: response.status }) }
  try { return await response.json() } catch { throw fail(`${namespace}_RESPONSE_INVALID`) }
}
export function emitSubmissionOutput(output = process.env.GITHUB_OUTPUT) {
  const manifest = JSON.parse(readFileSync('release-manifest.json', 'utf8')), receipt = JSON.parse(readFileSync('release-submission.json', 'utf8'))
  if (!output || !idPattern.test(receipt.releaseId ?? '') || receipt.releaseId !== manifest.releaseId || receipt.appSha !== manifest.appSha || !shaPattern.test(manifest.appSha ?? '') || manifest.appSha !== process.env.GITHUB_SHA || manifest.checks?.commit !== manifest.appSha || manifest.checks?.conclusion !== 'success') throw fail('UNQUALIFIED_RELEASE_SUBMISSION')
  appendFileSync(output, `release_id=${receipt.releaseId}\napp_sha=${manifest.appSha}\n`)
}
/** GitHub observes the durable controller; this function never executes a release. */
export async function reportRelease(config, { fetcher = fetch, now = Date.now, wait = ms => new Promise(resolve => setTimeout(resolve, ms)), progress = () => {} } = {}) {
  const { releaseId, appSha, repository, runId, releaseToken, githubToken } = config
  const maxWaitMs = config.maxWaitMs ?? 40 * 60 * 1000, pollMs = config.pollMs ?? 10000
  if (!idPattern.test(releaseId ?? '') || !shaPattern.test(appSha ?? '') || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? '') || !/^\d+$/.test(String(runId)) || !releaseToken || !githubToken || !Number.isSafeInteger(maxWaitMs) || maxWaitMs < 1 || maxWaitMs > 40 * 60 * 1000 || !Number.isSafeInteger(pollMs) || pollMs < 1 || pollMs > 60000) throw fail('INVALID_REPORT_CONFIGURATION')
  let origin
  try { origin = new URL(config.releaseApiUrl) } catch { throw fail('INVALID_RELEASE_ORIGIN') }
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw fail('INVALID_RELEASE_ORIGIN')
  const api = `https://api.github.com/repos/${repository}`, runUrl = `https://github.com/${repository}/actions/runs/${runId}`
  const github = (path, method = 'GET', body) => jsonRequest(fetcher, `${api}${path}`, { method, headers: { authorization: `Bearer ${githubToken}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }, 'GITHUB')
  const release = path => jsonRequest(fetcher, new URL(path, origin), { headers: { authorization: `Bearer ${releaseToken}`, accept: 'application/json' } }, 'RELEASE')
  const lookup = async () => {
    for (let page = 1; page <= 10; page++) {
      const deployments = await github(`/deployments?sha=${appSha}&environment=production&per_page=100&page=${page}`)
      if (!Array.isArray(deployments)) throw fail('GITHUB_DEPLOYMENT_RESPONSE_INVALID')
      const existing = deployments.filter(item => {
        let payload = item.payload
        if (typeof payload === 'string') { try { payload = JSON.parse(payload) } catch { return false } }
        return item.sha === appSha && item.task === 'lingxiloop-release' && payload?.releaseId === releaseId
      })
      if (existing.length > 1) throw fail('GITHUB_DUPLICATE_RELEASE_DEPLOYMENTS')
      if (existing.length) return existing[0]
      if (deployments.length < 100) return null
    }
    throw fail('GITHUB_DEPLOYMENT_LOOKUP_INCOMPLETE')
  }
  let deployment = await lookup()
  if (!deployment) {
    try {
      // Source check/integration jobs already qualified this exact SHA before
      // registration. Do not wait for this observer's own pending status.
      deployment = await github('/deployments', 'POST', { ref: appSha, auto_merge: false, required_contexts: [], environment: 'production', task: 'lingxiloop-release', production_environment: true, payload: { releaseId, appSha }, description: `Observe release ${releaseId}` })
    } catch (error) {
      if (!['GITHUB_RESPONSE_UNCERTAIN', 'GITHUB_RESPONSE_INVALID'].includes(error.code)) throw error
      deployment = await lookup()
      if (!deployment) throw fail('GITHUB_DEPLOYMENT_CREATE_UNCONFIRMED')
    }
  }
  if (!Number.isSafeInteger(deployment.id) || deployment.id < 1) throw fail('GITHUB_DEPLOYMENT_ID_INVALID')
  let reported = ''
  const publish = async feedback => {
    const signature = `${feedback.deployment}:${feedback.commit}:${feedback.description}`
    if (reported === signature) return
    await github(`/deployments/${deployment.id}/statuses`, 'POST', { state: feedback.deployment, description: feedback.description.slice(0, 140), log_url: runUrl, auto_inactive: false })
    await github(`/statuses/${appSha}`, 'POST', { state: feedback.commit, context: 'release/controller', description: feedback.description.slice(0, 140), target_url: runUrl })
    reported = signature
  }
  const started = now(), deadline = started + maxWaitMs
  let lastStatus = 'unknown', lastPhase = '', cursor = 0, lastError = ''
  await publish(feedbackFor('unknown'))
  while (now() < deadline) {
    try {
      const record = await release(`/v1/releases/${releaseId}`)
      if (record.releaseId !== releaseId || record.appSha !== appSha || !states.has(record.status)) throw fail('RELEASE_SOURCE_IDENTITY_MISMATCH')
      lastStatus = record.status
      lastPhase = typeof record.phase === 'string' && /^[A-Za-z0-9_.:-]{0,80}$/.test(record.phase) ? record.phase : ''
      lastError = ''
      const feedback = feedbackFor(lastStatus)
      await publish(feedback)
      progress({ releaseId, status: lastStatus, phase: lastPhase })
      if (feedback.terminal) return { releaseId, appSha, deploymentId: deployment.id, outcome: feedback.outcome, controllerStatus: lastStatus, phase: lastPhase, elapsedMs: now() - started }
      const events = await release(`/v1/releases/${releaseId}/events?after=${cursor}`)
      if (!Number.isSafeInteger(events.cursor) || events.cursor < cursor || !Array.isArray(events.events)) throw fail('RELEASE_EVENT_RESPONSE_INVALID')
      cursor = events.cursor
    } catch (error) {
      // A GitHub write failure does not change the production outcome and must
      // surface to CI; only release-observation outages are retried here.
      if (!error.code?.startsWith('RELEASE_')) throw error
      lastError = error.code
      if (error.status && error.status < 500 || ['RELEASE_SOURCE_IDENTITY_MISMATCH', 'RELEASE_EVENT_RESPONSE_INVALID'].includes(error.code)) break
    }
    if (now() >= deadline) break
    await wait(Math.min(pollMs, deadline - now()))
  }
  await publish({ outcome: 'unknown', deployment: 'pending', commit: 'pending', description: `Acceptance unknown; observation ended at ${lastStatus}` })
  return { releaseId, appSha, deploymentId: deployment.id, outcome: 'unknown', controllerStatus: lastStatus, phase: lastPhase, elapsedMs: now() - started, error: lastError || 'OBSERVATION_TIMEOUT' }
}
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  try {
    if (process.argv[2] === 'emit') emitSubmissionOutput()
    else {
      const result = await reportRelease({ releaseId: process.env.RELEASE_ID, appSha: process.env.GITHUB_SHA, repository: process.env.GITHUB_REPOSITORY, runId: process.env.GITHUB_RUN_ID, releaseApiUrl: process.env.RELEASE_API_URL, releaseToken: process.env.RELEASE_API_TOKEN, githubToken: process.env.GITHUB_TOKEN }, { progress: state => console.log(JSON.stringify(state)) })
      writeFileSync('release-github-report.json', JSON.stringify(result, null, 2))
      if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `outcome=${result.outcome}\ncontroller_status=${result.controllerStatus}\n`)
      if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `Release **${result.releaseId}**: **${result.outcome}** (controller: ${result.controllerStatus}). This job observes the controller; a timeout is pending acceptance, not proof of production failure.\n`)
      console.log(JSON.stringify(result))
      if (result.outcome === 'failure') process.exitCode = 1
    }
  } catch (error) { console.error(JSON.stringify({ error: error.code ?? 'RELEASE_REPORT_FAILED' })); process.exitCode = 1 }
}
