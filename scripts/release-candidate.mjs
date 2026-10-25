import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
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
export function imageArtifact(reference, indexDigest, inspect = ref => JSON.parse(execFileSync('docker', ['buildx', 'imagetools', 'inspect', ref, '--raw'], { encoding: 'utf8' })), configInspect = ref => JSON.parse(execFileSync('docker', ['buildx', 'imagetools', 'inspect', ref, '--format', '{{json .Image}}'], { encoding: 'utf8' }))) {
  if (!/^ghcr\.io\/[a-z0-9_.\/-]+$/.test(reference) || !/^sha256:[a-f0-9]{64}$/.test(indexDigest)) throw new Error('immutable GHCR identity required')
  const index = inspect(`${reference}@${indexDigest}`)
  const platformDigest = index.manifests ? index.manifests.find(item => item.platform?.os === 'linux' && item.platform?.architecture === 'amd64')?.digest : indexDigest
  if (!/^sha256:[a-f0-9]{64}$/.test(platformDigest || '')) throw new Error('linux/amd64 manifest missing')
  const manifest = platformDigest === indexDigest ? index : inspect(`${reference}@${platformDigest}`)
  if (!/^sha256:[a-f0-9]{64}$/.test(manifest.config?.digest || '')) throw new Error('image config identity missing')
  const config = configInspect(`${reference}@${platformDigest}`)
  if (config.os !== 'linux' || config.architecture !== 'amd64' || !config.rootfs?.diff_ids?.length || config.rootfs.diff_ids.some(value => !/^sha256:[a-f0-9]{64}$/.test(value))) throw new Error('image platform/config layers missing')
  return { kind: 'image', digest: indexDigest, ref: `${reference}@${indexDigest}`, indexDigest, platformDigest, configDigest: manifest.config.digest, os: config.os, architecture: config.architecture, diffIds: config.rootfs.diff_ids }
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
    writeFileSync(destination, JSON.stringify(imageArtifact(reference, indexDigest)))
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
