import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { readAccepted, releaseApiUrl } from './ci-scope-cumulative.mjs'
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const exactSha = value => /^[a-f0-9]{40}$/.test(value || '')
const adapters = { 'main-frontend': 'web-static', 'main-runtime-a': 'main-runtime', 'main-runtime-b': 'main-runtime', notebook: 'open-notebook', wukongim: 'wukongim', 'admin-worker': 'admin-worker', gateway: 'gateway' }
const resources = { 'main-frontend': ['main-frontend'], 'main-runtime-a': ['main-runtime', 'main-db'], 'main-runtime-b': ['main-runtime', 'main-db'], notebook: ['notebook'], wukongim: ['wukongim'], 'admin-worker': ['admin-worker', 'admin-db'], gateway: ['main-runtime', 'main-ingress'] }
export function configurationsEqual(a, b) {
  const normalize = config => config && { ...config, secretRefs: [...config.secretRefs].sort() }
  return isDeepStrictEqual(normalize(a), normalize(b))
}
const git = args => execFileSync('git', args, { encoding: 'utf8', timeout: 15000 }).trim()
export function sourceContractIdentity(sha, read = args => execFileSync('git', args)) {
  if (!exactSha(sha)) throw new Error('invalid exact source commit')
  const root = JSON.parse(read(['show', `${sha}:package.json`]))
  const server = JSON.parse(read(['show', `${sha}:server/package.json`]))
  const locks = ['package-lock.json', 'server/package-lock.json'].map(path => JSON.parse(read(['show', `${sha}:${path}`])))
  const lingxios = root.dependencies['@lyyzka/lingxios']
  if (!/^\d+\.\d+\.\d+$/.test(lingxios) || server.dependencies['@lyyzka/lingxios'] !== lingxios || locks.some(lock => lock.packages['node_modules/@lyyzka/lingxios'].version !== lingxios || lock.packages[''].dependencies['@lyyzka/lingxios'] !== lingxios)) throw new Error('exact LingxiOS locks mismatch')
  const packages = locks.map(lock => lock.packages['node_modules/@lyyzka/lingxios'])
  if (!/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(packages[0].integrity || '') || !packages[0].resolved?.startsWith(`https://npm.pkg.github.com/download/@lyyzka/lingxios/${lingxios}/`) || packages[0].integrity !== packages[1].integrity || packages[0].resolved !== packages[1].resolved) throw new Error('LingxiOS package provenance mismatch')
  const names = String(read(['ls-tree', '--name-only', `${sha}:server/src/db/migrations`])).trim().split('\n').sort()
  const migrations = names.map((name, index) => {
    if (!new RegExp(`^${String(index + 1).padStart(4, '0')}_[a-z0-9_]+\\.sql$`).test(name)) throw new Error('Noncontiguous migration inventory')
    return { version: index + 1, name: name.slice(5, -4), checksum: digest(read(['show', `${sha}:server/src/db/migrations/${name}`])) }
  })
  return { lingxios, integrity: packages[0].integrity, resolved: packages[0].resolved, migrations }
}
// Only this JSON artifact route can expand a previously accepted contract.
// Concrete profile keys refer to trusted host policy; CI never installs profiles.
const inventoryContract = identity => identity.migrations.map(({ version, checksum }) => ({ version, checksum }))
const requireProof = (value, detail) => { if (!value) throw new Error(`CONTRACT_CHANGE_REQUIRES_ATTESTATION: ${detail}`) }
const sha256 = value => /^sha256:[a-f0-9]{64}$/.test(value || '')
function validImage(image) {
  return image?.kind === 'image' && sha256(image.digest) && sha256(image.indexDigest) && sha256(image.platformDigest) && sha256(image.configDigest) &&
    image.digest === image.indexDigest && /^ghcr\.io\/[a-z0-9][a-z0-9/._-]*@sha256:[a-f0-9]{64}$/.test(image.ref || '') && image.ref.endsWith(`@${image.indexDigest}`) &&
    image.os === 'linux' && image.architecture === 'amd64' && image.diffIds?.length > 0 && image.diffIds.every(sha256)
}
export async function publicPackageProvenance(load = () => import('@lyyzka/lingxios'), read = readFileSync) {
  const { releaseVersions, packageResources } = await load()
  requireProof(releaseVersions && typeof packageResources === 'function', 'published package public exports missing')
  return { lingxios: releaseVersions.runtime, nativeSchema: releaseVersions.schema, controlPlane: releaseVersions.controlPlane, schemaHash: digest(read(packageResources().schema)) }
}
function checkedRuntimeOverride(id, current, artifact, before, after, { attestation, appSha, opsSha, publicPackage, contractIdentity }) {
  requireProof(attestation?.version === 1 && attestation.appSha === appSha && attestation.opsSha === opsSha, 'exact app and fixed operations SHA required')
  requireProof(Object.keys(attestation.targets || {}).length === 2 && attestation.targets['main-runtime-a'] && attestation.targets['main-runtime-b'], 'both runtime nodes require explicit contracts')
  requireProof(isDeepStrictEqual(attestation.targets['main-runtime-a'].contract, attestation.targets['main-runtime-b'].contract) && isDeepStrictEqual(attestation.targets['main-runtime-a'].hostPlan?.database, attestation.targets['main-runtime-b'].hostPlan?.database), 'both runtime nodes must agree on installed schema and protocols')
  const override = attestation.targets[id], { contract, hostPlan, profileKeys } = override
  const db = hostPlan?.database, recovery = hostPlan?.recovery
  requireProof(contract && hostPlan && profileKeys && db && recovery, 'contract, database, profile references and recovery are required')
  requireProof(publicPackage?.lingxios === after.lingxios && publicPackage.nativeSchema === contract.nativeSchema && /^[a-f0-9]{64}$/.test(publicPackage.schemaHash || '') && Number.isSafeInteger(publicPackage.controlPlane), 'published package version/native schema/controlPlane/schema bytes must be verified')
  requireProof(isDeepStrictEqual(override.publicPackage, publicPackage), 'artifact public package provenance differs from locked installed public exports')
  requireProof(contract.lingxios === after.lingxios && contract.productSchema === after.migrations.length && isDeepStrictEqual(contract.migrations, inventoryContract(after)), 'contract must bind the complete source-derived target package and migration inventory')
  for (const field of ['api','worker','checkpoint','control']) requireProof(typeof contract[field] === 'string' && contract[field].length > 0, `missing concrete ${field} contract`)
  requireProof(Array.isArray(contract.capabilities) && current.contract.capabilities.every(capability => contract.capabilities.includes(capability)), 'required data capabilities must be retained')
  requireProof(hostPlan.mode === 'maintenance' && db.strategy === 'maintenance' && db.rpo === 'zero-committed-writes', 'schema transitions require maintenance and zero committed write loss')
  requireProof(isDeepStrictEqual(db.from, { nativeSchema: current.contract.nativeSchema, productSchema: current.contract.productSchema }) && isDeepStrictEqual(db.to, { nativeSchema: contract.nativeSchema, productSchema: contract.productSchema }), 'database source/target must match accepted and target contracts')
  requireProof(db.to.nativeSchema >= db.from.nativeSchema && db.to.productSchema >= db.from.productSchema && before.migrations.length === current.contract.productSchema, 'forward-only schema and accepted source inventory required')
  requireProof(isDeepStrictEqual(db.migrations, after.migrations) && before.migrations.every(row => after.migrations.some(next => isDeepStrictEqual(next, row))), 'complete named migration inventory must preserve every accepted checksum')
  requireProof(profileKeys.target === `${contract.nativeSchema}:${contract.productSchema}:${publicPackage.schemaHash}` && typeof profileKeys.source === 'string' && new RegExp(`^${current.contract.nativeSchema}:${current.contract.productSchema}:[a-f0-9]{64}$`).test(profileKeys.source), 'concrete trusted source/target profile keys required')
  if (before.lingxios === after.lingxios) requireProof(profileKeys.source.endsWith(`:${publicPackage.schemaHash}`), 'same package source profile schema hash differs')
  requireProof(recovery && recovery.configurationHash === current.hostPlan?.configurationHash && exactSha(recovery.appSha) && validImage(recovery.artifact) && sha256(recovery.configurationHash), 'prequalified immutable schema-compatible recovery required')
  const recoverySource = contractIdentity(recovery.appSha), recoveryContract = recovery.contract
  requireProof(recoverySource.lingxios === after.lingxios && recoverySource.integrity === after.integrity && recoverySource.resolved === after.resolved && isDeepStrictEqual(recoverySource.migrations, after.migrations), 'recovery source/package/migrations must support the target installed schema')
  requireProof(recoveryContract && recoveryContract.lingxios === after.lingxios && recoveryContract.nativeSchema === contract.nativeSchema && recoveryContract.productSchema === contract.productSchema && isDeepStrictEqual(recoveryContract.migrations, inventoryContract(after)) && ['api','worker','checkpoint','control'].every(key => recoveryContract[key] === contract[key]) && contract.capabilities.every(capability => recoveryContract.capabilities?.includes(capability)), 'recovery contract must support all target protocols, schemas and capabilities')
  requireProof(profileKeys.recovery === profileKeys.target, 'recovery uses the same installed-schema profile')
  const services = Object.keys(current.hostPlan?.images || {}).sort()
  requireProof(services.length > 0 && isDeepStrictEqual(Object.keys(recovery.images || {}).sort(), services) && Object.values(recovery.images).every(image => isDeepStrictEqual(image, recovery.artifact)), 'recovery must bind all locally configured services')
  requireProof(validImage(artifact), 'complete target image identity required')
  return { contract, database: db, profileKeys, recovery }
}
export function buildManifest({ accepted, artifacts, appSha, opsSha, sequence, runId, runAttempt = 1, createdAt = new Date().toISOString(), contractIdentity = sourceContractIdentity, attestation, publicPackage }) {
  if (!accepted?.releaseId || !exactSha(appSha) || !exactSha(opsSha)) throw new Error('VERIFIED_SOURCE_REQUIRED')
  const targets = {}
  for (const [id, artifact] of Object.entries(artifacts)) {
    const current = accepted.components[id]
    if (!current || !adapters[id]) throw new Error(`ACCEPTED_COMPONENT_REQUIRED: ${id}`)
    if (!current.verification?.businessProbe || !current.verification?.readiness?.length) throw new Error(`VERIFICATION_CONTRACT_REQUIRED: ${id}`)
    if (Number(sequence) <= current.sequence) throw new Error('STALE_CANDIDATE')
    let override
    if (id.startsWith('main-runtime-')) {
      const before = contractIdentity(current.appSha), after = contractIdentity(appSha)
      if (!isDeepStrictEqual(before, after)) {
        requireProof(artifacts['main-runtime-a'] && artifacts['main-runtime-b'], 'both runtime targets must participate in a schema transition')
        override = checkedRuntimeOverride(id, current, artifact, before, after, { attestation, appSha, opsSha, publicPackage, contractIdentity })
      }
    }
    const target = { adapter: adapters[id], resources: resources[id], dependsOn: [], fromReleaseId: current.releaseId, hosts: current.hosts, artifact, contract: current.contract, configuration: artifact.kind === 'worker' ? { ...current.configuration, version: artifact.configurationVersion || current.configuration.version } : current.configuration, verification: current.verification, recovery: { artifact: current.artifact, contract: current.contract } }
    if (artifact.kind === 'image') {
      if (!current.hostPlan) throw new Error(`HOST_PLAN_REQUIRED: ${id}`)
      // The executor validates the complete signed plan. Rebase deterministic
      // identity fields, keeping approved source topology/configuration.
      target.hostPlan = { ...current.hostPlan, source: { images: current.hostPlan.images, contract: current.contract, configurationHash: current.hostPlan.configurationHash }, ...(id.startsWith('main-runtime-') ? { mode: 'maintenance' } : {}), images: Object.fromEntries(Object.keys(current.hostPlan.images || {}).map(service => [service, artifact])), contract: current.contract, recovery: { images: current.hostPlan.images, contract: current.contract, configurationHash: current.hostPlan.configurationHash } }
    }
    // An accepted plan may describe a previous migration. Ordinary releases
    // inherit its effective configuration, never its migration side effects.
    if (target.hostPlan) delete target.hostPlan.database
    if (override) {
      target.contract = override.contract
      target.hostPlan.contract = override.contract
      // Only node A owns migration side effects; node B still declares its
      // concrete installed-schema profile and compatible recovery artifact.
      if (id === 'main-runtime-a') target.hostPlan.database = override.database
      else delete target.hostPlan.database
      target.hostPlan.profileKeys = override.profileKeys
      target.hostPlan.recovery = { images: override.recovery.images, contract: override.recovery.contract, configurationHash: override.recovery.configurationHash }
      target.recovery = { artifact: override.recovery.artifact, contract: override.recovery.contract }
    }
    targets[id] = target
  }
  // A changed backend is accepted before a frontend built against that source.
  if (targets['main-frontend']) targets['main-frontend'].dependsOn = ['main-runtime-a', 'main-runtime-b', 'admin-worker'].filter(id => targets[id])
  return { version: 1, releaseId: `gh-${runId}-a${runAttempt}-${appSha.slice(0, 12)}`, appSha, opsSha, sourceReleaseId: accepted.releaseId, sequence: Number(sequence), createdAt, checks: { commit: appSha, conclusion: 'success', runId: String(runId) }, policy: { drainSeconds: 120, retryLimit: 2, batchSeconds: 30 }, targets }
}
export function verifyAttestationRun(run, appSha, repository) {
  requireProof(run?.conclusion === 'success' && run.head_sha === appSha && run.repository?.full_name === repository, 'contract artifact producer must be a successful same-repository run for the exact app SHA')
}
const rawDigest = bytes => `sha256:${digest(bytes)}`
export function verifiedOciBytes(raw, expected, label, allowCliNewline = false) {
  if (!(typeof raw === 'string' || raw instanceof Uint8Array)) throw new Error(`OCI_RAW_PROOF_REQUIRED: ${label}`)
  const bytes = Buffer.from(raw)
  if (rawDigest(bytes) === expected) return bytes
  // buildx --raw may append a transport LF. Only strip one byte when the
  // remaining exact bytes independently match the registry digest.
  if (allowCliNewline && bytes.at(-1) === 10 && rawDigest(bytes.subarray(0, -1)) === expected) return bytes.subarray(0, -1)
  throw new Error(`OCI_DIGEST_MISMATCH: ${label}`)
}
function ghcrCredentials(env, read, run) {
  try {
    const config = JSON.parse(read(join(env.DOCKER_CONFIG || join(homedir(), '.docker'), 'config.json'), 'utf8'))
    const entry = config.auths?.['ghcr.io'] ?? config.auths?.['https://ghcr.io']
    if (entry?.auth) {
      const value = Buffer.from(entry.auth, 'base64').toString('utf8'), separator = value.indexOf(':')
      if (separator > 0 && separator < value.length - 1) return Buffer.from(value).toString('base64')
    }
    const helper = config.credHelpers?.['ghcr.io'] || config.credsStore
    if (helper && /^[a-zA-Z0-9_-]+$/.test(helper)) {
      const credential = JSON.parse(run(`docker-credential-${helper}`, ['get'], { input: 'ghcr.io\n', encoding: 'utf8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] }))
      if (credential.Username && credential.Secret) return Buffer.from(`${credential.Username}:${credential.Secret}`).toString('base64')
    }
  } catch { /* A registry-login config is preferred; CI's scoped token is the fallback. */ }
  if (env.GITHUB_TOKEN && env.GITHUB_ACTOR) return Buffer.from(`${env.GITHUB_ACTOR}:${env.GITHUB_TOKEN}`).toString('base64')
  throw new Error('GHCR_AUTH_UNAVAILABLE')
}
export async function ghcrConfigBlob(reference, configDigest, { fetcher = fetch, env = process.env, read = readFileSync, run = execFileSync } = {}) {
  if (!/^ghcr\.io\/[a-z0-9][a-z0-9._-]*(?:\/[a-z0-9][a-z0-9._-]*)+$/.test(reference) || !sha256(configDigest)) throw new Error('immutable GHCR identity required')
  const repository = reference.slice('ghcr.io/'.length), credentials = ghcrCredentials(env, read, run)
  const tokenUrl = new URL('https://ghcr.io/token')
  tokenUrl.searchParams.set('service', 'ghcr.io'); tokenUrl.searchParams.set('scope', `repository:${repository}:pull`)
  const safeFetch = async (url, options) => {
    try { return await fetcher(url, { ...options, signal: AbortSignal.timeout(30000) }) }
    catch { throw new Error('GHCR_RAW_REQUEST_FAILED') }
  }
  const tokenResponse = await safeFetch(tokenUrl, { headers: { authorization: `Basic ${credentials}` }, redirect: 'error' })
  if (!tokenResponse.ok) throw new Error(`GHCR_TOKEN_HTTP_${tokenResponse.status}`)
  let token
  try { const result = await tokenResponse.json(); token = result.token || result.access_token } catch { throw new Error('GHCR_TOKEN_RESPONSE_INVALID') }
  if (!token || typeof token !== 'string') throw new Error('GHCR_TOKEN_RESPONSE_INVALID')
  let response = await safeFetch(`https://ghcr.io/v2/${repository}/blobs/${configDigest}`, { headers: { authorization: `Bearer ${token}` }, redirect: 'manual' })
  for (let hop = 0; [301, 302, 303, 307, 308].includes(response.status) && hop < 3; hop++) {
    let location
    try { location = new URL(response.headers.get('location')) } catch { throw new Error('GHCR_BLOB_REDIRECT_INVALID') }
    if (location.protocol !== 'https:' || location.username || location.password || !['ghcr.io', 'pkg-containers.githubusercontent.com'].includes(location.hostname)) throw new Error('GHCR_BLOB_REDIRECT_UNTRUSTED')
    await response.body?.cancel()
    // The signed GHCR CDN URL authorizes its own download. Neither the Docker
    // credential nor the short-lived pull token is forwarded to that host.
    response = await safeFetch(location, { redirect: 'manual' })
  }
  if (!response.ok) throw new Error(`GHCR_CONFIG_HTTP_${response.status}`)
  try { return Buffer.from(await response.arrayBuffer()) } catch { throw new Error('GHCR_CONFIG_BODY_FAILED') }
}
export async function imageArtifact(reference, indexDigest, inspectRaw = ref => execFileSync('docker', ['buildx', 'imagetools', 'inspect', ref, '--raw'], { timeout: 60000, maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }), configRaw = ghcrConfigBlob) {
  if (!/^ghcr\.io\/[a-z0-9][a-z0-9._-]*(?:\/[a-z0-9][a-z0-9._-]*)+$/.test(reference) || !sha256(indexDigest)) throw new Error('immutable GHCR identity required')
  let rawIndex
  try { rawIndex = await inspectRaw(`${reference}@${indexDigest}`) } catch { throw new Error('OCI_RAW_INDEX_UNAVAILABLE') }
  const indexBytes = verifiedOciBytes(rawIndex, indexDigest, 'index', true)
  let index
  try { index = JSON.parse(indexBytes.toString('utf8')) } catch { throw new Error('OCI_INDEX_JSON_INVALID') }
  if (index.schemaVersion !== 2) throw new Error('OCI_INDEX_SCHEMA_UNSUPPORTED')
  let platformDigest = indexDigest, platformDescriptor
  if (index.manifests) {
    const platforms = index.manifests.filter(item => item.platform?.os === 'linux' && item.platform?.architecture === 'amd64')
    if (platforms.length !== 1 || !sha256(platforms[0].digest)) throw new Error('OCI_AMD64_MANIFEST_NOT_UNIQUE')
    platformDescriptor = platforms[0]; platformDigest = platformDescriptor.digest
  }
  let rawManifest = indexBytes
  if (platformDigest !== indexDigest) {
    try { rawManifest = await inspectRaw(`${reference}@${platformDigest}`) } catch { throw new Error('OCI_RAW_MANIFEST_UNAVAILABLE') }
  }
  const manifestBytes = verifiedOciBytes(rawManifest, platformDigest, 'manifest', true)
  if (platformDescriptor?.size !== undefined && platformDescriptor.size !== manifestBytes.length) throw new Error('OCI_MANIFEST_SIZE_MISMATCH')
  let manifest
  try { manifest = JSON.parse(manifestBytes.toString('utf8')) } catch { throw new Error('OCI_MANIFEST_JSON_INVALID') }
  if (manifest.schemaVersion !== 2 || !sha256(manifest.config?.digest)) throw new Error('OCI_CONFIG_DESCRIPTOR_INVALID')
  const rawConfig = await configRaw(reference, manifest.config.digest)
  const configBytes = verifiedOciBytes(rawConfig, manifest.config.digest, 'config')
  if (manifest.config.size !== undefined && manifest.config.size !== configBytes.length) throw new Error('OCI_CONFIG_SIZE_MISMATCH')
  let config
  try { config = JSON.parse(configBytes.toString('utf8')) } catch { throw new Error('OCI_CONFIG_JSON_INVALID') }
  if (config.os !== 'linux' || config.architecture !== 'amd64' || config.rootfs?.type !== 'layers' || !Array.isArray(config.rootfs.diff_ids) || !config.rootfs.diff_ids.length || config.rootfs.diff_ids.some(value => !sha256(value))) throw new Error('image platform/config layers missing')
  return { kind: 'image', digest: indexDigest, ref: `${reference}@${indexDigest}`, indexDigest, platformDigest, configDigest: manifest.config.digest, os: config.os, architecture: config.architecture, diffIds: config.rootfs.diff_ids,
    ociProof: { index: indexBytes.toString('base64'), manifest: manifestBytes.toString('base64'), config: configBytes.toString('base64') } }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const [command, ...args] = process.argv.slice(2)
  if (command === 'verify-attestation-run') {
    const runId = process.env.RELEASE_CONTRACT_RUN_ID
    requireProof(/^\d+$/.test(runId || '') && process.env.GITHUB_TOKEN, 'qualified contract workflow run and GitHub read token required')
    const response = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/actions/runs/${runId}`, { headers: { authorization: `Bearer ${process.env.GITHUB_TOKEN}`, accept: 'application/vnd.github+json' }, redirect: 'error', signal: AbortSignal.timeout(15000) })
    requireProof(response.ok, `contract workflow qualification HTTP ${response.status}`)
    verifyAttestationRun(await response.json(), process.env.GITHUB_SHA, process.env.GITHUB_REPOSITORY)
  } else if (command === 'image') {
    const [reference, indexDigest, destination] = args
    writeFileSync(destination, JSON.stringify(await imageArtifact(reference, indexDigest)))
  } else if (command === 'submit') {
    const appSha = process.env.GITHUB_SHA
    // Only the current main head enters the automatic queue. A late older run
    // with a higher run number cannot displace a newer source commit.
    const main = git(['ls-remote', 'origin', 'refs/heads/main']).split(/\s/)[0]
    if (main !== appSha) throw new Error('SUPERSEDED_CANDIDATE: source is no longer main head')
    const releaseScope = JSON.parse(readFileSync('release-scope.json', 'utf8'))
    if (releaseScope.scope.control_migrations) throw new Error('ADMIN_MIGRATION_REQUIRES_ATTESTATION: D1 migration adapter and recovery evidence required')
    const baseline = JSON.parse(readFileSync('accepted-baseline.json', 'utf8'))
    const accepted = await readAccepted(process.env.RELEASE_API_URL, process.env.RELEASE_API_TOKEN)
    const artifacts = {}
    for (const directory of readdirSync('release-artifacts', { withFileTypes: true }).filter(entry => entry.isDirectory())) {
      const artifact = JSON.parse(readFileSync(`release-artifacts/${directory.name}/artifact.json`, 'utf8'))
      if (directory.name === 'server') { artifacts['main-runtime-a'] = artifact; artifacts['main-runtime-b'] = artifact }
      else artifacts[directory.name] = artifact
    }
    if (!Object.keys(artifacts).length) throw new Error('NO_COMPONENT_ARTIFACTS')
    for (const id of Object.keys(artifacts)) {
      const current = accepted.components[id], before = baseline.components[id]
      if (!current || !before || !configurationsEqual(current.configuration, before.configuration)) throw new Error('CONFIGURATION_MOVED: rebuild against current accepted configuration')
      git(['merge-base', '--is-ancestor', current.appSha, appSha])
    }
    const attestation = process.env.RELEASE_CONTRACT_FILE ? JSON.parse(readFileSync(process.env.RELEASE_CONTRACT_FILE, 'utf8')) : undefined
    const publicPackage = attestation ? await publicPackageProvenance() : undefined
    const manifest = buildManifest({ accepted, attestation, publicPackage, artifacts, appSha, opsSha: process.env.RELEASE_OPS_SHA, sequence: process.env.GITHUB_RUN_NUMBER, runId: process.env.GITHUB_RUN_ID, runAttempt: process.env.GITHUB_RUN_ATTEMPT })
    writeFileSync('release-manifest.json', JSON.stringify(manifest, null, 2))
    const response = await fetch(releaseApiUrl(process.env.RELEASE_API_URL, '/v1/releases', process.env.RELEASE_API_TOKEN), { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20000), headers: { authorization: `Bearer ${process.env.RELEASE_API_TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify(manifest) })
    if (!response.ok) throw new Error(`candidate registration failed: HTTP ${response.status}`)
    writeFileSync('release-submission.json', JSON.stringify(await response.json(), null, 2))
  } else throw new Error('Expected image, verify-attestation-run or submit')
}
