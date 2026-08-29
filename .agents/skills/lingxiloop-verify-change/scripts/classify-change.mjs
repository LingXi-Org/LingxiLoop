#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const TIER_ORDER = new Map([
  ['required', 0],
  ['recommended', 1],
  ['ci-only', 2],
])

const EVAL_DASHBOARD_PATHS = new Set([
  'src/admin/EvalPage.tsx',
])

function isEvalPath(path) {
  return path.startsWith('eval/')
    || path.startsWith('server/src/eval/')
    || /^server\/src\/__(tests|integration)__\/eval(?:-|\.)/.test(path)
    || /^scripts\/run-agent-(?:runtime-)?eval\.ts$/.test(path)
    || path === 'docs/agent-eval.md'
    || EVAL_DASHBOARD_PATHS.has(path)
    || path.startsWith('.agents/skills/lingxiloop-eval-change/')
}

function isExecutableEvalPath(path) {
  return isEvalPath(path)
    && !path.endsWith('.md')
    && !path.startsWith('.agents/skills/')
}

function isCiSelectorPath(path) {
  return path.startsWith('.github/workflows/')
    || path.startsWith('.agents/skills/lingxiloop-verify-change/')
}

function isFullMatrixPath(path) {
  return isCiSelectorPath(path) || ['package.json', 'package-lock.json'].includes(path)
}

const CATEGORY_DEFINITIONS = [
  {
    id: 'docs',
    reason: 'Documentation, contributor guidance, or repository-local Agent Skills changed.',
    matches: (path) => path.startsWith('docs/')
      || path.startsWith('.agents/skills/')
      || /^(README|CONTRIBUTING|SECURITY|THIRD_PARTY_NOTICES)\.md$/.test(path),
  },
  {
    id: 'eval',
    reason: 'Agent Eval suites, harnesses, runtime smoke, persistence, Dashboard, or Eval guidance changed.',
    matches: isEvalPath,
  },
  {
    id: 'frontend',
    reason: 'Browser, website, assets, or frontend build inputs changed.',
    matches: (path) => path.startsWith('src/')
      || path.startsWith('public/')
      || path.startsWith('website/')
      || ['index.html', 'vite.config.ts', 'tailwind.config.ts', 'postcss.config.js'].includes(path),
  },
  {
    id: 'server',
    reason: 'Server runtime, tests, scripts, or service packaging changed.',
    matches: (path) => path.startsWith('server/'),
  },
  {
    id: 'agent-os-im-canvas',
    reason: 'Agent OS, learning-agent services, IM, Canvas, or message-stream contracts changed.',
    matches: (path) => path.startsWith('server/src/agent-os/')
      || path.startsWith('server/agent-os/')
      || path.startsWith('server/src/agents/')
      || path.startsWith('server/src/im/')
      || path.startsWith('server/src/canvas/')
      || path === 'server/src/messages/stream-reply.ts'
      || /^server\/src\/__tests__\/(agent-os|agents-|wukong|mentions|reply-stream|canvas|coworker-activity)/.test(path)
      || /^server\/src\/__integration__\/(agent-os|agent-mute|canvas|polls)/.test(path)
      || path.startsWith('src/lib/im/')
      || path === 'src/stores/messages.ts'
      || ['docs/COORDINATION.md', 'docs/RUNTIME_EVENT_STREAM.md', 'docs/CANVAS.md'].includes(path),
  },
  {
    id: 'database-tenant',
    reason: 'Schema, persistence, authentication, tenant resolution, or tenant-owned API behavior changed.',
    matches: (path) => path.startsWith('server/src/db/')
      || path.startsWith('server/src/api/')
      || path === 'server/src/db-gc.ts'
      || path === 'server/src/migrate-bin.ts'
      || path === 'server/src/tenant.ts'
      || path === 'server/src/auth.ts'
      || path === 'server/src/admin.ts'
      || path === 'server/src/onboardCompany.ts',
  },
  {
    id: 'workers',
    reason: 'A Cloudflare Worker implementation or its configuration changed.',
    matches: (path) => path.startsWith('workers/'),
  },
  {
    id: 'vendored',
    reason: 'Vendored source, provenance, or vendor-scoped tests changed.',
    matches: (path) => path.startsWith('third_party/'),
  },
  {
    id: 'build-release',
    reason: 'Build, dependency, CI, Compose, desktop, mobile, version, or release machinery changed.',
    matches: (path) => path.startsWith('.github/workflows/')
      || path.startsWith('electron/')
      || path.startsWith('android/')
      || path.startsWith('ios/')
      || path.startsWith('server/docker/')
      || /^docker-compose\..+\.yml$/.test(path)
      || ['package.json', 'package-lock.json', 'VERSION', 'ecosystem.config.cjs'].includes(path)
      || /^scripts\/(release|rollback|deploy|prepare|verify|sync-version)/.test(path),
  },
]

function normalizePath(value) {
  return value.replaceAll('\\', '/').replace(/^\.\//, '').trim()
}

function uniqueSorted(values) {
  return [...new Set(values.map(normalizePath).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'en'))
}

function primaryDomain(path) {
  const matched = new Set(CATEGORY_DEFINITIONS.filter((definition) => definition.matches(path)).map(({ id }) => id))
  for (const id of ['vendored', 'workers', 'eval', 'build-release', 'agent-os-im-canvas', 'database-tenant', 'frontend', 'server', 'docs']) {
    if (matched.has(id)) return id
  }
  return 'other'
}

function addCheck(checks, command, tier, reason, cwd = '.') {
  const key = `${cwd}\0${command}`
  const existing = checks.get(key)
  if (!existing) {
    checks.set(key, { command, tier, reasons: [reason], ...(cwd === '.' ? {} : { cwd }) })
    return
  }
  if (TIER_ORDER.get(tier) < TIER_ORDER.get(existing.tier)) existing.tier = tier
  if (!existing.reasons.includes(reason)) existing.reasons.push(reason)
}

export function buildCiPlan(inputPaths) {
  const paths = uniqueSorted(inputPaths)
  const evalChanged = paths.some(isEvalPath)
  const evalRuntime = paths.some(isExecutableEvalPath)
  // Fail closed: only Eval-owned files can prove a focused Eval change.
  // Shared runtime, DB, API, package and CI files may contain unrelated
  // hunks, so path classification alone must never exempt their owning tests.
  const evalFocused = evalChanged && paths.every(isEvalPath)
  const fullMatrix = paths.some(isFullMatrixPath)
  const evalPersistence = paths.some((path) => path === 'server/src/__integration__/eval.test.ts'
    || path === 'server/src/db/schema.sql'
    || path === 'server/src/db/bootstrap.ts'
    || path === 'server/src/api/admin-router.ts'
    || path.startsWith('server/src/eval/'))
  const dashboard = paths.some((path) => EVAL_DASHBOARD_PATHS.has(path))
  const openNotebook = paths.some((path) => path.startsWith('third_party/open-notebook/'))
  const composeInputs = paths.some((path) => /^docker-compose\..+\.yml$/.test(path)
    || path.startsWith('server/docker/')
    || path === 'server/scripts/mvp-smoke.ts')
  const desktop = paths.some((path) => path.startsWith('electron/')
    || path.startsWith('build/')
    || path === '.github/workflows/desktop-release.yml'
    || /^scripts\/(prepare-electron-package|verify-desktop-package|sync-electron)/.test(path))
  const frontend = paths.some((path) => CATEGORY_DEFINITIONS.find(({ id }) => id === 'frontend').matches(path))
  const server = paths.some((path) => CATEGORY_DEFINITIONS.find(({ id }) => id === 'server').matches(path))
  const agentOs = paths.some((path) => CATEGORY_DEFINITIONS.find(({ id }) => id === 'agent-os-im-canvas').matches(path))
  const database = paths.some((path) => CATEGORY_DEFINITIONS.find(({ id }) => id === 'database-tenant').matches(path))
  const buildRelease = paths.some((path) => CATEGORY_DEFINITIONS.find(({ id }) => id === 'build-release').matches(path))
  const integrationInfrastructure = paths.some((path) => path === 'server/run-integration-tests.mjs'
    || path === 'server/src/__integration__/_helpers.ts')
  return {
    eval: evalChanged,
    evalRuntime,
    evalFocused,
    fullMatrix,
    evalPersistence,
    dashboard,
    frontend,
    server,
    agentOs,
    database,
    integrationInfrastructure,
    buildRelease,
    openNotebook,
    compose: composeInputs || (agentOs && !evalFocused),
    desktop,
    build: dashboard || (frontend && !evalFocused) || (buildRelease && !evalFocused),
    fullUnit: !evalFocused && (frontend || server || agentOs || database || buildRelease),
    integration: evalFocused && evalPersistence
      ? 'eval'
      : database || agentOs || integrationInfrastructure ? 'full' : 'none',
  }
}

function selectChecks(paths, categoryIds, escalations, ci) {
  const checks = new Map()
  const has = (id) => categoryIds.has(id)

  if (paths.length > 0) {
    addCheck(checks, 'npm run guard:brand', 'required', 'The brand guard scans every tracked and untracked text path.')
  }

  if (has('frontend') || has('server') || has('workers')) {
    addCheck(checks, 'npm run guard:architecture', 'required', 'Production code must preserve vertical boundaries and single-authority paths.')
  }

  if (paths.some(isCiSelectorPath)) {
    addCheck(
      checks,
      'node --test .agents/skills/lingxiloop-verify-change/scripts/classify-change.test.mjs',
      'required',
      'The verification selector changed; run its small deterministic contract suite locally.',
    )
  }

  if (has('eval') && ci.evalRuntime) {
    addCheck(checks, 'npm run lint:local', 'required', 'Changed Eval files must satisfy Biome without scanning the repository.')
    addCheck(checks, 'npm run server:typecheck', 'required', 'Eval contracts, runtime observation, and persistence are server typed.')
    addCheck(checks, 'npm run test:eval', 'required', 'Run focused evaluator, trace, harness, and deterministic Agent runtime tests.')
    addCheck(checks, 'npm run eval:check', 'ci-only', 'CI owns the full frozen-harness and Agent OS deterministic regression gate.')
    addCheck(checks, 'npm run guard:agent-os', 'required', 'The runtime Eval must continue through the strict Agent OS and IPython boundary.')
    if (ci.evalPersistence) {
      addCheck(checks, 'npm run test:integration:eval', 'ci-only', 'CI owns the PostgreSQL/Redis Eval persistence contract.')
    }
    if (ci.dashboard) {
      addCheck(checks, 'npm run typecheck', 'required', 'The Eval Dashboard is part of the frontend TypeScript graph.')
      addCheck(checks, 'npm run build', 'ci-only', 'CI bundles the changed Eval Dashboard surface.')
    }
  }

  if (has('frontend')) {
    addCheck(checks, 'npm run lint:local', 'required', 'Changed frontend files must satisfy Biome without scanning the repository.')
    addCheck(checks, 'npm run typecheck', 'required', 'Frontend types or bundler inputs changed.')
    if (!ci.evalFocused) addCheck(checks, 'npm run test:local', 'required', 'Run changed, sibling, feature-owned, and frontend architecture unit tests only.')
    if (!ci.evalFocused) addCheck(checks, 'npm run build', 'ci-only', 'CI confirms the complete Vite production bundle.')
  }

  if (has('server')) {
    addCheck(checks, 'npm run lint:local', 'required', 'Changed server files must satisfy Biome without scanning the repository.')
    addCheck(checks, 'npm run server:typecheck', 'required', 'Server runtime types changed.')
    if (!ci.evalFocused) addCheck(checks, 'npm run test:local', 'required', 'Run changed, sibling, domain-owned, and server architecture unit tests only.')
    addCheck(checks, 'npm run guard:llm-tracked', 'required', 'Server cloud LLM calls must remain behind the universal ledger boundary.')
  }

  if (has('agent-os-im-canvas')) {
    addCheck(checks, 'npm run guard:agent-os', 'required', 'The Agent OS composition and strict IPython tool boundary changed or is adjacent.')
    addCheck(checks, 'npm run guard:llm-tracked', 'required', 'Agent runtime LLM usage must remain in the universal ledger.')
    addCheck(checks, 'npm run server:typecheck', 'required', 'Agent OS, IM, Canvas, or Host Bridge types changed.')
    if (!ci.evalFocused) {
      addCheck(checks, 'npm run test:local', 'required', 'Run only the owning Agent OS, IM, Canvas, and architecture unit regressions.')
      addCheck(checks, 'npm run test:integration', 'ci-only', 'CI owns durable work, IM, Canvas, and recovery integration coverage.')
      addCheck(checks, 'npm run mvp:ci:smoke', 'ci-only', 'The isolated Compose smoke proves WuKong, durable work, IPython, and final reply together.')
    }
  }

  if (has('database-tenant')) {
    addCheck(checks, 'npm run server:typecheck', 'required', 'Persistence and tenant contracts are server typed.')
    if (!ci.evalFocused) {
      addCheck(checks, 'npm run test:local', 'required', 'Run only owning schema, tenant, and architecture unit regressions.')
      addCheck(checks, 'npm run test:integration', 'ci-only', 'CI owns schema, transaction, authorization, and tenant-isolation integration evidence.')
    }
  }

  if (has('workers')) {
    addCheck(checks, 'npm run lint:local', 'required', 'Changed Worker files must satisfy Biome without scanning the repository.')
    addCheck(checks, 'npm run test:local', 'required', 'Run changed and worker-owned unit tests only.')
    const workerNames = new Set(paths
      .filter((path) => path.startsWith('workers/'))
      .map((path) => path.split('/')[1])
      .filter(Boolean))
    for (const name of [...workerNames].sort()) {
      addCheck(checks, `npx tsc -p workers/${name}/tsconfig.json --noEmit`, 'recommended', `Typecheck the changed ${name} Worker with its own configuration.`)
    }
  }

  if (has('vendored')) {
    if (paths.some((path) => path.startsWith('third_party/open-notebook/'))) {
      addCheck(
        checks,
        'python -m pytest -q tests/test_lingxiloop_native_scope.py',
        'ci-only',
        'CI verifies the vendored Open Notebook native-scope contract in its provisioned Python environment.',
        'third_party/open-notebook',
      )
    }
  }

  if (has('build-release')) {
    addCheck(checks, 'npm run lint:local', 'required', 'Changed build and release files must satisfy Biome without scanning the repository.')
    if (!ci.evalFocused) {
      addCheck(checks, 'npm run build', 'ci-only', 'CI owns full build, dependency, and packaging verification.')
    }
    if (paths.some((path) => ['VERSION', 'package.json', 'package-lock.json'].includes(path))) {
      addCheck(checks, 'npm run version:check', 'required', 'VERSION, package manifest, and lockfile must agree.')
    }
    if (ci.desktop) {
      addCheck(checks, 'npm run electron:prepare', 'ci-only', 'Prepare the isolated desktop package before platform layout smoke.')
      addCheck(checks, 'node scripts/verify-desktop-package.mjs release', 'ci-only', 'Verify packaged Electron output excludes server/runtime sources and secrets.')
    }
    if (ci.compose) {
      addCheck(checks, 'npm run mvp:ci:smoke', 'ci-only', 'CI Compose smoke covers multi-service packaging and runtime integration.')
    }
  }

  if (escalations.some(({ id }) => id === 'ci-full-matrix')) {
    for (const [command, reason] of [
      ['npm test', 'CI runs the full unit suite for a high-risk or verification-selector diff.'],
      ['npm run build', 'CI runs the production build for a high-risk or verification-selector diff.'],
      ['npm run test:integration', 'CI runs the service-backed integration suite for a high-risk or verification-selector diff.'],
    ]) addCheck(checks, command, 'ci-only', reason)
  }

  return [...checks.values()]
    .map((check) => ({ ...check, reasons: [...check.reasons].sort((a, b) => a.localeCompare(b, 'en')) }))
    .sort((a, b) => TIER_ORDER.get(a.tier) - TIER_ORDER.get(b.tier)
      || (a.cwd ?? '.').localeCompare(b.cwd ?? '.', 'en')
      || a.command.localeCompare(b.command, 'en'))
}

export function classifyPaths(inputPaths) {
  const paths = uniqueSorted(inputPaths)
  const ci = buildCiPlan(paths)
  const categories = CATEGORY_DEFINITIONS.map((definition) => {
    const matchedPaths = paths.filter(definition.matches)
    return matchedPaths.length === 0 ? null : {
      id: definition.id,
      paths: matchedPaths,
      reasons: [definition.reason],
    }
  }).filter(Boolean)
  const categoryIds = new Set(categories.map(({ id }) => id))
  const escalations = []

  const selectorPaths = paths.filter(isCiSelectorPath)
  if (selectorPaths.length > 0) {
    escalations.push({
      id: 'ci-selector-change',
      reason: 'CI workflow or its change classifier changed; exercise the full matrix before trusting the new selector.',
      paths: selectorPaths,
    })
  }

  const bootstrapPaths = paths.filter((path) => path === 'server/src/db/schema.sql'
    || path === 'server/src/db/bootstrap.ts'
    || path === 'server/src/bootstrap-bin.ts'
    || path === 'server/src/db/migrate.ts'
    || path === 'server/src/migrate-bin.ts'
    || path.startsWith('server/src/scripts/migrate-')
    || /(^|\/)migrations?\//.test(path))
  if (bootstrapPaths.length > 0 && !ci.evalFocused) {
    escalations.push({
      id: 'v1-schema-bootstrap',
      reason: 'The reset-only v1 schema bootstrap changed; verify empty-database initialization, completeness checks, and rejection of legacy schemas.',
      paths: bootstrapPaths,
    })
  }

  const releasePaths = paths.filter((path) => CATEGORY_DEFINITIONS.find(({ id }) => id === 'build-release').matches(path))
  if (releasePaths.length > 0 && !ci.evalFocused) {
    escalations.push({
      id: 'build-release-surface',
      reason: 'Credentialed CI, dependency, platform packaging, version, or release behavior changed.',
      paths: releasePaths,
    })
  }

  const vendorPaths = paths.filter((path) => CATEGORY_DEFINITIONS.find(({ id }) => id === 'vendored').matches(path))
  if (vendorPaths.length > 0) {
    escalations.push({
      id: 'vendored-source',
      reason: 'Vendored code requires provenance review and vendor-scoped tests.',
      paths: vendorPaths,
    })
  }

  const domains = new Set(paths.map(primaryDomain).filter((id) => !['docs', 'other'].includes(id)))
  if (domains.size >= 2 && !ci.evalFocused) {
    escalations.push({
      id: 'cross-domain',
      reason: `The diff crosses primary domains: ${[...domains].sort().join(', ')}.`,
      paths,
    })
  }

  if (escalations.some(({ id }) => ['ci-selector-change', 'v1-schema-bootstrap', 'build-release-surface', 'vendored-source', 'cross-domain'].includes(id))) {
    escalations.push({
      id: 'ci-full-matrix',
      reason: 'CI must run the exhaustive matrix; local verification remains limited to fast static checks and focused owning tests.',
      paths,
    })
  }

  const sortedEscalations = escalations
    .map((item) => ({ ...item, paths: uniqueSorted(item.paths) }))
    .sort((a, b) => a.id.localeCompare(b.id, 'en'))

  return {
    paths,
    categories,
    checks: selectChecks(paths, categoryIds, sortedEscalations, ci),
    escalations: sortedEscalations,
    ci,
  }
}

export function buildReport(paths, scope) {
  const classified = classifyPaths(paths)
  return {
    version: 4,
    scope,
    paths: classified.paths,
    categories: classified.categories,
    checks: classified.checks,
    escalations: classified.escalations,
    ci: classified.ci,
  }
}

export function renderText(report) {
  const lines = [
    'LingxiLoop change classification',
    `Scope: ${report.scope.mode}`,
  ]
  if (report.scope.base) lines.push(`Base: ${report.scope.base.ref} (${report.scope.base.oid})`)
  if (report.scope.head) lines.push(`Head: ${report.scope.head.ref} (${report.scope.head.oid})`)
  if (report.scope.mergeBase) lines.push(`Merge base: ${report.scope.mergeBase}`)
  lines.push(`Changed paths: ${report.paths.length}`)
  for (const path of report.paths) lines.push(`  - ${path}`)

  lines.push('Categories:')
  if (report.categories.length === 0) lines.push('  - none')
  for (const category of report.categories) lines.push(`  - ${category.id}: ${category.paths.length} path(s)`)

  lines.push('Checks:')
  if (report.checks.length === 0) lines.push('  - none')
  for (const check of report.checks) {
    const cwd = check.cwd ? ` [cwd: ${check.cwd}]` : ''
    lines.push(`  - ${check.tier}: ${check.command}${cwd}`)
    for (const reason of check.reasons) lines.push(`      ${reason}`)
  }

  lines.push('Escalations:')
  if (report.escalations.length === 0) lines.push('  - none')
  for (const escalation of report.escalations) lines.push(`  - ${escalation.id}: ${escalation.reason}`)
  lines.push(`CI plan: ${JSON.stringify(report.ci)}`)
  return `${lines.join('\n')}\n`
}

function runGit(args) {
  const result = spawnSync('git', args, {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim()
    throw new Error(`git ${args.join(' ')} failed${detail ? `: ${detail}` : ''}`)
  }
  return result.stdout
}

function resolveCommit(ref) {
  return runGit(['rev-parse', '--verify', `${ref}^{commit}`]).trim()
}

function zeroSeparatedPaths(output) {
  return output.split('\0').map(normalizePath).filter(Boolean)
}

function worktreePaths() {
  return uniqueSorted([
    ...zeroSeparatedPaths(runGit(['diff', '--name-only', '-z', 'HEAD', '--'])),
    ...zeroSeparatedPaths(runGit(['ls-files', '--others', '--exclude-standard', '-z'])),
  ])
}

function usage() {
  return `Usage: node classify-change.mjs [--base <ref>] [--head <ref>] [--include-worktree] [--format text|json]\n`
}

export function parseArgs(argv) {
  const options = { format: 'text', includeWorktree: false }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--help' || argument === '-h') return { ...options, help: true }
    if (argument === '--include-worktree') {
      options.includeWorktree = true
      continue
    }
    if (argument === '--base' || argument === '--head' || argument === '--format') {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value`)
      options[argument.slice(2)] = value
      index += 1
      continue
    }
    throw new Error(`unknown argument: ${argument}`)
  }
  if (options.head && !options.base) throw new Error('--head requires --base')
  if (!['text', 'json'].includes(options.format)) throw new Error('--format must be text or json')
  return options
}

function reportFromGit(options) {
  if (!options.base) {
    return buildReport(worktreePaths(), { mode: 'worktree' })
  }

  const headRef = options.head ?? 'HEAD'
  const baseOid = resolveCommit(options.base)
  const headOid = resolveCommit(headRef)
  const mergeBase = runGit(['merge-base', baseOid, headOid]).trim()
  const committedPaths = zeroSeparatedPaths(runGit(['diff', '--name-only', '-z', mergeBase, headOid, '--']))
  const localPaths = options.includeWorktree ? worktreePaths() : []
  return buildReport([...committedPaths, ...localPaths], {
    mode: options.includeWorktree ? 'range+worktree' : 'range',
    base: { ref: options.base, oid: baseOid },
    head: { ref: headRef, oid: headOid },
    mergeBase,
  })
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2))
    if (options.help) {
      process.stdout.write(usage())
      return
    }
    const report = reportFromGit(options)
    process.stdout.write(options.format === 'json' ? `${JSON.stringify(report, null, 2)}\n` : renderText(report))
  } catch (error) {
    process.stderr.write(`[classify-change] ${error instanceof Error ? error.message : String(error)}\n`)
    process.stderr.write(usage())
    process.exitCode = 2
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()
