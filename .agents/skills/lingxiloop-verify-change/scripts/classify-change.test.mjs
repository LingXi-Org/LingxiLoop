import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { buildReport, classifyPaths, parseArgs, renderText } from './classify-change.mjs'

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

test('classifies frontend changes with typecheck and build evidence', () => {
  const report = classifyPaths(['src/components/AppShell.tsx'])
  assert.ok(category(report, 'frontend'))
  assert.equal(check(report, 'npm run typecheck')?.tier, 'required')
  assert.equal(check(report, 'npm run build')?.tier, 'recommended')
})

test('classifies Agent OS changes with architecture and ledger guards', () => {
  const report = classifyPaths([
    'server/src/agent-os/runtime.ts',
    'server/src/__tests__/agent-os-runtime.test.ts',
  ])
  assert.ok(category(report, 'server'))
  assert.ok(category(report, 'agent-os-im-canvas'))
  assert.equal(check(report, 'npm run guard:agent-os')?.tier, 'required')
  assert.equal(check(report, 'npm run guard:llm-tracked')?.tier, 'required')
  assert.equal(report.escalations.some(({ id }) => id === 'cross-domain'), false)
})

test('escalates runtime migrations to the full CI approximation', () => {
  const report = classifyPaths(['server/src/db/migrate.ts'])
  assert.ok(category(report, 'database-tenant'))
  assert.ok(report.escalations.some(({ id }) => id === 'runtime-migration'))
  assert.ok(report.escalations.some(({ id }) => id === 'full-ci-approximation'))
  assert.equal(check(report, 'npm run test:integration')?.tier, 'required')
})

test('selects vendor-specific checks', () => {
  const report = classifyPaths([
    'src/components/ui/button.tsx',
    'third_party/open-notebook/open_notebook/domain/notebook.py',
  ])
  assert.ok(category(report, 'vendored'))
  assert.equal(check(report, 'npm run guard:openbot-vendor')?.tier, 'required')
  const nativeScope = check(report, 'python -m pytest -q tests/test_lingxiloop_native_scope.py')
  assert.equal(nativeScope?.tier, 'required')
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
  })
  assert.throws(() => parseArgs(['--head', 'topic']), /--head requires --base/)
  assert.throws(() => parseArgs(['--format', 'yaml']), /text or json/)
})

test('reports invalid refs without a stack trace', () => {
  const result = run(process.execPath, [script, '--base', 'definitely-missing-ref'], process.cwd())
  assert.equal(result.status, 2)
  assert.match(result.stderr, /classify-change/)
  assert.doesNotMatch(result.stderr, /\n\s+at /)
})

test('default CLI mode includes untracked files and emits valid JSON', () => {
  const directory = mkdtempSync(join(tmpdir(), 'lingxiloop-classifier-'))
  try {
    assert.equal(run('git', ['init', '-q'], directory).status, 0)
    assert.equal(run('git', ['config', 'user.email', 'classifier@test.invalid'], directory).status, 0)
    assert.equal(run('git', ['config', 'user.name', 'Classifier Test'], directory).status, 0)
    writeFileSync(join(directory, 'README.md'), '# Fixture\n')
    assert.equal(run('git', ['add', 'README.md'], directory).status, 0)
    assert.equal(run('git', ['commit', '-q', '-m', 'fixture'], directory).status, 0)
    writeFileSync(join(directory, 'untracked.md'), 'new\n')

    const result = run(process.execPath, [script, '--format', 'json'], directory)
    assert.equal(result.status, 0, result.stderr)
    const report = JSON.parse(result.stdout)
    assert.equal(report.version, 1)
    assert.equal(report.scope.mode, 'worktree')
    assert.deepEqual(report.paths, ['untracked.md'])
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
