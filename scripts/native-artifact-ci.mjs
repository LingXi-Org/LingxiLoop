import {checkedServiceFailure,measurementFailure}from'./native-artifact-failure.mjs'
/** CI-only real product orchestration. No API mocks, runtime substitutions or model calls.
 * Cookies, TLS keys, downloads and raw service output stay in RUNNER_TEMP. The
 * artifact projection below is deliberately an allowlist, not a log redactor. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawn, execFileSync } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { chmod, copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'
import { release as kernelRelease, platform as osPlatform, arch as osArchitecture } from 'node:os'
import { fileURLToPath } from 'node:url'

export const BASELINE = 'd004312841026a4d90dfbd9e8292a55cc29a2e95'
export const FIDELITY_BASELINE = '72162f582fe49e9cbdb03f760e29e3683f9c5c99'
export function baselineFor(env = process.env) { return env.NATIVE_ARTIFACT_PROFILE === 'fidelity' ? FIDELITY_BASELINE : BASELINE }
const root = fileURLToPath(new URL('../', import.meta.url))
const database = arm => `postgresql://postgres:native-artifact-local-test-only@127.0.0.1:25432/native_artifact_${arm}_test`
const delay = milliseconds => new Promise(resolveDelay => setTimeout(resolveDelay, milliseconds))
const phases = new Set(['guard', 'bootstrap', 'bootstrap-baseline', 'bootstrap-candidate', 'serve-baseline', 'serve-candidate', 'measurement', 'complete'])
const serviceStages = new Set(['database-connect', 'database-ready', 'tenant-seeding', 'web-starting', 'im-starting', 'auth-starting', 'auth-ready', 'object-storage-ready', 'design-created', 'slides-created', 'fixture-design', 'fixture-slides', 'fixture-slides-assets', 'ready'])
const codes = new Set(['ERR_ASSERTION', 'ERR_MODULE_NOT_FOUND', 'MODULE_NOT_FOUND', 'ENOENT', 'ENOSPC', 'E401', 'E403', 'E404', 'ECONNREFUSED', 'ETIMEDOUT', 'SERVICE_TIMEOUT', 'CHILD_FAILED', 'DIAGNOSTIC_FAILED', 'MEASUREMENT_FAILED'])
const safeCode = error => codes.has(error?.code) ? error.code : 'CHILD_FAILED'
const measurementStages = new Set(['configuration', 'fixture', 'host', 'launch', 'workbenchPreparation', 'open', 'firstReadiness', 'firstInput', 'idleObservation', 'undo', 'traversal', 'export', 'closeReclamation', 'validation', 'complete'])
const failureCodes = new Set(['native_keyboard_focus_unavailable', 'fixture_restore_unconfirmed', 'native_view_normalization_failed', 'native_editor_not_ready', 'fixture_mismatch', 'browser_startup_failed', 'cdp_setup_failed', 'current_page_media_or_fonts_not_ready', 'decoded_script_accounting_incomplete', 'editor_close_control_missing', 'editor_close_not_observed', 'export_control_missing', 'export_diagnostic_incomplete', 'export_download_empty', 'export_download_failed', 'export_page_count_mismatch', 'export_signature_invalid', 'matching_edit_save_not_acknowledged', 'native_export_control_missing', 'natural_reclamation_pss_incomplete', 'network_did_not_settle', 'network_failure_observed', 'page_exception_observed', 'page_navigation_control_missing', 'pss_incomplete', 'retired_editor_loaded', 'traversal_intentionally_unverified', 'trusted_input_proof_failed', 'undo_save_not_acknowledged', 'export_pss_incomplete', 'process_or_filesystem_error', 'browser_timeout', 'browser_or_measurement_error'])
for (const code of ['configuration_invalid', 'browser_dependency_missing', 'export_pdf_parser_unavailable', 'export_pdf_parser_failed', 'export_page_content_mismatch', 'legacy_all_board_html_control_unverified', 'legacy_focused_page_unknown']) failureCodes.add(code)
for (const code of ['export_offline_browser_mismatch', 'export_offline_html_incomplete', 'export_offline_html_open_failed']) failureCodes.add(code)

export function configuration(env = process.env) {
  assert.ok(!env.NATIVE_ARTIFACT_PROFILE || ['retirement','fidelity'].includes(env.NATIVE_ARTIFACT_PROFILE), 'known measurement profile required')
  assert.ok(['diagnostic', 'paired'].includes(env.NATIVE_ARTIFACT_PHASE), 'explicit acceptance phase required')
  const temporary = resolve(env.RUNNER_TEMP ?? '/tmp')
  const privateRoot = resolve(env.NATIVE_ARTIFACT_PRIVATE ?? '')
  assert.ok(isAbsolute(env.NATIVE_ARTIFACT_PRIVATE ?? '') && privateRoot.startsWith(temporary + '/'), 'private state must stay under runner temporary directory')
  const publicRoot = resolve(env.NATIVE_ARTIFACT_PUBLIC ?? '')
  assert.ok(isAbsolute(env.NATIVE_ARTIFACT_PUBLIC ?? '') && publicRoot !== privateRoot && !publicRoot.startsWith(privateRoot + '/') && !privateRoot.startsWith(publicRoot + '/'), 'public and private directories must be separate')
  assert.ok(isAbsolute(env.NATIVE_ARTIFACT_BASELINE_ROOT ?? ''), 'explicit frozen checkout required')
  return { phase: env.NATIVE_ARTIFACT_PHASE, fidelity: env.NATIVE_ARTIFACT_PROFILE === 'fidelity', baselineCommit: baselineFor(env), privateRoot, publicRoot, baselineRoot: resolve(env.NATIVE_ARTIFACT_BASELINE_ROOT) }
}

async function downloadDiagnosticReceipt(env, artifactName) {
  const directory = await mkdtemp(join(env.RUNNER_TEMP, 'native-artifact-receipt-'))
  try {
    // Runs inside the GitHub runner, using its normal official artifact API.
    // This is never used to access blocked local package/log destinations.
    execFileSync('gh', ['run', 'download', env.NATIVE_ARTIFACT_DIAGNOSTIC_RUN_ID, '--repo', env.GITHUB_REPOSITORY, '--name', artifactName, '--dir', directory], {
      env: { ...process.env, GH_HOST: 'github.com', GH_TOKEN: env.GH_TOKEN }, stdio: ['ignore', 'ignore', 'pipe'], timeout: 60000,
    })
    return JSON.parse(await readFile(join(directory, 'results.json'), 'utf8'))
  } finally { await rm(directory, { recursive: true, force: true }) }
}
export async function verifyDiagnosticPrerequisite(env = process.env, fetcher = fetch, receiptReader = downloadDiagnosticReceipt) {
  assert.equal(env.GITHUB_EVENT_NAME, 'workflow_dispatch')
  assert.equal(env.GITHUB_REF_TYPE, 'branch')
  assert.ok(env.GITHUB_REF?.startsWith('refs/heads/') && env.GITHUB_REF !== 'refs/heads/main', 'only explicit non-production branch dispatches are allowed')
  assert.match(env.GITHUB_SHA ?? '', /^[a-f0-9]{40}$/)
  assert.ok(['diagnostic', 'paired'].includes(env.NATIVE_ARTIFACT_PHASE))
  if (env.NATIVE_ARTIFACT_PHASE === 'diagnostic') return
  assert.match(env.NATIVE_ARTIFACT_DIAGNOSTIC_RUN_ID ?? '', /^[1-9][0-9]*$/)
  assert.match(env.GITHUB_REPOSITORY ?? '', /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/)
  // No caller-provided host, URL, workflow or revision can weaken this receipt.
  const runUrl = `https://api.github.com/repos/${env.GITHUB_REPOSITORY}/actions/runs/${env.NATIVE_ARTIFACT_DIAGNOSTIC_RUN_ID}`
  const get = url => fetcher(url, { headers: { Authorization: `Bearer ${env.GH_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, redirect: 'error', signal: AbortSignal.timeout(15000) })
  const response = await get(runUrl)
  assert.equal(response.status, 200)
  const run = await response.json()
  assert.equal(run.head_sha, env.GITHUB_SHA)
  assert.equal(run.event, 'workflow_dispatch')
  assert.ok(['.github/workflows/native-artifact-acceptance.yml', '.github/workflows/ci.yml'].includes(run.path))
  assert.equal(run.status, 'completed')
  assert.equal(run.conclusion, 'success')
  assert.equal(run.display_title, `Native artifact diagnostic ${env.GITHUB_SHA}`)
  const artifactName = `native-artifact-diagnostic-${env.GITHUB_SHA}`
  const listing = await get(runUrl + '/artifacts?per_page=100')
  assert.equal(listing.status, 200)
  const artifacts = (await listing.json()).artifacts.filter(item => item.name === artifactName && item.expired === false)
  assert.equal(artifacts.length, 1, 'exact unexpired diagnostic artifact required')
  const receipt = await receiptReader(env, artifactName)
  assert.equal(receipt.phase, 'diagnostic')
  assert.equal(receipt.baselineCommit, baselineFor(env))
  assert.equal(receipt.candidateCommit, env.GITHUB_SHA)
  assert.equal(receipt.diagnosticPassed, true)
  assert.equal(receipt.qualified, false)
  assert.equal(receipt.checkpoint?.phase, 'complete')
  assert.equal(receipt.checkpoint?.status, 'passed')
  assert.equal(receipt.measurement?.diagnosticPassed, true)
  const samples = receipt.measurement.samples
  assert.equal(samples.length, 8)
  for (const arm of ['baseline', 'candidate']) for (const kind of ['design', 'slides']) for (const mode of ['fullNavigation', 'workbenchOpen']) {
    const matching = samples.filter(sample => sample.arm === arm && sample.kind === kind && sample.mode === mode)
    assert.equal(matching.length, 1)
    assert.equal(matching[0].status, 'passed')
  }
}

// Permit numeric evidence and fixed labels only. URLs, errors, headers, cookies,
// HTML, source code, prompts and arbitrary strings never enter uploaded JSON.
const labels = new Set(['baseline', 'candidate', 'design', 'slides', 'passed', 'failed', 'unsupported', 'diagnostic', 'paired', 'fullNavigation', 'workbenchOpen', 'html', 'pdf', 'pptx', 'Script', 'Document', 'Image', 'Font', 'Fetch', 'XHR', 'Other', 'page', 'iframe', 'worker', 'service_worker', 'none', 'observed', 'incomplete', 'nativePageStrip', 'nativeDesignKeyboard', 'nativeDesignBoard', 'legacySlidesRail', 'legacyDesignPageKey', 'legacyDesignBoard', 'insertText'])
const dottedVersion = /^\d{1,3}(?:\.\d{1,6}){1,4}$/
const linuxKernelPattern = String.raw`\d{1,3}\.\d{1,3}\.\d{1,4}(?:[.-]\d{1,6})?(?:-(?:generic|azure|aws|amd64|cloud-amd64))?\+?`
const linuxPlatform = new RegExp(`^Linux-${linuxKernelPattern}-(?:x86_64|aarch64)-with-glibc\\d{1,3}\\.\\d{1,3}$`)
const requestTables = new Set(['inflightRequests', 'requestsAtEditable', 'requestsAtIdle', 'requestsAtStable', 'requestsAtOpen', 'requestsBeforeOpen', 'failedRequests'])
const requestTypes = new Set(['Script', 'Document', 'Stylesheet', 'Image', 'Font', 'Fetch', 'XHR', 'Other', 'Media', 'WebSocket', 'EventSource', 'Ping', 'Preflight', 'Manifest'])
export function publicRequest(row) {
  const safe = { resourceHash: createHash('sha256').update(typeof row.url === 'string' ? row.url : '').digest('hex'),
    category: row.retiredEditor ? 'retired-editor' : row.scriptPath || row.type === 'Script' ? 'script' : row.sourcePayload ? 'source-document' : 'other',
    type: requestTypes.has(row.type) ? row.type : 'Other',
    targetType: ['page', 'iframe', 'worker', 'service_worker', 'shared_worker'].includes(row.targetType) ? row.targetType : 'other' }
  for (const key of ['start', 'startEpochMs', 'requestOrdinal', 'status', 'transferredBytes', 'decodedBytes', 'declaredEncodedBodyBytes', 'observedResponseHeadersBytes', 'finishedEpochMs', 'end']) if (typeof row[key] === 'number' && Number.isFinite(row[key])) safe[key] = row[key]
  for (const key of ['network', 'scriptPath', 'sourcePayload', 'retiredEditor', 'cache', 'decodedObserved', 'finished', 'failed', 'canceled', 'transferPending']) if (typeof row[key] === 'boolean') safe[key] = row[key]
  if (['identity', 'gzip', 'br', 'deflate', 'zstd'].includes(row.encoding)) safe.encoding = row.encoding
  if (['Network.dataReceived', 'PerformanceResourceTiming'].includes(row.decodedBytesSource)) safe.decodedBytesSource = row.decodedBytesSource
  if (['Network.loadingFinished', 'PlaywrightRequestSizes', 'PlaywrightHeaders+PerformanceResourceTiming'].includes(row.transferredBytesSource)) safe.transferredBytesSource = row.transferredBytesSource
  return safe
}
export function publicEvidence(value, key = '') {
  if (key === 'metric') return ['editableMs', 'scriptTransferBytes', 'pssDeltaBytes', 'inputFeedbackP95'].includes(value) ? value : undefined
  if (key === 'arms' && value && typeof value === 'object') return Object.fromEntries(['baseline', 'candidate'].filter(arm => value[arm]).map(arm => [arm, {
    commit: /^[a-f0-9]{40}$/.test(value[arm].commit ?? '') ? value[arm].commit : null,
    fixtureSemanticHashes: Object.fromEntries(['design', 'slides'].flatMap(kind => {
      const hash = value[arm].fixtureSemanticHashes?.[kind]
      return /^[a-f0-9]{64}$/.test(hash ?? '') ? [[kind, hash]] : []
    })),
  }]))
  if (key === 'textVerified' && typeof value === 'boolean') return value
  if (key === 'networkRequests' && typeof value === 'number') return Number.isFinite(value) ? value : null
  if (key === 'offlineHtml' && value && typeof value === 'object') return publicEvidence(value)
  if (key === 'browser') return typeof value === 'string' && dottedVersion.test(value) ? value : undefined
  if (key === 'platform') return typeof value === 'string' && value.length <= 100 && linuxPlatform.test(value) ? value : undefined
  if (key === 'setupFailure' && value && typeof value === 'object') return publicEvidence(value)
  if (['pageErrors', 'downloadCompletedMs'].includes(key) && typeof value === 'number') return Number.isFinite(value) ? value : null
  if (key === 'pageCountSource') return ['pdfinfo', 'htmlParser', 'zipSlideParts'].includes(value) ? value : undefined
  if (key === 'scope' && ['frozenBaselineDesignHasNoPptx', 'frozenBaselineDesignOnlySingleBoardHtml'].includes(value)) return value
  if (requestTables.has(key) && Array.isArray(value)) return value.filter(row => row && typeof row === 'object').map(publicRequest)
  if (key === 'retiredRequests' && Array.isArray(value)) return value.filter(url => typeof url === 'string').map(url => publicRequest({ url, retiredEditor: true }))
  if (key === 'requests' && typeof value === 'number') return Number.isFinite(value) ? value : null
  if (key === 'failureCode') return failureCodes.has(value) ? value : undefined
  if (key === 'failureStage' || key === 'phase' && measurementStages.has(value)) return measurementStages.has(value) ? value : undefined
  if (['failureObservations', 'failureCleanup'].includes(key) && value && typeof value === 'object') return publicEvidence(value)
  if (/cookie|token|secret|password|authorization|headers|source|prompt|html|url|error|failure|request|command|stack|authentication|path|text|message|download|^arms$/i.test(key)) return undefined
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'boolean' || value === null) return value
  if (typeof value === 'string') return labels.has(value) || /^[a-f0-9]{40,64}$/.test(value) ? value : undefined
  if (Array.isArray(value)) return value.map(item => publicEvidence(item)).filter(item => item !== undefined)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).flatMap(([name, item]) => {
    if (!/^[A-Za-z0-9:_-]{1,80}$/.test(name)) return []
    const safe = publicEvidence(item, name)
    return safe === undefined ? [] : [[name, safe]]
  }))
  return undefined
}

async function executionEnvironment(config) {
  const runtimeVersion = async path => {
    const value = await readFile(path, 'utf8').then(JSON.parse).then(pkg => pkg.version).catch(() => null)
    return ['3.8.25', '4.0.0'].includes(value) ? value : null
  }
  const kernel = kernelRelease(), system = osPlatform(), architecture = osArchitecture()
  const osRelease = await readFile('/etc/os-release', 'utf8').catch(() => '')
  const distribution = osRelease.match(/^ID=["']?([a-z]+)["']?$/m)?.[1]
  const distributionVersion = osRelease.match(/^VERSION_ID=["']?([\d.]+)["']?$/m)?.[1]
  return { operatingSystem: system === 'linux' ? system : null, architecture: ['x64', 'arm64'].includes(architecture) ? architecture : null,
    kernelRelease: new RegExp(`^${linuxKernelPattern}$`).test(kernel) ? kernel : null,
    distribution: ['ubuntu', 'debian'].includes(distribution) ? distribution : null,
    distributionVersion: distributionVersion && /^\d{1,3}(?:\.\d{1,3})?$/.test(distributionVersion) ? distributionVersion : null,
    node: /^v\d{1,3}(?:\.\d{1,6}){2}$/.test(process.version) ? process.version : null,
    expectedRuntime: { baseline: config.fidelity ? '4.0.0' : '3.8.25', candidate: '4.0.0' },
    installedRuntime: { baseline: await runtimeVersion(join(config.baselineRoot, config.fidelity ? 'node_modules/@lingxi-org/lingxios/package.json' : 'node_modules/@lyyzka/lingxios/package.json')), candidate: await runtimeVersion(join(root, 'node_modules/@lingxi-org/lingxios/package.json')) } }
}

export function compactReceipt(safe) {
  const fields = ['run', 'arm', 'kind', 'mode', 'status', 'phase', 'failureStage', 'failureCode', 'editableMs', 'scriptTransferBytes', 'scriptDecodedBytes', 'idleScriptTransferBytes', 'idleScriptDecodedBytes', 'pssDeltaBytes', 'firstInputMs', 'failureObservations', 'viewNormalization']
  const exportFields = ['format', 'status', 'failureCode', 'bytes', 'pages', 'durationMs', 'peakPssBytes', 'hostSubtractedPeakPssBytes', 'offlineHtml']
  return { schemaVersion: safe.schemaVersion, phase: safe.phase, baselineCommit: safe.baselineCommit, candidateCommit: safe.candidateCommit,
    environment: { ...safe.executionEnvironment, ...safe.measurement?.environment },
    diagnosticPassed: safe.diagnosticPassed, qualified: safe.qualified, checkpoint: safe.checkpoint,
    ...(safe.measurementFault?{measurementFault:safe.measurementFault}:{}),
    ...(safe.measurement?.setupFailure ? { setupFailure: safe.measurement.setupFailure } : {}),
    summary: safe.measurement?.summary ?? {}, gates: safe.measurement?.gates ?? [],
    samples: (safe.measurement?.samples ?? []).map(sample => ({ ...Object.fromEntries(fields.filter(key => sample[key] !== undefined).map(key => [key, sample[key]])),
      ...(sample.exports ? { exports: sample.exports.map(result => Object.fromEntries(exportFields.filter(key => result[key] !== undefined).map(key => [key, result[key]]))) } : {}) })) }
}

async function privateDirectory(config) {
  await mkdir(config.privateRoot, { recursive: true, mode: 0o700 })
  await chmod(config.privateRoot, 0o700)
}
async function checkpoint(config, phase, status = 'running', code) {
  assert.ok(phases.has(phase)); assert.ok(['running', 'passed', 'failed'].includes(status))
  await privateDirectory(config)
  await writeFile(join(config.privateRoot, 'phase.json'), JSON.stringify({ phase, status, ...(codes.has(code) ? { code } : {}) }) + '\n', { mode: 0o600 })
}
function child(command, args, cwd, env, log) {
  const output = createWriteStream(log, { mode: 0o600 })
  const process = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true })
  process.stdout.pipe(output, { end: false }); process.stderr.pipe(output, { end: false })
  const completion = new Promise((resolveChild, reject) => {
    process.once('error', reject)
    process.once('close', (code, signal) => { output.end(); resolveChild({ code, signal }) })
  })
  return { process, completion }
}
async function stop(task) {
  if (task.process.exitCode !== null || task.process.signalCode !== null) return
  try { process.kill(-task.process.pid, 'SIGTERM') } catch {}
  await Promise.race([task.completion, delay(10000)])
  if (task.process.exitCode === null && task.process.signalCode === null) {
    try { process.kill(-task.process.pid, 'SIGKILL') } catch {}
    await task.completion
  }
}
async function execute(config, name, command, args, cwd = root, env = process.env) {
  const task = child(command, args, cwd, env, join(config.privateRoot, `${name}.log`))
  const result = await task.completion
  if (result.code !== 0) throw Object.assign(new Error('Acceptance child failed'), { code: 'CHILD_FAILED' })
}
async function bootstrap(config) {
  const { Client } = await import('pg')
  const admin = new Client({ connectionString: database('baseline').replace('/native_artifact_baseline_test', '/postgres') })
  await admin.connect()
  try {
    for (const arm of ['baseline', 'candidate']) {
      // Fixed identifiers; refuse reuse rather than silently resetting any DB.
      const name = `native_artifact_${arm}_test`
      assert.equal((await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [name])).rowCount, 0)
      await admin.query(`CREATE DATABASE ${name}`)
    }
  } finally { await admin.end() }
  for (const arm of ['baseline', 'candidate']) {
    await checkpoint(config, `bootstrap-${arm}`)
    const env = { ...process.env, NODE_ENV: 'test', DATABASE_URL: database(arm), INTEGRATION_DATABASE_URL: database(arm), DOTENV_CONFIG_PATH: '/dev/null',
      REDIS_URL: `redis://127.0.0.1:26379/${arm === 'baseline' ? 1 : 2}`, WUKONG_USER_TOKEN_SECRET: 'native-artifact-local-test-only',
      LINGXILOOP_INVITE_BASE_URL: 'http://127.0.0.1:24411', OPENAI_API_KEY: 'native-artifact-provider-disabled', OPENAI_BASE_URL: 'http://127.0.0.1:1', LINGXILOOP_DISABLE_EMBEDDINGS: '1' }
    if (arm === 'baseline' && !config.fidelity) {
      // The existing verified historical fixture executes the official 3.8.25
      // chain and product62 SQL. No candidate SDK is run as the old product.
      const code = "import {withFormal25TestFixture} from './server/scripts/formal19-test-fixture.mjs';import{execFile}from'node:child_process';import{promisify}from'node:util';await withFormal25TestFixture(process.cwd(),process.env,async(root,env)=>{await promisify(execFile)(process.execPath,['server/scripts/bootstrap-runtime-patch-test-db.mjs'],{cwd:root,env,timeout:900000,maxBuffer:2097152})})"
      await execute(config, 'bootstrap-baseline', process.execPath, ['--input-type=module', '-e', code], root, env)
      const verify = "import{assertMigrationsCurrent}from'./server/src/db/migrate.ts';import{pool}from'./server/src/db/pool.ts';try{await assertMigrationsCurrent()}finally{await pool.end()}"
      await execute(config, 'verify-frozen-baseline-database', process.execPath, ['--import', 'tsx', '--input-type=module', '-e', verify], config.baselineRoot, env)
    } else await execute(config, `bootstrap-${arm}`, process.execPath, ['server/scripts/bootstrap-runtime-patch-test-db.mjs'], arm === 'baseline' ? config.baselineRoot : root, env)
  }
}
async function measure(config) {
  assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: config.baselineRoot, encoding: 'utf8' }).trim(), config.baselineCommit)
  for (const name of ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GOOGLE_API_KEY', 'GEMINI_API_KEY']) assert.ok(!process.env[name], 'measurement cannot inherit model credentials')
  const tasks = []
  try {
    for (const [index, arm] of ['baseline', 'candidate'].entries()) {
      await checkpoint(config, `serve-${arm}`)
      const checkout = arm === 'baseline' ? config.baselineRoot : root
      const status = join(config.privateRoot, `${arm}-service-status.json`)
      const env = { ...process.env, DATABASE_URL: database(arm), REDIS_URL: `redis://127.0.0.1:26379/${index + 1}`, DOTENV_CONFIG_PATH: '/dev/null' }
      delete env.NODE_AUTH_TOKEN; delete env.GH_TOKEN; delete env.GITHUB_TOKEN
      const task = child(process.execPath, ['--import', 'tsx', join(root, 'scripts/native-artifact-serve.mjs'), `--root=${checkout}`, `--format=${arm === 'baseline' && !config.fidelity ? 'legacy' : 'native'}`, `--port=${24411 + index}`, `--api-port=${24811 + index}`, `--out=${join(config.privateRoot, `${arm}.json`)}`, `--status=${status}`], checkout, env, join(config.privateRoot, `${arm}-service.log`))
      tasks.push(task)
      const deadline = Date.now() + 600000
      while (true) {
        const state = await readFile(status, 'utf8').then(JSON.parse).catch(() => null)
        if (state?.phase === 'ready') break
        if (task.process.exitCode !== null || task.process.signalCode !== null) throw Object.assign(new Error('Actual product service failed'), { code: 'CHILD_FAILED' })
        if (Date.now() > deadline) throw Object.assign(new Error('Actual product service timed out'), { code: 'SERVICE_TIMEOUT' })
        await delay(500)
      }
    }
    await checkpoint(config, 'measurement')
    await delay(5000)
    const chromium = execFileSync('python', ['-c', 'from playwright.sync_api import sync_playwright\nwith sync_playwright() as p: print(p.chromium.executable_path)'], { encoding: 'utf8' }).trim()
    const arguments_ = [join(root, 'scripts/native-artifact-benchmark.py'), '--baseline', join(config.privateRoot, 'baseline.json'), '--candidate', join(config.privateRoot, 'candidate.json'), '--browser', chromium, '--out', join(config.privateRoot, 'measurement', 'report.json')]
    if (config.fidelity) arguments_.push('--fidelity')
    if (config.phase === 'diagnostic') arguments_.push('--diagnostic', '--keep-going')
    else arguments_.push('--runs', '10')
    await execute(config, 'measurement', 'python', arguments_)
  } finally { for (const task of tasks.reverse()) await stop(task) }
}
async function summarize(config) {
  await mkdir(config.publicRoot, { recursive: true })
  const report = await readFile(join(config.privateRoot, 'measurement/report.json'), 'utf8').then(JSON.parse).catch(() => null)
  const measurementFault=report?undefined:measurementFailure(await readFile(join(config.privateRoot,'measurement.log'),'utf8').catch(()=>''))
  const phase = await readFile(join(config.privateRoot, 'phase.json'), 'utf8').then(JSON.parse).catch(() => ({ phase: 'guard', status: 'failed' }))
  const servicePhases = {}
  for (const arm of ['baseline', 'candidate']) {
    const state = await readFile(join(config.privateRoot, `${arm}-service-status.json`), 'utf8').then(JSON.parse).catch(() => null)
    if (state && serviceStages.has(state.phase)) servicePhases[arm] = { phase: state.phase, fault:checkedServiceFailure(state.fault), ...(state.failed ? { code: codes.has(state.code) ? state.code : 'CHILD_FAILED' } : {}) }
  }
  const safe = { schemaVersion: 1, phase: config.phase, baselineCommit: config.baselineCommit,
    candidateCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    executionEnvironment: await executionEnvironment(config),
    checkpoint: { phase: phases.has(phase.phase) ? phase.phase : 'guard', status: phase.status === 'passed' ? 'passed' : 'failed', ...(phase.status === 'failed' ? { code: safeCode(phase) } : {}) },
    servicePhases, ...(measurementFault?{measurementFault}:{}), diagnosticPassed: report?.diagnosticPassed === true, qualified: config.phase === 'paired' && report?.qualified === true,
    ...(report ? { measurement: publicEvidence(report) } : {}) }
  await writeFile(join(config.publicRoot, 'results.json'), JSON.stringify(safe, null, 2) + '\n')
  // This is the same approved public projection, bounded to aggregate/sample
  // metrics so authorized log readers need no artifact download workaround.
  console.log('NATIVE_ARTIFACT_PUBLIC_RECEIPT ' + JSON.stringify(compactReceipt(safe)))
  // Only runner-created document screenshots. Never upload directory trees,
  // private arm state, TLS material, browser profiles, service logs or exports.
  for (const file of await readdir(join(config.privateRoot, 'measurement')).catch(() => [])) {
    if (/^(baseline|candidate)-(design|slides)-[a-zA-Z0-9_-]{1,80}\.png$/.test(file)) await copyFile(join(config.privateRoot, 'measurement', file), join(config.publicRoot, file))
  }
  const total = report?.samples?.length ?? 0, passed = report?.samples?.filter(sample => sample.status === 'passed').length ?? 0
  console.log(`::notice title=Native artifact acceptance::phase=${config.phase}; samples=${total}; passed=${passed}; diagnosticPassed=${safe.diagnosticPassed}; qualified=${safe.qualified}; checkpoint=${safe.checkpoint.phase}${safe.checkpoint.code ? `; code=${safe.checkpoint.code}` : ''}`)
  for (const [arm, stage] of Object.entries(servicePhases)) console.log(`::notice title=Native artifact service::arm=${arm}; phase=${stage.phase}${stage.code ? `; code=${stage.code}` : ''}; fault=${JSON.stringify(stage.fault)}`)
  if (measurementStages.has(report?.setupFailure?.failureStage) && failureCodes.has(report?.setupFailure?.failureCode)) console.log(`::notice title=Native artifact setup failed::phase=${report.setupFailure.failureStage}; code=${report.setupFailure.failureCode}`)
  for (const sample of report?.samples ?? []) {
    if (!['baseline', 'candidate'].includes(sample.arm) || !['design', 'slides'].includes(sample.kind) || !['fullNavigation', 'workbenchOpen'].includes(sample.mode)) continue
    const stage = measurementStages.has(sample.failureStage ?? sample.phase) ? sample.failureStage ?? sample.phase : 'validation'
    const code = failureCodes.has(sample.failureCode) ? sample.failureCode : 'browser_or_measurement_error'
    if (sample.status === 'failed') console.log(`::notice title=Native artifact sample failed::arm=${sample.arm}; kind=${sample.kind}; mode=${sample.mode}; phase=${stage}; code=${code}`)
  }
  if (process.env.GITHUB_STEP_SUMMARY) await writeFile(process.env.GITHUB_STEP_SUMMARY, `Native artifact ${config.phase}: ${passed}/${total} samples passed. Diagnostic passed: ${safe.diagnosticPassed}. Performance qualified: ${safe.qualified}.\n\nOnly allowlisted evidence is uploaded; credentials and raw logs are excluded.\n`)
}

async function main() {
  const config = configuration(), command = process.argv[2]
  if (command === 'summarize') return summarize(config)
  await checkpoint(config, command === 'measure' ? 'measurement' : command)
  try {
    if (command === 'guard') await verifyDiagnosticPrerequisite()
    else if (command === 'bootstrap') await bootstrap(config)
    else if (command === 'measure') await measure(config)
    else throw new Error('Unknown acceptance command')
    await checkpoint(config, command === 'measure' ? 'complete' : command, 'passed')
  } catch (error) {
    const current = JSON.parse(await readFile(join(config.privateRoot, 'phase.json'), 'utf8'))
    await checkpoint(config, current.phase, 'failed', safeCode(error))
    console.error(`::error title=Native artifact acceptance failed::phase=${current.phase}; code=${safeCode(error)}`)
    process.exitCode = 1
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
