// Read-only Komodo 2.3.3/public HTTP postflight. No Execute or Write API exists here.
// Run using Sigillo through lingxi-prod run; argv and reports never contain secrets.
import { open } from 'node:fs/promises'
import { isAbsolute, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { releaseVersions } from '@lyyzka/lingxios'

const KOMODO = 'https://ops.christmas1314.xyz'
const PUBLIC = 'https://loop.lingxilearn.cn'
const STACKS = [{ name: 'lingxiloop-app-a', server: 'shanghai-a' }, { name: 'lingxiloop-app-b', server: 'shanghai-b' }]
const SERVERS = ['manager', 'shanghai-a', 'shanghai-b']
const SERVICES = ['lingxiloop', 'worker']
const ACTIONS = ['pulling', 'deploying', 'starting', 'restarting', 'pausing', 'unpausing', 'stopping', 'destroying']
const READS = new Set(['ListServers', 'ListStacks', 'ListStackServices', 'GetStackActionState'])
const PUBLIC_PATHS = new Set(['/api/meta', '/api/health/dependencies', '/readyz', '/api/readyz'])
const RUNTIME = { name: '@lyyzka/lingxios', ...releaseVersions }
const imagePattern = /^(?:accel\.way2api\.fun\/)?ghcr\.io\/lingxi-org\/lingxiloop-server:([a-f0-9]{40})$/
const digestPattern = /^(?:accel\.way2api\.fun\/)?ghcr\.io\/lingxi-org\/lingxiloop-server(?::[a-f0-9]{40})?@sha256:[a-f0-9]{64}$/
const safeMatch = (value, pattern) => typeof value === 'string' && pattern.test(value) ? value : null
const objectId = value => safeMatch(value, /^[a-f0-9]{24}$/)
const enumValue = (value, allowed) => allowed.includes(value) ? value : null
const flag = value => typeof value === 'boolean' ? value : null
const actions = value => Object.fromEntries(ACTIONS.map(key => [key, flag(value?.[key])]))
const healthy = status => typeof status !== 'string' ? null
  : /\(healthy\)$/.test(status) ? 'healthy' : /\(unhealthy\)$/.test(status) ? 'unhealthy'
    : /\(health: starting\)$/.test(status) ? 'starting' : null

class ReadFailure extends Error {
  constructor(code, operation, httpStatus = null) {
    super(code)
    this.code = code
    this.operation = operation
    this.httpStatus = httpStatus
  }
}

// Do not return raw response/error objects to the report builder.
async function jsonResponse(response, operation) {
  const reader = response.body?.getReader()
  if (!reader) throw new ReadFailure('missing_response_body', operation)
  const chunks = []
  let length = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.length
      if (length > 2_000_000) {
        await reader.cancel()
        throw new ReadFailure('response_too_large', operation)
      }
      chunks.push(value)
    }
    return JSON.parse(Buffer.concat(chunks, length).toString('utf8'))
  } catch (error) {
    if (error instanceof ReadFailure) throw error
    throw new ReadFailure('invalid_json_response', operation)
  }
}

export async function verifyVisualizeProduction({ expectedSha, apiKey, apiSecret }) {
  if (!/^[a-f0-9]{40}$/.test(expectedSha ?? '')) throw new Error('A concrete lowercase 40-character --sha is required')
  if (!apiKey || !apiSecret) throw new Error('Sigillo-injected KOMODO_API_KEY and KOMODO_API_SECRET are required')
  const report = { status: 'pending', readOnly: true, expectedSha, startedAt: new Date().toISOString(),
    komodoApiVersion: '2.3.3', komodoOrigin: KOMODO, publicOrigin: PUBLIC, expectedRuntime: RUNTIME,
    observations: [], failedChecks: [],
    limitations: {
      containerStatus: 'Komodo ListStackServices status cache; no direct container inspection or per-replica HTTP probe',
      digest: 'Docker image ID and Komodo reported image_digests are separate fields; registry manifest digest is not independently resolved',
      sql: 'Not checked: release owner must separately verify schema 46, original 0033 tables and four Visualize tables using read-only SQL',
      scope: 'No deployment, backup, authenticated user workflow or soak operation; bounded observations are not a future availability guarantee',
    } }
  const check = (condition, label) => { if (!condition) report.failedChecks.push(label) }
  async function read(operation, body) {
    if (!READS.has(operation)) throw new ReadFailure('operation_not_allowlisted', 'local')
    let response
    try {
      response = await fetch(`${KOMODO}/read/${operation}`, { method: 'POST', redirect: 'error',
        headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'x-api-secret': apiSecret },
        body: JSON.stringify(body), signal: AbortSignal.timeout(35_000) })
    } catch { throw new ReadFailure('transport_failed', operation) }
    if (!response.ok) {
      await response.body?.cancel()
      throw new ReadFailure('http_failed', operation, response.status)
    }
    return jsonResponse(response, operation)
  }
  async function publicGet(path, statusOnly = false) {
    if (!PUBLIC_PATHS.has(path)) throw new ReadFailure('operation_not_allowlisted', 'local')
    let response
    try {
      response = await fetch(`${PUBLIC}${path}`, { method: 'GET', redirect: 'error', cache: 'no-store',
        headers: { accept: 'application/json', 'cache-control': 'no-cache' }, signal: AbortSignal.timeout(45_000) })
    } catch { throw new ReadFailure('transport_failed', path) }
    if (!response.ok || statusOnly) {
      await response.body?.cancel()
      return { httpStatus: response.status, body: null }
    }
    return { httpStatus: response.status, body: await jsonResponse(response, path) }
  }
  async function observe(index) {
    const prefix = `observation-${index}`
    const startedAt = new Date().toISOString()
    const before = await Promise.all(STACKS.map(({ name }) => read('GetStackActionState', { stack: name })))
    const [serverRows, stackRows, ...serviceRows] = await Promise.all([
      read('ListServers', { query: {}, limit: 0 }), read('ListStacks', { query: {}, limit: 0 }),
      ...STACKS.map(({ name }) => read('ListStackServices', { stack: name })),
    ])
    if (!Array.isArray(serverRows) || !Array.isArray(stackRows) || serviceRows.some(rows => !Array.isArray(rows))) {
      throw new ReadFailure('unexpected_inventory_shape', 'inventory')
    }
    const after = await Promise.all(STACKS.map(({ name }) => read('GetStackActionState', { stack: name })))
    const servers = SERVERS.map(name => {
      const matches = serverRows.filter(row => row?.name === name)
      check(matches.length === 1, `${prefix}:${name}:unique-server`)
      const source = matches.length === 1 ? matches[0] : null
      const result = { name, id: objectId(source?.id), state: enumValue(source?.info?.state, ['Ok', 'NotOk', 'Disabled']) }
      check(result.id && result.state === 'Ok', `${prefix}:${name}:server-healthy`)
      return result
    })
    const stacks = STACKS.map(({ name, server }, stackIndex) => {
      const matches = stackRows.filter(row => row?.name === name)
      check(matches.length === 1, `${prefix}:${name}:unique-stack`)
      const source = matches.length === 1 ? matches[0] : null
      const result = { name, id: objectId(source?.id), server,
        serverId: objectId(source?.info?.server_id),
        state: enumValue(source?.info?.state, ['deploying', 'running', 'paused', 'stopped', 'created', 'restarting', 'dead', 'removing', 'unhealthy', 'down', 'unknown']),
        actionsBefore: actions(before[stackIndex]), actionsAfter: actions(after[stackIndex]), services: [] }
      check(result.id && result.state === 'running', `${prefix}:${name}:stack-running`)
      check(result.serverId && result.serverId === servers.find(row => row.name === server)?.id
        && source?.info?.server_name === server, `${prefix}:${name}:expected-server`)
      check(source?.info?.project_missing === false && Array.isArray(source?.info?.missing_files)
        && source.info.missing_files.length === 0, `${prefix}:${name}:compose-present`)
      check(ACTIONS.every(key => result.actionsBefore[key] === false && result.actionsAfter[key] === false), `${prefix}:${name}:actions-idle`)
      result.services = SERVICES.map(service => {
        const found = serviceRows[stackIndex].filter(row => row?.service === service)
        check(found.length === 1, `${prefix}:${name}:${service}:unique-service`)
        const value = found.length === 1 ? found[0] : null
        const rawDigests = value?.image_digests
        const reportedImageDigests = Array.isArray(rawDigests)
          ? rawDigests.map(digest => safeMatch(digest, digestPattern)).filter(Boolean).sort() : []
        const record = { service, state: enumValue(value?.state, ['Healthy', 'Unhealthy', 'Down', 'Running', 'Created', 'Paused', 'Restarting', 'Exited', 'Stopping', 'Removing', 'Dead', 'Unknown']),
          image: safeMatch(value?.image, imagePattern), reportedImageDigests,
          container: { id: safeMatch(value?.container?.id, /^[a-f0-9]{64}$/),
            image: safeMatch(value?.container?.image, imagePattern), imageId: safeMatch(value?.container?.image_id, /^sha256:[a-f0-9]{64}$/),
            state: enumValue(value?.container?.state, ['running', 'created', 'restarting', 'stopping', 'removing', 'paused', 'exited', 'dead']),
            health: healthy(value?.container?.status) } }
        check(value?.stack_id === result.id && value?.stack_name === name, `${prefix}:${name}:${service}:stack-binding`)
        check(record.state === 'Running' && record.container.state === 'running' && record.container.health === 'healthy', `${prefix}:${name}:${service}:healthy`)
        check(record.image?.match(imagePattern)?.[1] === expectedSha && record.container.image?.match(imagePattern)?.[1] === expectedSha,
          `${prefix}:${name}:${service}:immutable-tag`)
        check(record.container.id && record.container.imageId && reportedImageDigests.length > 0
          && reportedImageDigests.length === rawDigests?.length, `${prefix}:${name}:${service}:digest-evidence`)
        return record
      })
      return result
    })
    const all = stacks.flatMap(stack => stack.services)
    check(new Set(all.map(row => row.container.id)).size === 4, `${prefix}:four-distinct-containers`)
    check(new Set(all.map(row => row.container.imageId)).size === 1, `${prefix}:matching-image-ids`)
    const digestSets = all.map(row => JSON.stringify([...new Set(row.reportedImageDigests.map(value => value.split('@')[1]))].sort()))
    check(new Set(digestSets).size === 1, `${prefix}:matching-reported-digests`)
    const [metaResult, dependenciesResult, readinessResult, protectedResult] = await Promise.all([
      publicGet('/api/meta'), publicGet('/api/health/dependencies'), publicGet('/readyz'), publicGet('/api/readyz', true),
    ])
    const rawMeta = metaResult.body
    const meta = { httpStatus: metaResult.httpStatus, product: enumValue(rawMeta?.product, ['LingxiLoop']),
      version: safeMatch(rawMeta?.version, /^\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]+)?$/),
      commitSha: safeMatch(rawMeta?.commitSha, /^[a-f0-9]{40}$/),
      reasoningRuntime: Object.fromEntries(Object.keys(RUNTIME).map(key => [key,
        key === 'name' ? enumValue(rawMeta?.reasoningRuntime?.[key], [RUNTIME.name])
          : key === 'runtime' ? safeMatch(rawMeta?.reasoningRuntime?.[key], /^\d+\.\d+\.\d+$/)
            : Number.isSafeInteger(rawMeta?.reasoningRuntime?.[key]) ? rawMeta.reasoningRuntime[key] : null])) }
    const healthResult = (result, keys) => ({ httpStatus: result.httpStatus, ok: flag(result.body?.ok),
      dependencies: Object.fromEntries(keys.map(key => [key, flag(result.body?.dependencies?.[key])])) })
    const dependencies = healthResult(dependenciesResult, ['database', 'redis', 'openNotebook'])
    const ready = { path: '/readyz', ...healthResult(readinessResult, ['database', 'redis', 'control']) }
    const protectedApiReady = { path: '/api/readyz', httpStatus: protectedResult.httpStatus,
      authenticationRequired: protectedResult.httpStatus === 401, countsAsReadiness: false }
    check(meta.httpStatus === 200 && meta.product === 'LingxiLoop' && meta.commitSha === expectedSha, `${prefix}:public-meta-sha`)
    check(Object.entries(RUNTIME).every(([key, value]) => meta.reasoningRuntime[key] === value), `${prefix}:public-runtime`)
    for (const [label, health] of [['dependencies', dependencies], ['readyz', ready]]) {
      check(health.httpStatus === 200 && health.ok === true && Object.values(health.dependencies).every(value => value === true), `${prefix}:public-${label}`)
    }
    return { startedAt, completedAt: new Date().toISOString(), servers, stacks, publicHttp: { meta, dependencies, ready, protectedApiReady } }
  }
  try {
    for (const index of [1, 2]) report.observations.push(await observe(index))
    const identity = observation => observation.stacks.map(stack => ({ id: stack.id, serverId: stack.serverId,
      services: stack.services.map(service => ({ service: service.service, image: service.image,
        containerId: service.container.id, imageId: service.container.imageId, reportedImageDigests: service.reportedImageDigests })) }))
    check(JSON.stringify(identity(report.observations[0])) === JSON.stringify(identity(report.observations[1])), 'stable-service-identity-across-observations')
    report.status = report.failedChecks.length ? 'failed' : 'passed'
  } catch (error) {
    report.status = 'failed'
    report.failure = error instanceof ReadFailure
      ? { code: error.code, operation: error.operation, httpStatus: error.httpStatus }
      : { code: 'verification_failed', operation: 'local', httpStatus: null }
  }
  report.completedAt = new Date().toISOString()
  return report
}

async function main() {
  const args = process.argv.slice(2)
  if (args.length === 1 && args[0] === '--help') {
    console.log('Read-only: lingxi-prod run node --use-env-proxy /absolute/scripts/verify-visualize-production.mjs --sha <40-hex> --output <new-absolute-evidence.json>')
    return
  }
  const options = {}
  for (let index = 0; index < args.length; index += 2) {
    if (!['--sha', '--output'].includes(args[index]) || !args[index + 1] || options[args[index]]) throw new Error('Use --sha <40-hex> and --output <new-absolute-path>')
    options[args[index]] = args[index + 1]
  }
  const expectedSha = options['--sha'], output = options['--output']
  if (!/^[a-f0-9]{40}$/.test(expectedSha ?? '') || !output || !isAbsolute(output)) throw new Error('A concrete SHA and absolute evidence output path are required')
  const apiKey = process.env.KOMODO_API_KEY, apiSecret = process.env.KOMODO_API_SECRET
  if (!apiKey || !apiSecret) throw new Error('Sigillo-injected KOMODO_API_KEY and KOMODO_API_SECRET are required')
  const file = await open(output, 'wx', 0o600)
  async function persist(value) {
    const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`)
    for (let offset = 0; offset < bytes.length;) {
      const { bytesWritten } = await file.write(bytes, offset, bytes.length - offset, offset)
      if (!bytesWritten) throw new Error('Unable to write sanitized evidence')
      offset += bytesWritten
    }
    await file.truncate(bytes.length)
    await file.sync()
  }
  try {
    await persist({ status: 'pending', readOnly: true, expectedSha })
    const result = await verifyVisualizeProduction({ expectedSha, apiKey, apiSecret })
    await persist(result)
    console.log(JSON.stringify(result))
    if (result.status !== 'passed') process.exitCode = 1
  } finally { await file.close() }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    // Local OS errors may include paths; transport errors may contain request data.
    // Neither their object nor their arbitrary message is allowed in output.
    const allowed = new Set(['Use --sha <40-hex> and --output <new-absolute-path>',
      'A concrete SHA and absolute evidence output path are required',
      'Sigillo-injected KOMODO_API_KEY and KOMODO_API_SECRET are required', 'Unable to write sanitized evidence'])
    console.error(allowed.has(error?.message) ? error.message : 'Postflight preparation or evidence write failed; no mutation was requested')
    process.exitCode = 1
  })
}
