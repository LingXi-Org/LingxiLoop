import { appendFileSync, existsSync } from 'node:fs'
import { basename } from 'node:path'
import { SMOKE_FILES } from '../server/integration-suite.mjs'
import { runtimeSharedPaths } from './ci-scope-paths.mjs'

// Core boundaries run for ordinary server changes. Extra owning tests are
// explicit and local to the changed domain; only manual deep runs expand all.
const HISTORICAL_FILES = [
  'migration.test.ts', 'conversation-repair-provenance-migration.test.ts',
  'public-purpose-reader-migration.test.ts', 'run-trace-provenance-migration.test.ts',
  'run-presentation-contract.test.ts', 'runtime-patch-provenance.test.ts',
]
const OWNERS = [
  [/^server\/src\/(?:db\/runtime-patch\.ts|runtime-patch-bin\.ts)$/, ['runtime-patch58-provenance.test.ts']],
  [/^server\/src\/modules\/(?:cases|case-covers)\/|^src\/features\/cases\/cover-vm\/(?:runtime|protocol|program|guest-source|svg)\.ts$/, ['case-covers.test.ts']],
  [/^server\/(?:src\/db\/|src\/migrate-bin\.ts$|package(?:-lock)?\.json$|fixtures\/|run-historical-migration-tests\.mjs$)/, HISTORICAL_FILES],
  [/^server\/src\/(?:auth\.ts|tenant\.ts|http\/|domain\/(?:access|entitlement|identity|tenancy)\/|modules\/(?:access|identity|entitlements|trust)\/)/, ['trust-bff.test.ts']],
  [/^server\/src\/(?:agent-runtime\/|runtime\/|worker\.ts|bin\/worker\.ts)/, ['runtime-chat-recovery.test.ts', 'native-authorization-faults.test.ts']],
  [/^server\/src\/(?:im\/|modules\/(?:messages|conversations|context-threads)\/)|^src\/lib\/(?:nativeMessage|answerSegment)\.ts$/, ['im-send-reconciliation.test.ts', 'conversations.test.ts']],
  [/^server\/src\/(?:agents\/|modules\/agents\/)/, ['agents-vertical-slice.test.ts']],
  [/^server\/src\/(?:learning\/|domain\/education\/|modules\/(?:learning|education)\/)/, ['homework.test.ts', 'course-teacher-assignment.test.ts']],
  [/^server\/src\/(?:domain\/(?:project|transfer)\/|modules\/(?:projects|platform|platform-operations)\/)/, ['project-lifecycle-concurrency.test.ts', 'platform-lifecycle.test.ts']],
  [/^server\/src\/modules\/(?:companies|enterprise)\//, ['companies-vertical-slice.test.ts', 'enterprise-governance.test.ts']],
  [/^server\/src\/(?:modules\/(?:knowledge|research|evidence)\/|knowledge)/, ['knowledge-vertical-slice.test.ts']],
  [/^server\/src\/modules\/memory\/|^server\/src\/agent-runtime\/memory-/, ['native-memory.test.ts']],
  [/^server\/src\/modules\/artifacts\//, ['artifact-app-boundary.test.ts']],
  [/^server\/src\/modules\/(?:documents|content-editor)\//, ['runtime-objects.test.ts']],
  [/^server\/src\/(?:llm-ledger|llm|llm-client)\.ts$|^server\/src\/agent-runtime\/pricing\.ts$/, ['model-pricing.test.ts', 'native-admission.test.ts']],
  [/^server\/src\/agent-runtime\/(?:visualize-|system-skills|skill-context)|^src\/features\/chat\/visualize\/|^shared\/visualize-public-resources\.ts$|^third_party\/zcode\/|^scripts\/(?:verify-zcode-visualize|build-visualize-runtime)\.mjs$/, ['visualize-delivery.test.ts', 'visualize-quality-contract.test.ts']],
]
function paths(value, label) {
  if (!Array.isArray(value) || value.some(path => typeof path !== 'string' || !path ||
    path.startsWith('/') || path.includes('\\') || /[\x00-\x1f]/.test(path) || path.split('/').some(part => ['', '.', '..'].includes(part)))) {
    throw new Error(`${label} must be an array of repository-relative paths`)
  }
  return value
}
function integrationScope(changed, { serverSource, deepIntegration, deployment }) {
  const sourcePaths = paths(changed.serverSourceFiles === undefined ? [] : changed.serverSourceFiles, 'server source paths')
  const runnerPaths = paths(changed.integrationRunnerFiles === undefined ? [] : changed.integrationRunnerFiles, 'integration runner paths')
  const requested = paths(changed.integrationFiles === undefined ? [] : changed.integrationFiles, 'integration paths')
  if (requested.some(file => !/^server\/src\/__integration__\/[^/]+\.test\.ts$/.test(file))) throw new Error('Invalid integration test path')
  const enabled = serverSource || changed.integrationRunner === true || changed.integrationTests === true || deepIntegration || deployment
  if (deepIntegration) return { integration: true, integration_mode: 'full', integration_files: [] }
  if (!enabled) return { integration: false, integration_mode: 'smoke', integration_files: [] }
  const owners = new Set()
  for (const [pattern, files] of OWNERS) if ([...sourcePaths, ...runnerPaths].some(path => pattern.test(path))) {
    for (const file of files) owners.add(file)
  }
  if (deployment) { owners.add('runtime-patch-provenance.test.ts'); owners.add('runtime-patch58-provenance.test.ts') }
  const changedTests = requested.filter(existsSync).map(file => basename(file))
  // A pure test edit runs its surviving files. Deleted-only edits still verify
  // the core, rather than interpreting [] as a full-suite request.
  if (!serverSource && !changed.integrationRunner && !deployment && !owners.size && changedTests.length) {
    return { integration: true, integration_mode: 'selected', integration_files: [...new Set(changedTests)] }
  }
  if (!owners.size && !changedTests.length) return { integration: true, integration_mode: 'smoke', integration_files: [] }
  const selected = [...new Set([...SMOKE_FILES, ...owners, ...changedTests])]
  for (const file of selected) if (!existsSync(`server/src/__integration__/${file}`)) throw new Error(`Missing integration owner: ${file}`)
  return { integration: true, integration_mode: 'selected', integration_files: selected }
}

export function computeScope(changed = {}, manual = '') {
  if (manual) {
    if (!['web', 'admin-control', 'server', 'open-notebook', 'wukongim', 'gateway', 'deployment', 'release', 'deep-integration'].includes(manual)) {
      throw new Error(`unknown CI scope: ${manual}`)
    }
    changed = {
      web: manual === 'web',
      admin: manual === 'admin-control',
      control: manual === 'admin-control',
      serverSource: manual === 'server',
      openNotebook: manual === 'open-notebook',
      wukongim: manual === 'wukongim',
      gateway: manual === 'gateway',
      deployment: manual === 'deployment',
      release: manual === 'release',
    }
  }
  const enabled = (name) => changed[name] === true
  const release = enabled('release')
  const shared = enabled('sharedFrontend')
  const lintConfig = enabled('lintConfig')
  const runner = enabled('testRunner')
  const webBuild = enabled('web') || shared || release
  const adminBuild = enabled('admin') || shared
  const web = webBuild || enabled('webTests') || runner || lintConfig
  const admin = adminBuild || enabled('adminTests') || runner || lintConfig
  const controlSource = enabled('control') || shared
  const control = controlSource || enabled('controlTests') || lintConfig
  const serverSource = enabled('serverSource') || shared || release
  const server = serverSource || enabled('server') || enabled('serverTests') || runner || lintConfig
  const deepIntegration = manual === 'deep-integration'
  const integrationSelection = integrationScope(changed, { serverSource, deepIntegration, deployment: enabled('deployment') })
  const openNotebook = enabled('openNotebook') || enabled('openNotebookTests') || release
  const deployment = enabled('deployment')
  const deployContract = serverSource || deployment || enabled('ci') || enabled('serverDocker') || enabled('wukongim') || enabled('gateway') || openNotebook || release
  const checkJobs = []
  if (web) checkJobs.push({ component: 'web' })
  if (admin) checkJobs.push({ component: 'admin' })
  if (control) checkJobs.push({ component: 'control' })
  if (server) checkJobs.push({ component: 'server' })
  if (openNotebook) checkJobs.push({ component: 'open-notebook' })
  if (deployContract) checkJobs.push({ component: 'deploy-contract' })
  if (release) checkJobs.push({ component: 'release' })

  return {
    web, web_build: webBuild,
    admin, admin_build: adminBuild,
    control, server, ...integrationSelection,
    deep_integration: deepIntegration,
    open_notebook: openNotebook,
    deployment,
    deploy_contract: deployContract,
    control_deploy: adminBuild || controlSource,
    control_migrations: enabled('controlMigrations'),
    release,
    checks: [web, admin, control, server, deployContract].some(Boolean),
    check_jobs: checkJobs,
  }
}

if (process.argv[1]?.endsWith('ci-scope.mjs')) {
  const changed = Object.fromEntries([
    'sharedFrontend', 'lintConfig', 'testRunner', 'web', 'webTests', 'admin', 'adminTests',
    'control', 'controlTests', 'server', 'serverTests', 'serverSource', 'serverDocker',
    'integrationRunner', 'integrationTests', 'openNotebook', 'openNotebookTests',
    'wukongim', 'gateway', 'deployment', 'controlMigrations', 'release',
  ].map((name) => [name, process.env[name.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase()] === 'true']))
  changed.ci = process.env.CI_CONFIG === 'true'
  changed.integrationFiles = JSON.parse(process.env.INTEGRATION_FILES || '[]')
  changed.serverSourceFiles = JSON.parse(process.env.SERVER_SOURCE_FILES || '[]')
  changed.integrationRunnerFiles = JSON.parse(process.env.INTEGRATION_RUNNER_FILES || '[]')
  const sharedRuntime = runtimeSharedPaths()
  const webFiles = JSON.parse(process.env.WEB_FILES || '[]').filter(path => sharedRuntime.has(path))
  if (webFiles.length) { changed.serverSource = true; changed.serverSourceFiles.push(...webFiles) }
  const result = computeScope(changed, process.env.EVENT === 'workflow_dispatch' ? process.env.MANUAL_SCOPE : '')
  const lines = Object.entries(result).map(([name, value]) => {
    if (name === 'check_jobs') return `${name}=${JSON.stringify({ include: value })}`
    return `${name}=${Array.isArray(value) ? JSON.stringify(value) : value}`
  })
  appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`)
}
