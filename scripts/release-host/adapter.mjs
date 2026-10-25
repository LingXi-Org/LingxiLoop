import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile, mkdir, writeFile, rename, open } from 'node:fs/promises'
import { join, isAbsolute } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { canonical, fault, hash, identifier } from './journal.mjs'

const exec = promisify(execFile)
const digest = value => /^sha256:[a-f0-9]{64}$/.test(value ?? '')
const adapters = new Set(['main-runtime','open-notebook','wukongim'])
const roles = new Set(['web','worker','component'])
export async function runDocker(args, { timeout = 120000, binary = '/usr/bin/docker' } = {}) {
  try {
    // Never inherit DOCKER_HOST, COMPOSE_FILE, product secrets or proxy overrides from the request/process.
    const { stdout } = await exec(binary, args, { encoding: 'utf8', timeout, killSignal: 'SIGKILL', maxBuffer: 2 * 1024 * 1024,
      env: { PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', HOME: '/var/lib/lingxi-release', DOCKER_CONFIG: '/etc/lingxi-release/docker' } })
    return stdout
  } catch (error) {
    // Docker may have changed daemon state before a nonzero exit, timeout or disconnected CLI.
    const sqlState = error.stderr?.match(/ERROR:\s+([A-Z0-9]{5})(?:\s|$)/)?.[1]
    throw Object.assign(fault('DOCKER_COMMAND_FAILED', 'Fixed Docker operation failed; restricted host logs contain diagnostics', 502), { uncertain: true, cause: error,...(sqlState ? { sqlState } : {}) })
  }
}
export async function runFixedHelper(argv, body, timeout = 30000) {
  return new Promise((resolve,reject) => {
    const child = spawn(argv[0],argv.slice(1),{ shell:false,env:{ PATH:'/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin' },stdio:['pipe','pipe','ignore'] })
    let output = '', settled = false
    const fail = () => { if (!settled) { settled = true; reject(fault('HELPER_FAILED','Trusted local control helper failed or exceeded its bounded output/time',502)) } }
    const timer = setTimeout(() => { child.kill('SIGKILL'); fail() },timeout)
    child.once('error',() => { clearTimeout(timer); fail() })
    child.stdout.on('data',chunk => { output += chunk; if (output.length > 1024 * 1024) { child.kill('SIGKILL'); fail() } })
    child.once('close',code => { clearTimeout(timer); if (settled) return; if (code !== 0) { try { const parsed = JSON.parse(output); if (parsed.error?.code) { settled = true; reject(Object.assign(fault(parsed.error.code,parsed.error.message ?? 'Trusted local helper rejected the operation',502),{ sqlState:parsed.error.sqlState })); return } } catch {} return fail() } try { const value = JSON.parse(output); settled = true; resolve(value) } catch { fail() } })
    child.stdin.on('error',() => {})
    child.stdin.end(canonical(body))
  })
}
function requireValue(condition, code, message) { if (!condition) throw fault(code, message, 422) }
export function validateContract(contract) {
  requireValue(contract && Number.isSafeInteger(contract.nativeSchema) && Number.isSafeInteger(contract.productSchema) &&
    ['api','worker','checkpoint','control'].every(key => typeof contract[key] === 'string' && contract[key].length > 0 && contract[key].length < 128) &&
    Array.isArray(contract.capabilities) && contract.capabilities.every(identifier), 'INVALID_CONTRACT', 'Exact schema, protocol and capability contract is required')
  for (const key of ['supportedNativeSchemas','supportedProductSchemas']) if (contract[key] !== undefined) {
    requireValue(Array.isArray(contract[key]) && contract[key].length > 0 && contract[key].every(Number.isSafeInteger), 'INVALID_CONTRACT', 'Schema support must be an explicit integer set')
  }
}
export function assertCompatible(contract, actual) {
  validateContract(contract)
  requireValue(actual?.verified === true && Array.isArray(actual.requiredCapabilities), 'STATE_UNVERIFIED', 'Independent installed-state and capability evidence is required')
  const native = contract.supportedNativeSchemas ?? [contract.nativeSchema], product = contract.supportedProductSchemas ?? [contract.productSchema]
  requireValue(native.includes(actual.nativeSchema) && product.includes(actual.productSchema), 'INCOMPATIBLE_SCHEMA', 'Artifact does not support the installed native/product schemas')
  requireValue(actual.requiredCapabilities.every(capability => contract.capabilities.includes(capability)), 'INCOMPATIBLE_CAPABILITY', 'Artifact lacks a capability required by installed data semantics')
  requireValue(['api','worker','checkpoint','control'].every(key => contract[key] === actual[key]), 'INCOMPATIBLE_PROTOCOL', 'Artifact does not support the active runtime protocols')
}
export function validateImage(image) {
  requireValue(image && /^(?:ghcr\.io|docker\.io)\/[a-z0-9][a-z0-9/._-]*@sha256:[a-f0-9]{64}$/.test(image.ref ?? '') &&
    [image.indexDigest,image.platformDigest,image.configDigest].every(digest) && image.ref.endsWith(`@${image.indexDigest}`) &&
    image.os === 'linux' && ['amd64','arm64'].includes(image.architecture) && Array.isArray(image.diffIds) && image.diffIds.length > 0 && image.diffIds.every(digest),
  'INVALID_IMAGE', 'Canonical immutable image index, platform, config and layers are required')
}
function normalizeRepository(ref) { return ref.replace(/^docker\.io\/(?:library\/)?/,'').replace(/^library\//,'') }
export function assertImageIdentity(actual, expected) {
  validateImage(expected)
  requireValue(actual?.Id === expected.configDigest && actual.Os === expected.os && actual.Architecture === expected.architecture &&
    actual.RepoDigests?.some(ref => normalizeRepository(ref) === normalizeRepository(expected.ref) || normalizeRepository(ref) === normalizeRepository(expected.ref.replace(expected.indexDigest,expected.platformDigest))) && actual.RootFS?.Type === 'layers' && isDeepStrictEqual(actual.RootFS.Layers, expected.diffIds) &&
    (!actual.Descriptor || [expected.indexDigest,expected.platformDigest].includes(actual.Descriptor.digest)),
  'IMAGE_IDENTITY_MISMATCH', 'Cached image index/platform/config/layer identity does not match the qualified artifact')
  return actual.Id
}
export function validatePolicy(policy) {
  requireValue(policy?.version === 1 && isAbsolute(policy.stateDirectory) && policy.targets && typeof policy.targets === 'object', 'INVALID_POLICY', 'Trusted local policy is invalid')
  requireValue(Array.isArray(policy.acceptedOpsShas) && policy.acceptedOpsShas.length > 0 && policy.acceptedOpsShas.every(value => /^[a-f0-9]{40}$/.test(value)), 'INVALID_POLICY', 'The actual installed executor operation commit allowlist is required')
  if (policy.dockerBinary) requireValue(isAbsolute(policy.dockerBinary), 'INVALID_POLICY', 'Docker executable must be an absolute trusted local path')
  for (const [target, value] of Object.entries(policy.targets)) {
    requireValue(identifier(target) && adapters.has(value.adapter) && identifier(value.project) && isAbsolute(value.composeFile) && isAbsolute(value.envFile) &&
      value.services && Object.keys(value.services).length > 0, 'INVALID_POLICY', 'Target must name a fixed Compose project, file, environment and services')
    for (const [service, spec] of Object.entries(value.services)) requireValue(identifier(service) && roles.has(spec.role) && Array.isArray(spec.mounts), 'INVALID_POLICY', 'Service role and explicit durable mounts are required')
    for (const endpoint of Object.values(value.controls ?? {})) {
      if (endpoint.argv) {
        requireValue(Array.isArray(endpoint.argv) && endpoint.argv.length > 1 && endpoint.argv.every(item => typeof item === 'string') && isAbsolute(endpoint.argv[0]) && !endpoint.argv.some(item => ['-e','-c','--eval','--command'].includes(item)) && !/\/(?:ba|da|z)?sh$/.test(endpoint.argv[0]), 'INVALID_POLICY', 'Helper must be a fixed local executable argv without inline shell/code')
        continue
      }
      const url = new URL(endpoint.url)
      requireValue(['https:','http:'].includes(url.protocol) && !url.username && !url.password && (url.protocol === 'https:' || ['127.0.0.1','[::1]','localhost'].includes(url.hostname)), 'INVALID_POLICY', 'Controls require HTTPS or loopback HTTP')
      for (const key of ['tokenFile','accessClientIdFile','accessClientSecretFile']) if (endpoint[key]) requireValue(isAbsolute(endpoint[key]), 'INVALID_POLICY', 'Secret reference must be an absolute local path')
    }
  }
  return policy
}
export function validateHostPlan(manifest, target, policy) {
  const descriptor = manifest.targets?.[target], plan = descriptor?.hostPlan, local = policy.targets[target]
  requireValue(local && descriptor.adapter === local.adapter && plan?.version === 1 && ['rolling','maintenance'].includes(plan.mode), 'INVALID_HOST_PLAN', 'Registered target has no supported fixed host plan')
  if (plan.mode === 'rolling') requireValue(local.qualifiedRollingContracts?.includes(hash(plan.contract)), 'ROLLING_UNQUALIFIED', 'Rolling updates require a locally qualified concrete runtime contract')
  requireValue(isDeepStrictEqual(Object.keys(plan.images ?? {}).sort(), Object.keys(local.services).sort()), 'INVALID_HOST_PLAN', 'Plan must identify exactly the locally permitted services')
  validateContract(plan.contract)
  requireValue(isDeepStrictEqual(descriptor.contract, plan.contract), 'INVALID_HOST_PLAN', 'Public and host runtime contracts differ')
  for (const image of Object.values(plan.images)) validateImage(image)
  requireValue(plan.recovery && isDeepStrictEqual(Object.keys(plan.recovery.images ?? {}).sort(), Object.keys(local.services).sort()), 'RECOVERY_REQUIRED', 'All recovery images must be prepared before switching')
  validateContract(plan.recovery.contract)
  for (const image of Object.values(plan.recovery.images)) validateImage(image)
  requireValue(typeof plan.configurationHash === 'string' && /^sha256:[a-f0-9]{64}$/.test(plan.configurationHash) &&
    /^sha256:[a-f0-9]{64}$/.test(plan.recovery.configurationHash ?? ''), 'CONFIGURATION_REQUIRED', 'Forward and recovery configuration fingerprints are required')
  if (plan.source) {
    requireValue(isDeepStrictEqual(Object.keys(plan.source.images ?? {}).sort(),Object.keys(local.services).sort()) && /^sha256:[a-f0-9]{64}$/.test(plan.source.configurationHash ?? ''),'INVALID_HOST_PLAN','Source must identify exactly the original service images/configuration')
    validateContract(plan.source.contract)
    for (const image of Object.values(plan.source.images)) validateImage(image)
  }
  if (plan.database) {
    requireValue(plan.source, 'SOURCE_REQUIRED', 'Schema-changing plans must distinguish the actual source from compatible recovery')
    const db = plan.database
    requireValue(plan.mode === 'maintenance' && db.strategy === 'maintenance' && db.rpo === 'zero-committed-writes' && [db.from?.nativeSchema,db.from?.productSchema,db.to?.nativeSchema,db.to?.productSchema].every(Number.isSafeInteger) && Array.isArray(db.migrations) && db.migrations.length === db.to.productSchema && db.migrations.every((item,index) => item.version === index + 1 && /^[a-f0-9]{64}$/.test(item.checksum)), 'INVALID_DATABASE_PLAN', 'Database plan requires maintenance, zero-write-loss and a complete ordered checksum inventory')
    requireValue(db.to.nativeSchema === plan.contract.nativeSchema && db.to.productSchema === plan.contract.productSchema, 'INVALID_DATABASE_PLAN', 'Database target schema must equal the target artifact contract')
  }
  // Repo source mode must be explicitly implemented and qualified; never guess a Notebook mode.
  requireValue(!plan.sourceMode || plan.sourceMode === 'image', 'UNSUPPORTED_SOURCE_MODE', 'This adapter accepts image source mode only')
  return plan
}

/** Order-independent only for documented sets. Commands, entrypoints and other arrays keep order. */
export function configurationFingerprint(config, local) {
  const selected = { name: config.name, services: {}, volumes: config.volumes ?? {} }
  for (const service of Object.keys(local.services).sort()) {
    const spec = structuredClone(config.services?.[service])
    requireValue(spec && !spec.build && !spec.privileged && !spec.use_api_socket, 'UNSAFE_COMPOSE', 'Builds, privileged containers and Docker API sockets are not permitted')
    delete spec.image; delete spec.pull_policy
    for (const key of ['ports','volumes','networks','depends_on']) if (Array.isArray(spec[key])) spec[key] = [...spec[key]].sort((a,b) => canonical(a).localeCompare(canonical(b)))
    selected.services[service] = spec
  }
  // Hash can include secrets resolved by Compose. Only its digest leaves this process.
  return hash(selected)
}

async function atomicJson(path, data) {
  const temporary = `${path}.${process.pid}.tmp`, file = await open(temporary, 'w', 0o600)
  try { await file.writeFile(canonical(data)); await file.sync() } finally { await file.close() }
  await rename(temporary, path)
  const directory = await open(join(path, '..'), 'r'); try { await directory.sync() } finally { await directory.close() }
}

export class ComposeAdapter {
  constructor(policy, { run, fetcher = fetch, wait = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
    this.policy = validatePolicy(policy); this.run = run ?? ((args,options = {}) => runDocker(args,{ ...options,binary:policy.dockerBinary ?? '/usr/bin/docker' })); this.fetcher = fetcher; this.wait = wait
  }
  resources(target, phase) {
    const local = this.policy.targets[target]
    requireValue(local, 'UNKNOWN_TARGET', 'Target is not enabled in trusted local policy')
    if (phase === 'prepare') return [`preparation:${target}`]
    const resources = Object.keys(local.services).map(service => `compose:${local.project}:${service}`)
    if (['backup','restore-verify','migrate'].includes(phase)) {
      requireValue(local.databaseOwner === true, 'DATABASE_OWNER_REQUIRED', 'Only the locally designated database owner may execute database phases')
      resources.push('database:main')
    }
    return resources.sort()
  }
  async control(local, action, body, method = 'POST') {
    const endpoint = local.controls?.[action]
    requireValue(endpoint, 'CONTROL_NOT_CONFIGURED', `Independent ${action} control endpoint is required`)
    if (endpoint.argv) {
      try { return await runFixedHelper(endpoint.argv,body,endpoint.timeoutMs ?? 30000) }
      catch (error) { error.uncertain = method !== 'GET'; throw error }
    }
    const headers = { 'content-type': 'application/json' }
    if (endpoint.tokenFile) headers.authorization = `Bearer ${(await readFile(endpoint.tokenFile, 'utf8')).trim()}`
    if (endpoint.accessClientIdFile) headers['CF-Access-Client-Id'] = (await readFile(endpoint.accessClientIdFile,'utf8')).trim()
    if (endpoint.accessClientSecretFile) headers['CF-Access-Client-Secret'] = (await readFile(endpoint.accessClientSecretFile,'utf8')).trim()
    let response
    try { response = await this.fetcher(endpoint.url, { method, headers, ...(method === 'GET' ? {} : { body: canonical(body) }), signal: AbortSignal.timeout(endpoint.timeoutMs ?? 10000), redirect: 'error' }) }
    catch { throw Object.assign(fault('CONTROL_UNAVAILABLE', `Independent ${action} control is unavailable`, 502), { uncertain: method !== 'GET' }) }
    if (!response.ok) throw Object.assign(fault('CONTROL_REJECTED', `Independent ${action} control rejected the operation`, 502), { uncertain: method !== 'GET' })
    try { return await response.json() } catch { throw Object.assign(fault('CONTROL_INVALID_RESPONSE', `Independent ${action} control returned invalid evidence`, 502), { uncertain: method !== 'GET' }) }
  }
  async composeArgs(op, direction) {
    const local = this.policy.targets[op.target]
    const path = join(this.policy.stateDirectory, op.releaseId, `${op.target}-${direction}.json`)
    return ['compose','--project-name',local.project,'--env-file',local.envFile,'--file',local.composeFile,'--file',path]
  }
  async overlay(op, images, direction) {
    const directory = join(this.policy.stateDirectory, op.releaseId)
    await mkdir(directory, { recursive: true, mode: 0o700 })
    const services = Object.fromEntries(Object.entries(images).map(([service,image]) => [service, { image: image.ref, pull_policy: 'never' }]))
    const migration = this.policy.targets[op.target].migration
    if (migration) services[migration.service] = { image:images[migration.imageService].ref,pull_policy:'never',restart:'no' }
    await atomicJson(join(directory, `${op.target}-${direction}.json`), { services })
  }
  async inspectImage(image) {
    let rows
    try { rows = JSON.parse(await this.run(['image','inspect',image.ref])) } catch (error) {
      // Only an explicit "not found" result permits a pull. An unknown Docker error is not a cache miss.
      if (error.code === 'IMAGE_NOT_FOUND' || error.cause?.code === 1 && /No such image/.test(error.cause.stderr ?? '')) return null
      throw error
    }
    assertImageIdentity(rows[0], image)
    return rows[0].Id
  }
  async prepare(op, plan, context) {
    const local = this.policy.targets[op.target]
    const source = plan.source ?? plan.recovery, original = await this.containers(op)
    requireValue(Object.entries(original).every(([service,container]) => container.Image === source.images[service].configDigest), 'SOURCE_IMAGE_CHANGED', 'Actual source containers do not match the qualified recovery identity')
    await this.overlay(op,source.images,'source')
    this.validateConfig(JSON.parse(await this.run([...(await this.composeArgs(op,'source')),'config','--format','json'])),local,source)
    const prepared = []
    for (const [direction, descriptor] of [['forward',plan],['recovery',plan.recovery]]) {
      for (const image of Object.values(descriptor.images)) {
        if (!await this.inspectImage(image)) {
          await context.step(`pull:${direction}:${image.configDigest}`, () => this.run(['image','pull','--platform',`${image.os}/${image.architecture}`,image.ref]), { sideEffect: false })
          requireValue(await this.inspectImage(image), 'IMAGE_MISSING', 'Pulled artifact is not present after download')
          prepared.push({ imageId: image.configDigest, reused: false })
        } else prepared.push({ imageId: image.configDigest, reused: true })
      }
      await this.overlay(op, descriptor.images, direction)
      const config = JSON.parse(await this.run([...(await this.composeArgs(op,direction)),'config','--format','json']))
      this.validateConfig(config, local, descriptor)
    }
    return { prepared, offlineReady: true }
  }
  validateConfig(config, local, descriptor) {
    requireValue(config.name === local.project, 'PROJECT_CHANGED', 'Compose project identity changed')
    requireValue(configurationFingerprint(config, local) === descriptor.configurationHash, 'CONFIGURATION_MISMATCH', 'Effective configuration does not match the qualified policy')
    for (const [service, spec] of Object.entries(local.services)) {
      const serviceConfig = config.services[service]
      requireValue(serviceConfig.image === descriptor.images[service].ref && serviceConfig.pull_policy === 'never', 'IMAGE_POLICY_CHANGED', 'Compose image/pull policy differs from exact prepared artifact')
      for (const mount of spec.mounts) {
        const actual = serviceConfig.volumes?.find(item => item.target === mount.target)
        const source = actual?.type === 'volume' ? config.volumes?.[actual.source]?.name : actual?.source
        requireValue(actual?.type === mount.type && source === mount.source && Boolean(actual.read_only) === Boolean(mount.readOnly), 'VOLUME_BINDING_CHANGED', 'Durable volume binding differs from the original trusted binding')
      }
      requireValue(!(serviceConfig.volumes ?? []).some(mount => mount.target === '/var/run/docker.sock'), 'UNSAFE_COMPOSE', 'Business containers may not mount the Docker socket')
    }
  }
  async containers(op) {
    const local = this.policy.targets[op.target], result = {}
    for (const service of Object.keys(local.services)) {
      const ids = (await this.run(['ps','--all','--quiet','--filter',`label=com.docker.compose.project=${local.project}`,'--filter',`label=com.docker.compose.service=${service}`])).trim().split(/\s+/).filter(Boolean)
      requireValue(ids.length === 1 && /^[a-f0-9]{12,64}$/.test(ids[0]), 'CONTAINER_INVENTORY_UNCERTAIN', 'Expected exactly one container per local service')
      const [container] = JSON.parse(await this.run(['container','inspect',ids[0]]))
      result[service] = container
      for (const mount of local.services[service].mounts) {
        const actual = container.Mounts?.find(item => item.Destination === mount.target)
        requireValue(actual?.Type === mount.type && (actual.Type === 'volume' ? actual.Name : actual.Source) === mount.source && actual.RW === !mount.readOnly,
          'VOLUME_BINDING_CHANGED', 'Running service no longer binds the original durable volume')
      }
    }
    return result
  }
  async state(op) { return this.control(this.policy.targets[op.target], 'state', op, 'GET') }
  async barrier(op) {
    const evidence = await this.control(this.policy.targets[op.target], 'barrier', op, 'GET')
    return evidence?.fullVisibility === true && evidence.drained === true && ['liveWork','liveSession','liveAttempts','liveCapture','liveOutbox','prepared'].every(key => evidence[key] === 0)
  }
  async drain(op, plan, context) {
    const local = this.policy.targets[op.target]
    if (plan.mode === 'maintenance') {
      // SIGTERM follows the installed Worker's bounded shutdown/checkpoint contract.
      // Keep local Web/control alive until its dependent Worker has stopped.
      for (const [service,spec] of Object.entries(local.services)) if (spec.role === 'worker') {
        await context.step(`stop:${service}`, () => this.run([...context.compose,'stop','--timeout',String(this.policy.stopTimeoutSeconds ?? 150),service]), { sideEffect:true })
      }
      await context.step('ingress-disable', () => this.control(local,'ingress',{ ...op,enabled:false }), { sideEffect:true })
      const ingress = await this.control(local,'ingressState',op,'GET')
      requireValue(ingress.enabled === false && ingress.generation === op.generation, 'INGRESS_UNPROVEN', 'Stable ingress must confirm backend removal')
      for (const [service,spec] of Object.entries(local.services)) if (spec.role !== 'worker') {
        await context.step(`stop:${service}`, () => this.run([...context.compose,'stop','--timeout',String(this.policy.stopTimeoutSeconds ?? 150),service]), { sideEffect:true })
      }
      const containers = await this.containers(op)
      requireValue(Object.values(containers).every(container => !container.State.Running && container.State.Pid === 0), 'WRITER_NOT_STOPPED', 'Local writer shutdown is not proven')
      const deadline = Date.now() + Math.min(this.policy.drainTimeoutMs ?? 120000,900000)
      while (!await this.barrier(op)) {
        if (Date.now() >= deadline) throw fault('DRAIN_TIMEOUT','Maintenance writers stopped but live leases remain; task state is preserved')
        await this.wait(this.policy.pollIntervalMs ?? 1000)
      }
      return { drained:true,ingress:false,mode:'maintenance' }
    }
    const evidence = await context.step('worker-admission-drain', () => this.control(local,'drain',{ ...op, mode: plan.mode }), { sideEffect: true })
    requireValue(evidence?.admissionClosed === true && (plan.mode === 'rolling' || evidence.writesStopped === true), 'DRAIN_UNPROVEN', 'Admission or maintenance write barrier is not proven')
    const deadline = Date.now() + Math.min(this.policy.drainTimeoutMs ?? 120000, 900000)
    while (!await this.barrier(op)) {
      if (Date.now() >= deadline) throw fault('DRAIN_TIMEOUT', 'Task/lease/checkpoint barrier did not drain within the fixed budget')
      await this.wait(this.policy.pollIntervalMs ?? 1000)
    }
    await context.step('ingress-disable', () => this.control(local,'ingress',{ ...op, enabled: false }), { sideEffect: true })
    const ingress = await this.control(local,'ingressState',op,'GET')
    requireValue(ingress.enabled === false && ingress.generation === op.generation, 'INGRESS_UNPROVEN', 'Stable ingress has not confirmed backend removal')
    for (const [service, spec] of Object.entries(local.services)) if (spec.role === 'worker') {
      await context.step(`stop:${service}`, () => this.run([...(context.compose), 'stop','--timeout',String(this.policy.stopTimeoutSeconds ?? 150), service]), { sideEffect: true })
    }
    return { drained: true, ingress: false, mode: plan.mode }
  }
  async apply(op, plan, context, direction = 'forward') {
    const local = this.policy.targets[op.target], descriptor = direction === 'recovery' ? plan.recovery : plan
    assertCompatible(descriptor.contract, await this.state(op))
    if (plan.mode === 'rolling') requireValue(await this.barrier(op), 'DRAIN_UNPROVEN', 'Actual task/lease barrier must remain drained before switching')
    // Maintenance's global barrier was durably proved by drain on both hosts before any apply.
    // New qualified Workers may now run; they must not be mistaken for old writers on the sibling's apply.
    const ingress = await this.control(local,'ingressState',op,'GET')
    requireValue(ingress.enabled === false, 'INGRESS_NOT_DRAINED', 'Remove this backend from stable ingress before changing services')
    const previous = await this.containers(op)
    requireValue(Object.entries(previous).every(([service,container]) => [plan.images[service].configDigest,plan.recovery.images[service].configDigest,(plan.source ?? plan.recovery).images[service].configDigest].includes(container.Image)), 'SOURCE_IMAGE_CHANGED', 'An unqualified image replaced a source service')
    for (const [service, spec] of Object.entries(local.services)) if (spec.role === 'worker') requireValue(previous[service].State?.Running === false, 'WORKER_NOT_STOPPED', 'The local dependent Worker must be stopped before replacing Web')
    for (const image of Object.values(descriptor.images)) requireValue(await this.inspectImage(image), 'OFFLINE_IMAGE_MISSING', 'Switch/recovery cannot pull missing images')
    const compose = await this.composeArgs(op, direction)
    this.validateConfig(JSON.parse(await this.run([...compose,'config','--format','json'])), local, descriptor)
    // Validate original volumes are present before Compose can create a silently empty replacement.
    for (const mount of Object.values(local.services).flatMap(spec => spec.mounts)) if (mount.type === 'volume') await this.run(['volume','inspect',mount.source])
    for (const role of ['web','component','worker']) for (const [service, spec] of Object.entries(local.services)) if (spec.role === role) {
      await context.step(`${direction}:up:${service}`, () => this.run([...compose,'up','--detach','--no-build','--pull','never','--no-deps',service]), { sideEffect: true })
      await this.waitHealthy(op, service, descriptor.images[service])
      if (role === 'web') {
        const ready = await this.control(local,'readiness',{ ...op,direction },'GET')
        requireValue(ready.ready === true && isDeepStrictEqual(ready.contract, descriptor.contract), 'CONTROL_NOT_READY', 'Web and the local Worker control contract are not ready')
      }
    }
    return { applied: true, direction, images: Object.fromEntries(Object.entries(descriptor.images).map(([service,image]) => [service,image.configDigest])) }
  }
  async waitHealthy(op, service, image) {
    const deadline = Date.now() + (this.policy.startupTimeoutMs ?? 180000)
    do {
      const actual = (await this.containers(op))[service]
      requireValue(actual.Image === image.configDigest, 'CONTAINER_IMAGE_MISMATCH', 'Service is running an unexpected image')
      if (actual.State?.Running && !actual.State.Restarting && actual.State.Health?.Status === 'healthy') return
      if (Date.now() >= deadline) throw Object.assign(fault('STARTUP_TIMEOUT', 'Applied container did not become healthy within the fixed startup budget'), { knownApplied: true })
      await this.wait(this.policy.pollIntervalMs ?? 1000)
    } while (true)
  }
  async verify(op, plan, direction = 'forward') {
    const descriptor = direction === 'recovery' ? plan.recovery : plan, actual = await this.containers(op)
    assertCompatible(descriptor.contract, await this.state(op))
    for (const [service,image] of Object.entries(descriptor.images)) requireValue(actual[service].Image === image.configDigest && actual[service].State?.Running === true &&
      !actual[service].State.Restarting && actual[service].State.Health?.Status === 'healthy', 'VERIFY_FAILED', 'Service identity or readiness does not match the target')
    const local = this.policy.targets[op.target]
    if (local.adapter === 'main-runtime') {
      const ready = await this.control(local,'readiness',op,'GET')
      requireValue(ready.ready === true && isDeepStrictEqual(ready.contract, descriptor.contract), 'VERIFY_FAILED', 'Runtime readiness or actual protocol provenance differs')
    }
    return { verified: true, direction, images: Object.fromEntries(Object.entries(actual).map(([service,container]) => [service,container.Image])) }
  }
  async undrain(op, plan, context, direction = 'forward') {
    await this.verify(op,plan,direction)
    const local = this.policy.targets[op.target]
    if (plan.mode === 'rolling') await context.step('worker-admission-open', () => this.control(local,'undrain',op), { sideEffect: true })
    await context.step('ingress-enable', () => this.control(local,'ingress',{ ...op, enabled: true }), { sideEffect: true })
    const ingress = await this.control(local,'ingressState',op,'GET')
    requireValue(ingress.enabled === true && ingress.generation === op.generation, 'INGRESS_UNPROVEN', 'Stable ingress has not confirmed backend restoration')
    return { drained: false, ingress: true }
  }
  async observe(op, plan) {
    // Observation has no writes. It can prove completion, never infer that an old daemon action stopped from a TTL.
    if (['backup','restore-verify','migrate'].includes(op.phase)) {
      const evidence = await this.control(this.policy.targets[op.target], `${op.phase === 'restore-verify' ? 'restoreVerify' : op.phase}Observe`,op,'GET')
      requireValue(evidence?.complete === true, 'DATABASE_RECEIPT_INVALID', 'Database completion is not proven')
      return evidence
    }
    if (['apply','recover','verify'].includes(op.phase)) return this.verify(op,plan,op.phase === 'recover' ? 'recovery' : 'forward')
    if (['drain','recovery-drain'].includes(op.phase)) {
      const local = this.policy.targets[op.target], ingress = await this.control(local,'ingressState',op,'GET'), containers = await this.containers(op)
      requireValue(await this.barrier(op) && ingress.enabled === false && Object.entries(local.services).every(([service,spec]) => spec.role !== 'worker' || !containers[service].State.Running), 'OBSERVATION_UNRESOLVED', 'Drain completion is not proven')
      return { drained: true, observed: true }
    }
    if (['undrain','recovery-undrain'].includes(op.phase)) {
      await this.verify(op,plan,op.phase === 'recovery-undrain' ? 'recovery' : 'forward')
      const ingress = await this.control(this.policy.targets[op.target],'ingressState',op,'GET')
      requireValue(ingress.enabled === true && ingress.generation === op.generation, 'OBSERVATION_UNRESOLVED', 'Ingress restoration is not proven')
      return { drained: false, observed: true }
    }
    if (op.phase === 'prepare') {
      for (const descriptor of [plan,plan.recovery]) for (const image of Object.values(descriptor.images)) requireValue(await this.inspectImage(image), 'OBSERVATION_UNRESOLVED', 'Preparation cache is incomplete')
      for (const direction of ['forward','recovery']) this.validateConfig(JSON.parse(await this.run([...(await this.composeArgs(op,direction)),'config','--format','json'])), this.policy.targets[op.target], direction === 'forward' ? plan : plan.recovery)
      return { offlineReady: true, observed: true }
    }
    throw fault('OBSERVATION_UNRESOLVED', 'This operation requires explicit independent evidence')
  }
}
