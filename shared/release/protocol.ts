// This protocol is shared by CI, the durable controller and operator tooling.
// Secrets and shell commands never belong in a release manifest.
export const PROTOCOL_VERSION = 1 as const
export const TARGETS = {
  'main-runtime-a': { adapter: 'main-runtime', resources: ['main-runtime', 'main-db'] },
  'main-runtime-b': { adapter: 'main-runtime', resources: ['main-runtime', 'main-db'] },
  'main-frontend': { adapter: 'web-static', resources: ['main-frontend'] },
  notebook: { adapter: 'open-notebook', resources: ['notebook'] },
  wukongim: { adapter: 'wukongim', resources: ['wukongim'] },
  'admin-worker': { adapter: 'admin-worker', resources: ['admin-worker', 'admin-db'] },
  gateway: { adapter: 'gateway', resources: ['main-runtime', 'main-ingress'] },
} as const
export type TargetId = keyof typeof TARGETS
export type Contract = {
  nativeSchema: number; productSchema: number; api: string; worker: string
  checkpoint: string; control: string; capabilities: string[]
  lingxios?: string; migrations?: { version: number; checksum: string }[]
}
export type Artifact = {
  kind: 'image' | 'worker'; digest?: string; workerName?: string; versionId?: string
  hash?: string; [key: string]: unknown
}
export const MAX_ARTIFACT_PART_BYTES = 8 * 1024 * 1024
export type ImageArchive = {
  version: 1; format: 'docker-save+gzip'; sha256: string; size: number; uncompressedSize: number
  tag: string; parts: { sha256: string; size: number }[]
}
export type ArchivedImage = { configDigest: string; archive: ImageArchive }
export function validateImageArchive(input: unknown, configDigest: string): ImageArchive {
  const a = input as ImageArchive
  requireThat(a && a.version === 1 && a.format === 'docker-save+gzip' && digest.test(a.sha256) && digest.test(configDigest) &&
    a.tag === `localhost/lingxi-release-cache:sha256-${configDigest.slice(7)}` &&
    Number.isSafeInteger(a.size) && a.size > 0 && a.size <= 8 * 1024 ** 3 &&
    Number.isSafeInteger(a.uncompressedSize) && a.uncompressedSize > 0 && a.uncompressedSize <= 16 * 1024 ** 3 &&
    Array.isArray(a.parts) && a.parts.length > 0 && a.parts.length <= 2048 &&
    a.parts.every(p => digest.test(p.sha256) && Number.isSafeInteger(p.size) && p.size > 0 && p.size <= MAX_ARTIFACT_PART_BYTES) &&
    a.parts.reduce((sum, p) => sum + p.size, 0) === a.size, 'INVALID_IMAGE_ARCHIVE', 400)
  return a
}
/** Only image descriptors belonging to this target, including its recovery/source. */
export function archivedImages(target: Target): ArchivedImage[] {
  const result = new Map<string, ArchivedImage>()
  const plan = target.hostPlan
  for (const descriptor of [plan, plan?.source, plan?.recovery] as (Record<string, unknown> | undefined)[]) {
    if (!descriptor?.images || typeof descriptor.images !== 'object') continue
    for (const value of Object.values(descriptor.images)) {
      requireThat(value && typeof value === 'object', 'INVALID_IMAGE_DESCRIPTOR', 400)
      const image = value as ArchivedImage
      if (image.archive === undefined) continue
      validateImageArchive(image.archive, image.configDigest)
      const previous = result.get(image.configDigest)
      requireThat(!previous || canonical(previous.archive) === canonical(image.archive), 'CONFLICTING_IMAGE_ARCHIVE', 400)
      result.set(image.configDigest, image)
    }
  }
  return [...result.values()]
}
export type DatabasePlan = {
  from: { nativeSchema: number; productSchema: number }
  to: { nativeSchema: number; productSchema: number }
  strategy: 'maintenance'; rpo: 'zero-committed-writes' | 'test-data-no-backup'
  migrations: { version: number; checksum: string }[]
}
export function databasePlan(target: Target): DatabasePlan | undefined {
  return target.hostPlan?.database as DatabasePlan | undefined
}
export type Target = {
  adapter: string; resources: string[]; dependsOn: TargetId[]; fromReleaseId: string | null
  hosts: string[]; artifact: Artifact; contract: Contract
  configuration: { version: string; secretRefs: string[]; volumes: Record<string, string> }
  hostPlan?: Record<string, unknown>
  recovery?: { artifact: Artifact; contract: Contract }
  verification: { readiness: string[]; businessProbe: string }
}
export type Manifest = {
  version: 1; releaseId: string; appSha: string; opsSha: string; sourceReleaseId: string | null
  sequence: number; createdAt: string
  checks: { commit: string; conclusion: 'success'; runId: string }
  policy: { drainSeconds: number; retryLimit: number; batchSeconds?: number }
  targets: Partial<Record<TargetId, Target>>
}
export type Component = Target & { releaseId: string; appSha: string; sequence: number }
export type Accepted = { releaseId: string | null; components: Partial<Record<TargetId, Component>> }
export class ReleaseError extends Error {
  constructor(public code: string, public status = 409) { super(code) }
}
export function requireThat(value: unknown, code: string, status = 409): asserts value {
  if (!value) throw new ReleaseError(code, status)
}
const id = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,95}$/
const sha = /^[a-f0-9]{40}$/
const digest = /^sha256:[a-f0-9]{64}$/
const workerVersion = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
export function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, val]) => `${JSON.stringify(key)}:${canonical(val)}`).join(',')}}`
}
export async function hash(value: unknown): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(value)))
  return `sha256:${Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('')}`
}
export function validContract(value: unknown): value is Contract {
  const c = value as Contract | undefined
  return !!c && Number.isSafeInteger(c.nativeSchema) && c.nativeSchema >= 0 &&
    Number.isSafeInteger(c.productSchema) && c.productSchema >= 0 &&
    ['api', 'worker', 'checkpoint', 'control'].every(key => typeof c[key as keyof Contract] === 'string' && !!c[key as keyof Contract]) &&
    Array.isArray(c.capabilities) && c.capabilities.every(item => typeof item === 'string') &&
    (!c.migrations || c.migrations.every(m => Number.isSafeInteger(m.version) && /^[a-f0-9]{64}$/.test(m.checksum)))
}
export function validateManifest(input: unknown): Manifest {
  const m = input as Manifest
  requireThat(m && m.version === 1 && id.test(m.releaseId) && !m.releaseId.includes('..') && sha.test(m.appSha) && sha.test(m.opsSha), 'INVALID_MANIFEST', 400)
  requireThat(Number.isSafeInteger(m.sequence) && m.sequence > 0 && Number.isFinite(Date.parse(m.createdAt)), 'INVALID_SEQUENCE', 400)
  requireThat(m.sourceReleaseId === null || id.test(m.sourceReleaseId), 'INVALID_SOURCE', 400)
  requireThat(m.checks?.commit === m.appSha && m.checks.conclusion === 'success' && /^\d+$/.test(m.checks.runId), 'CHECKS_NOT_QUALIFIED', 400)
  requireThat(m.policy && m.policy.drainSeconds >= 1 && m.policy.drainSeconds <= 1800 && Number.isInteger(m.policy.drainSeconds) && Number.isInteger(m.policy.retryLimit) && m.policy.retryLimit >= 0 && m.policy.retryLimit <= 3, 'INVALID_BUDGET', 400)
  requireThat(m.targets && Object.keys(m.targets).length > 0 && Object.keys(m.targets).length <= 7, 'INVALID_TARGETS', 400)
  for (const [key, t] of Object.entries(m.targets)) {
    const definition = TARGETS[key as TargetId]
    requireThat(definition && t.adapter === definition.adapter, 'INVALID_ADAPTER', 400)
    // Conflict resources are derived by the controller, not chosen by a caller.
    requireThat(Array.isArray(t.resources) && definition.resources.every(r => t.resources.includes(r)) && t.resources.every(r => /^[a-z][a-z0-9-]{0,63}$/.test(r)), 'MISSING_CONFLICT_RESOURCE', 400)
    requireThat(Array.isArray(t.dependsOn) && t.dependsOn.every(d => d in TARGETS && d !== key), 'INVALID_DEPENDENCY', 400)
    requireThat(t.fromReleaseId === null || id.test(t.fromReleaseId), 'INVALID_COMPONENT_SOURCE', 400)
    requireThat(validContract(t.contract), 'INVALID_CONTRACT', 400)
    requireThat(t.configuration && id.test(t.configuration.version) && Array.isArray(t.configuration.secretRefs) && t.configuration.secretRefs.every(s => /^[A-Z][A-Z0-9_]{0,95}$/.test(s)) && typeof t.configuration.volumes === 'object', 'INVALID_CONFIGURATION', 400)
    requireThat(Array.isArray(t.hosts) && t.hosts.every(h => id.test(h)), 'INVALID_HOSTS', 400)
    requireThat(t.artifact && ['image', 'worker'].includes(t.artifact.kind), 'INVALID_ARTIFACT', 400)
    if (t.artifact.kind === 'worker') {
      requireThat(['web-static', 'admin-worker'].includes(t.adapter) && id.test(t.artifact.workerName ?? '') && workerVersion.test(t.artifact.versionId ?? '') && digest.test(t.artifact.hash ?? '') && !t.hosts.length, 'UNPINNED_WORKER', 400)
    } else { requireThat(digest.test(t.artifact.digest ?? '') && t.hosts.length > 0 && t.hostPlan, 'UNPINNED_IMAGE', 400); archivedImages(t) }
    requireThat(t.verification && Array.isArray(t.verification.readiness) && t.verification.readiness.length > 0 && t.verification.readiness.every(value => typeof value === 'string' && id.test(value)) && typeof t.verification.businessProbe === 'string' && id.test(t.verification.businessProbe), 'MISSING_VERIFICATION', 400)
  }
  orderedTargets(m)
  return m
}
export function orderedTargets(m: Manifest): TargetId[] {
  const done = new Set<TargetId>(); const visiting = new Set<TargetId>()
  const visit = (key: TargetId) => {
    if (done.has(key)) return
    requireThat(!visiting.has(key), 'DEPENDENCY_CYCLE', 400)
    visiting.add(key)
    for (const dep of m.targets[key]!.dependsOn) if (m.targets[dep]) visit(dep)
    visiting.delete(key); done.add(key)
  }
  for (const key of Object.keys(m.targets) as TargetId[]) visit(key)
  return [...done]
}
export function assertSource(m: Manifest, accepted: Accepted) {
  for (const [key, target] of Object.entries(m.targets) as [TargetId, Target][]) {
    const current = accepted.components[key]
    requireThat(current && target.fromReleaseId === current.releaseId, 'SOURCE_MOVED')
    requireThat(m.sequence > current.sequence, 'STALE_CANDIDATE')
    if (target.artifact.kind === 'image') {
      const changed = target.contract.nativeSchema !== current.contract.nativeSchema || target.contract.productSchema !== current.contract.productSchema
      if (changed) {
        // A schema change has a single database owner and a full maintenance
        // plan. Its real host policy and helpers enforce backup, restoration,
        // writer isolation, published package provenance and migration ledger.
        const owner = m.targets['main-runtime-a']; const database = owner && databasePlan(owner)
        const testData = database?.rpo === 'test-data-no-backup' && database.from?.nativeSchema === database.to?.nativeSchema &&
          !!current.contract.lingxios && current.contract.lingxios === target.contract.lingxios &&
          database.to?.productSchema > database.from?.productSchema && !('runtimePatch' in database)
        requireThat(target.adapter === 'main-runtime' && m.targets['main-runtime-b'] && owner && database &&
          owner.hostPlan?.mode === 'maintenance' && m.targets['main-runtime-b'].hostPlan?.mode === 'maintenance' &&
          database.strategy === 'maintenance' && (database.rpo === 'zero-committed-writes' || testData) &&
          database.from?.nativeSchema === current.contract.nativeSchema && database.from?.productSchema === current.contract.productSchema &&
          database.to?.nativeSchema === target.contract.nativeSchema && database.to?.productSchema === target.contract.productSchema &&
          database.to?.nativeSchema >= database.from?.nativeSchema && database.to?.productSchema >= database.from?.productSchema &&
          Array.isArray(database.migrations) && database.migrations.length === database.to?.productSchema && database.migrations.every((row, index) => row.version === index + 1 && /^[a-f0-9]{64}$/.test(row.checksum)) &&
          current.contract.migrations?.length === current.contract.productSchema && current.contract.migrations.every((row, index) => row.version === index + 1 && database.migrations.some(next => next.version === row.version && next.checksum === row.checksum)),
        'SCHEMA_CHANGE_REQUIRES_MAINTENANCE_ADAPTER')
      }
      requireThat(canonical(target.configuration.volumes) === canonical(current.configuration.volumes), 'VOLUME_BINDING_CHANGED')
      for (const capability of current.contract.capabilities) requireThat(target.contract.capabilities.includes(capability), 'REQUIRED_CAPABILITY_REMOVED')
    }
  }
}
export function canRecover(current: Contract, recovery: Contract): boolean {
  return current.nativeSchema === recovery.nativeSchema && current.productSchema === recovery.productSchema &&
    ['api', 'worker', 'checkpoint', 'control'].every(key => current[key as keyof Contract] === recovery[key as keyof Contract]) &&
    current.capabilities.every(c => recovery.capabilities.includes(c))
}
export function canSupersede(older: Manifest, newer: Manifest): boolean {
  if (newer.sequence <= older.sequence) return false
  return Object.entries(older.targets).every(([key, old]) => {
    const next = newer.targets[key as TargetId]
    return next && next.fromReleaseId === old.fromReleaseId &&
      (old.contract.migrations ?? []).every(m => next.contract.migrations?.some(n => n.version === m.version && n.checksum === m.checksum))
  })
}
