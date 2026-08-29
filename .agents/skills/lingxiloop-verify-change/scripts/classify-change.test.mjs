import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { parseBaseArgument, parseScopeArguments } from '../../../../scripts/changed-paths.mjs'
import { buildCiPlan, buildReport, classifyPaths, parseArgs, renderText } from './classify-change.mjs'

const script = fileURLToPath(new URL('./classify-change.mjs', import.meta.url))

function check(report, command) {
  return report.checks.find((item) => item.command === command)
}

function category(report, id) {
  return report.categories.find((item) => item.id === id)
}

function run(command, arguments_, cwd) {
  const result = spawnSync(command, arguments_, { cwd, encoding: 'utf8', windowsHide: true })
  if (result.error) throw result.error
  return result
}

test('classifies docs-only changes without build evidence', () => {
  const report = classifyPaths(['docs/CANVAS.md', 'README.md'])
  assert.ok(category(report, 'docs'))
  assert.equal(category(report, 'frontend'), undefined)
  assert.equal(check(report, 'npm run guard:brand')?.tier, 'required')
  assert.equal(check(report, 'npm run build'), undefined)
  assert.equal(report.escalations.length, 0)
})

test('classifies ordinary frontend changes with direct local evidence and a CI build', () => {
  const report = classifyPaths(['src/components/AppShell.tsx'])
  assert.ok(category(report, 'frontend'))
  assert.equal(check(report, 'npm run guard:architecture'), undefined)
  assert.equal(check(report, 'npm run lint:local')?.tier, 'required')
  assert.equal(check(report, 'npm run typecheck'), undefined)
  assert.equal(check(report, 'npm run test:local')?.tier, 'required')
  assert.equal(check(report, 'npm run build')?.tier, 'ci-only')
  assert.equal(check(report, 'npm test'), undefined)
})

test('runs Agent OS and LLM guards only for their authoritative contracts', () => {
  const report = classifyPaths([
    'server/src/agent-os/runtime.ts',
    'server/src/__tests__/agent-os-runtime.test.ts',
  ])
  assert.ok(category(report, 'server'))
  assert.ok(category(report, 'agent-os-im-canvas'))
  assert.equal(check(report, 'npm run guard:agent-os')?.tier, 'required')
  assert.equal(check(report, 'npm run guard:llm-tracked'), undefined)
  const modelReport = classifyPaths(['server/src/agent-os/model-driver.ts'])
  assert.equal(check(modelReport, 'npm run guard:llm-tracked')?.tier, 'required')
  assert.equal(report.escalations.some(({ id }) => id === 'cross-domain'), false)
})

test('runs global type and architecture checks only for canonical inputs', () => {
  const ordinaryServer = classifyPaths(['server/src/modules/identity/application.ts'])
  assert.equal(check(ordinaryServer, 'npm run server:typecheck'), undefined)
  assert.equal(check(ordinaryServer, 'npm run guard:architecture'), undefined)

  const publicContract = classifyPaths(['server/src/modules/identity/public.ts'])
  assert.equal(check(publicContract, 'npm run server:typecheck')?.tier, 'required')
  assert.equal(check(publicContract, 'npm run guard:architecture')?.tier, 'required')

  const frontendContract = classifyPaths(['src/api/contracts.ts'])
  assert.equal(check(frontendContract, 'npm run typecheck')?.tier, 'required')
  assert.equal(check(frontendContract, 'npm run guard:architecture'), undefined)
})

test('content inspection can request the LLM guard without making all server files global gates', () => {
  const report = classifyPaths(['server/src/modules/example/application.ts'], { llmProviderCall: true })
  assert.equal(check(report, 'npm run guard:llm-tracked')?.tier, 'required')
})

test('keeps an Eval stack change on the focused deterministic matrix', () => {
  const paths = [
    'eval/suites/smoke.v1.json',
    'scripts/run-agent-runtime-eval.ts',
    'server/src/eval/evaluator.ts',
    'server/src/__integration__/eval.test.ts',
    'src/admin/EvalPage.tsx',
    '.agents/skills/lingxiloop-eval-change/SKILL.md',
  ]
  const report = classifyPaths(paths)
  assert.ok(category(report, 'eval'))
  assert.equal(report.ci.evalFocused, true)
  assert.equal(report.ci.evalRuntime, true)
  assert.equal(report.ci.fullMatrix, false)
  assert.equal(report.ci.integration, 'eval')
  assert.equal(report.ci.dashboard, true)
  assert.equal(report.ci.compose, false)
  assert.equal(report.ci.desktop, false)
  assert.equal(check(report, 'npm run test:eval')?.tier, 'required')
  assert.equal(check(report, 'npm run test:integration:eval')?.tier, 'ci-only')
  assert.equal(check(report, 'npm run eval:check')?.tier, 'ci-only')
  assert.equal(check(report, 'npm run test:integration'), undefined)
  assert.equal(check(report, 'npm test'), undefined)
  assert.equal(report.escalations.some(({ id }) => id === 'ci-full-matrix'), false)
})

test('fails closed when an Eval diff also changes shared or high-risk files', () => {
  const evalPath = 'eval/suites/smoke.v1.json'
  const scenarios = [
    { path: 'server/src/agent-os/runtime.ts', integration: 'full', compose: true },
    { path: 'server/src/db/schema.sql', integration: 'full', compose: false },
    { path: 'server/src/api/admin-router.ts', integration: 'full', compose: false },
    { path: 'package.json', integration: 'none', compose: false },
    { path: 'package-lock.json', integration: 'none', compose: false },
    { path: 'src/admin/api.ts', integration: 'none', compose: false },
    { path: 'server/run-integration-tests.mjs', integration: 'full', compose: false },
    { path: 'server/src/__integration__/_helpers.ts', integration: 'full', compose: false },
  ]
  for (const scenario of scenarios) {
    const plan = buildCiPlan([evalPath, scenario.path])
    assert.equal(plan.evalFocused, false, scenario.path)
    assert.equal(plan.fullUnit, true, scenario.path)
    assert.equal(plan.integration, scenario.integration, scenario.path)
    assert.equal(plan.compose, scenario.compose, scenario.path)
  }
})

test('forces the full matrix when CI workflow or classifier inputs change', () => {
  for (const path of [
    '.github/workflows/_quality.yml',
    '.github/workflows/ci.yml',
    '.agents/skills/lingxiloop-verify-change/scripts/classify-change.mjs',
    '.agents/skills/lingxiloop-verify-change/scripts/classify-change.test.mjs',
    'package.json',
    'package-lock.json',
  ]) {
    const report = classifyPaths(['eval/suites/smoke.v1.json', path])
    assert.equal(report.ci.evalFocused, false, path)
    assert.equal(report.ci.fullMatrix, true, path)
    if (!path.startsWith('package')) {
      assert.ok(report.escalations.some(({ id }) => id === 'ci-selector-change'), path)
    }
    assert.ok(report.escalations.some(({ id }) => id === 'ci-full-matrix'), path)
    assert.equal(check(report, 'npm test')?.tier, 'ci-only', path)
    const classifierSelfTest = check(report, [
      'node --test',
      '.agents/skills/lingxiloop-verify-change/scripts/classify-change.test.mjs',
      'scripts/local-test-selection.test.mjs',
    ].join(' '))
    assert.equal(classifierSelfTest?.tier, path.startsWith('package') ? undefined : 'required', path)
  }
})

test('maps heavy CI jobs only to their owning paths', () => {
  assert.deepEqual(
    Object.fromEntries(Object.entries(buildCiPlan(['third_party/open-notebook/tests/test_lingxiloop_native_scope.py']))
      .filter(([key]) => ['openNotebook', 'compose', 'desktop'].includes(key))),
    { openNotebook: true, compose: false, desktop: false },
  )
  assert.equal(buildCiPlan(['docker-compose.mvp.ci.yml']).compose, true)
  assert.equal(buildCiPlan(['server/src/agent-os/runtime.ts']).compose, true)
  assert.equal(buildCiPlan(['electron/main.cjs']).desktop, true)
  assert.equal(buildCiPlan(['package.json']).desktop, false)
  assert.equal(buildCiPlan(['.github/workflows/_quality.yml']).compose, false)
  assert.equal(buildCiPlan(['.github/workflows/_quality.yml']).fullMatrix, true)
})

test('treats Eval guidance as documentation without running Eval locally', () => {
  const report = classifyPaths(['.agents/skills/lingxiloop-eval-change/SKILL.md'])
  assert.equal(report.ci.eval, true)
  assert.equal(report.ci.evalRuntime, false)
  assert.equal(check(report, 'npm run test:eval'), undefined)
  assert.equal(check(report, 'npm run server:typecheck'), undefined)
  assert.equal(check(report, 'npm run guard:agent-os'), undefined)
})

test('never promotes exhaustive checks into the default local gate', () => {
  const scenarios = [
    ['src/components/AppShell.tsx'],
    ['server/src/api/router.ts'],
    ['server/src/agent-os/runtime.ts'],
    ['server/src/db/schema.sql'],
    ['eval/suites/smoke.v1.json', 'server/src/__integration__/eval.test.ts'],
    ['.agents/skills/lingxiloop-verify-change/scripts/classify-change.mjs'],
  ]
  const exhaustiveCommands = new Set([
    'npm test',
    'npm run build',
    'npm run eval:check',
    'npm run test:integration',
    'npm run test:integration:eval',
    'npm run mvp:ci:smoke',
  ])

  for (const paths of scenarios) {
    const report = classifyPaths(paths)
    for (const item of report.checks) {
      if (exhaustiveCommands.has(item.command)) assert.equal(item.tier, 'ci-only', `${paths}: ${item.command}`)
    }
  }
})

test('escalates the reset-only v1 schema bootstrap to the CI full matrix', () => {
  const report = classifyPaths(['server/src/db/schema.sql'])
  assert.ok(category(report, 'database-tenant'))
  assert.ok(report.escalations.some(({ id }) => id === 'v1-schema-bootstrap'))
  assert.ok(report.escalations.some(({ id }) => id === 'ci-full-matrix'))
  assert.equal(check(report, 'npm run test:local')?.tier, 'required')
  assert.equal(check(report, 'npm run test:integration')?.tier, 'ci-only')
})

test('selects vendor-specific checks', () => {
  const report = classifyPaths([
    'src/components/ui/button.tsx',
    'third_party/open-notebook/open_notebook/domain/notebook.py',
  ])
  assert.ok(category(report, 'vendored'))
  assert.equal(check(report, 'npm run guard:openbot-vendor'), undefined)
  const nativeScope = check(report, 'python -m pytest -q tests/test_lingxiloop_native_scope.py')
  assert.equal(nativeScope?.tier, 'ci-only')
  assert.equal(nativeScope?.cwd, 'third_party/open-notebook')
})

test('escalates independent runtime domains but not overlapping server categories', () => {
  const crossDomain = classifyPaths(['server/src/agent-os/runtime.ts', 'src/components/AppShell.tsx'])
  assert.ok(crossDomain.escalations.some(({ id }) => id === 'cross-domain'))
  const serverOverlap = classifyPaths(['server/src/api/router.ts'])
  assert.equal(serverOverlap.escalations.some(({ id }) => id === 'cross-domain'), false)
})

test('keeps paths and rendered output deterministic', () => {
  const first = buildReport(['src/z.ts', 'README.md', 'src/a.ts', 'src/z.ts'], { mode: 'fixture' })
  const second = buildReport(['src/a.ts', 'src/z.ts', 'README.md'], { mode: 'fixture' })
  assert.deepEqual(first, second)
  assert.deepEqual(first.paths, ['README.md', 'src/a.ts', 'src/z.ts'])
  assert.equal(renderText(first), renderText(second))
})

test('handles an empty change set', () => {
  const report = buildReport([], { mode: 'fixture' })
  assert.deepEqual(report.paths, [])
  assert.deepEqual(report.categories, [])
  assert.deepEqual(report.checks, [])
  assert.deepEqual(report.escalations, [])
})

test('validates CLI options', () => {
  assert.deepEqual(parseArgs(['--base', 'main', '--head', 'topic', '--include-worktree', '--format', 'json']), {
    base: 'main',
    head: 'topic',
    includeWorktree: true,
    format: 'json',
    paths: [],
  })
  assert.deepEqual(parseArgs(['--path', 'src/z.ts', '--path', './src/a.ts']), {
    format: 'text',
    includeWorktree: false,
    paths: ['src/a.ts', 'src/z.ts'],
  })
  assert.throws(() => parseArgs(['--path', 'src/a.ts', '--base', 'main']), /cannot be combined/)
  assert.throws(() => parseArgs(['--path', 'C:outside.ts']), /repository-relative/)
  assert.throws(() => parseArgs(['--head', 'topic']), /--head requires --base/)
  assert.throws(() => parseArgs(['--include-worktree']), /requires --base/)
  assert.throws(() => parseArgs(['--format', 'yaml']), /text or json/)
})

test('fast local runners parse explicit task paths and tests without a worktree fallback', () => {
  assert.deepEqual(parseBaseArgument(['--base', 'origin/main', 'src/example.test.ts']), {
    base: 'origin/main',
    remaining: ['src/example.test.ts'],
  })
  assert.deepEqual(parseScopeArguments([
    '--path', 'src/z.ts',
    '--path', './src/a.ts',
    '--test', 'src/a.test.ts',
  ], { allowTests: true }), {
    base: undefined,
    paths: ['src/a.ts', 'src/z.ts'],
    tests: ['src/a.test.ts'],
    remaining: [],
  })
  assert.throws(() => parseBaseArgument(['--base']), /requires a value/)
  assert.throws(() => parseBaseArgument(['--base', 'main', '--base', 'other']), /requires one explicit Git ref/)
  assert.throws(() => parseScopeArguments(['--base', 'main', '--path', 'src/a.ts']), /cannot be combined/)
})

test('reports invalid refs without a stack trace', () => {
  const result = run(process.execPath, [script, '--base', 'definitely-missing-ref'], process.cwd())
  assert.equal(result.status, 2)
  assert.match(result.stderr, /classify-change/)
  assert.doesNotMatch(result.stderr, /\n\s+at /)
})

test('default CLI mode selects nothing while explicit paths are task scoped', () => {
  const directory = mkdtempSync(join(tmpdir(), 'lingxiloop-classifier-'))
  try {
    assert.equal(run('git', ['init', '-q'], directory).status, 0)
    assert.equal(run('git', ['config', 'user.email', 'classifier@test.invalid'], directory).status, 0)
    assert.equal(run('git', ['config', 'user.name', 'Classifier Test'], directory).status, 0)
    writeFileSync(join(directory, 'README.md'), '# Fixture\n')
    assert.equal(run('git', ['add', 'README.md'], directory).status, 0)
    assert.equal(run('git', ['commit', '-q', '-m', 'fixture'], directory).status, 0)
    writeFileSync(join(directory, 'untracked.md'), 'new\n')

    const emptyResult = run(process.execPath, [script, '--format', 'json'], directory)
    assert.equal(emptyResult.status, 0, emptyResult.stderr)
    const emptyReport = JSON.parse(emptyResult.stdout)
    assert.equal(emptyReport.version, 5)
    assert.equal(emptyReport.scope.mode, 'none')
    assert.deepEqual(emptyReport.paths, [])

    const result = run(process.execPath, [script, '--path', 'untracked.md', '--format', 'json'], directory)
    assert.equal(result.status, 0, result.stderr)
    const report = JSON.parse(result.stdout)
    assert.equal(report.scope.mode, 'paths')
    assert.deepEqual(report.paths, ['untracked.md'])
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('task-scoped reports attach the same explicit paths to local runners', () => {
  const report = buildReport(['src/z.ts', 'src/a.ts'], { mode: 'paths' })
  assert.deepEqual(check(report, 'npm run lint:local')?.args, [
    '--', '--path', 'src/a.ts', '--path', 'src/z.ts',
  ])
  assert.deepEqual(check(report, 'npm run test:local')?.args, [
    '--', '--path', 'src/a.ts', '--path', 'src/z.ts',
  ])
})
