// Test bootstrap diagnostics contain only fixed labels. Never emit subprocess
// stderr, commands, package URLs, database bindings or arbitrary error messages.
const phases = new Set([
  'bootstrap', 'bootstrap.target', 'bootstrap.runtime-load', 'bootstrap.database-connect',
  'bootstrap.database-script', 'bootstrap.archive-download', 'bootstrap.archive-verify',
  'bootstrap.source-copy', 'bootstrap.package-extract', 'bootstrap.historical-dependencies',
  ...['3.8.18', '3.8.19', '3.8.20', '3.8.21', '3.8.22', '3.8.23', '3.8.24', '3.8.25']
    .flatMap(version => ['archive-download', 'archive-verify', 'source-copy', 'package-extract', 'dependencies', 'fixture-run']
      .map(step => `formal${version}.${step}`)),
])
const codes = new Set(['E401', 'E403', 'E404', 'ENOENT', 'ENOSPC', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN',
  'ECONNREFUSED', 'EACCES', 'ERR_MODULE_NOT_FOUND', 'MODULE_NOT_FOUND', 'ERR_ASSERTION', 'BOOTSTRAP_REFUSED',
  'HISTORICAL_DEPENDENCIES_MISSING', 'HISTORICAL_DEPENDENCY_MISMATCH'])
const reasons = new Set(['archive_integrity', 'package_lock_mismatch', 'runtime_schema_mismatch', 'product_history', 'module_missing'])
const packages = new Set(['@lingxi-org/lingxios', '@lyyzka/lingxios', '@langchain/core', '@langchain/langgraph', 'tsx', 'pg', 'officeparser'])
const safePhase = value => phases.has(value) ? value : 'bootstrap'

export function markBootstrapFailure(error, phase) {
  if (error instanceof Error) { error.bootstrapPhase = safePhase(phase); return error }
  return Object.assign(new Error('Test bootstrap failed'), { bootstrapPhase: safePhase(phase) })
}

export function bootstrapFailure(error, phase = 'bootstrap') {
  const output = { testBootstrap: 'refused', phase: safePhase(error?.bootstrapPhase ?? phase), code: 'BOOTSTRAP_REFUSED' }
  const stderr = typeof error?.stderr === 'string' ? error.stderr.slice(-1_048_576) : ''
  // Nested fixture children already produce this bounded, allowlisted record.
  const child = stderr.split('\n').reverse().map(line => {
    if (!line.startsWith('{') || line.length > 4096) return null
    try { const record = JSON.parse(line); return record?.testBootstrap === 'refused' ? record : null } catch { return null }
  }).find(Boolean)
  const text = `${typeof error?.message === 'string' ? error.message.slice(0, 16384) : ''}\n${stderr}`
  const detectedCode = text.match(/\b(?:E401|E403|E404|ENOENT|ENOSPC|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|EACCES|ERR_MODULE_NOT_FOUND|MODULE_NOT_FOUND|ERR_ASSERTION)\b/)?.[0]
  if (codes.has(child?.code)) output.code = child.code
  else if (codes.has(error?.code)) output.code = error.code
  else if (detectedCode) output.code = detectedCode
  const causePhase = child?.causePhase ?? child?.phase
  if (phases.has(causePhase)) output.causePhase = causePhase
  const reason = reasons.has(child?.reason) ? child.reason
    : /source archive integrity changed/.test(text) ? 'archive_integrity'
      : /exact formal runtime package and matching root\/server manifests\/locks required/.test(text) ? 'package_lock_mismatch'
        : /installed LingxiOS package\/schema mismatch/.test(text) ? 'runtime_schema_mismatch'
          : /requires already installed product/.test(text) ? 'product_history'
            : /Cannot find (?:package|module)/.test(text) ? 'module_missing' : undefined
  if (reason) output.reason = reason
  const missingPackage = text.match(/Cannot find (?:package|module) ['"]([^'"]+)['"]/)?.[1]
  if (packages.has(child?.package)) output.package = child.package
  else if (packages.has(error?.dependency)) output.package = error.dependency
  else if (packages.has(missingPackage)) output.package = missingPackage
  return output
}

export const escapeWorkflowCommandData = value => value.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')

export function bootstrapFailureAnnotation(failure, githubActions = process.env.GITHUB_ACTIONS) {
  if (githubActions !== 'true') return null
  // Revalidate the already-filtered record; extra fields never enter annotations.
  const fields = [`phase=${safePhase(failure?.phase)}`, `code=${codes.has(failure?.code) ? failure.code : 'BOOTSTRAP_REFUSED'}`]
  if (phases.has(failure?.causePhase)) fields.push(`causePhase=${failure.causePhase}`)
  if (packages.has(failure?.package)) fields.push(`package=${failure.package}`)
  return `::error title=Runtime test bootstrap failed::${escapeWorkflowCommandData(fields.join('; '))}`
}
