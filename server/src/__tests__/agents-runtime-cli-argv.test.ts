/**
 * Unit tests for the `/runtime/cli` argv normalizer. This is the first
 * half of the runtime-pod identity defence — server.ts strips every
 * client-supplied `--as` and re-prepends the JWT-pinned agentId before
 * runCli sees argv. cli-identity.ts's `resolveAs` is the second half.
 *
 * Run: node --import tsx --test server/src/__tests__/agents-runtime-cli-argv.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stripAsArgs, buildRuntimeArgv } from '../agents/runtime/cli-argv.js'

const ME = 'aurora-aa11'
const SPOOF = 'atlas-7860'

// ── stripAsArgs ────────────────────────────────────────────────────────

test('stripAsArgs: removes `--as <id>` pair from anywhere in argv', () => {
  assert.deepEqual(
    stripAsArgs(['reply', 'conv-1', '--as', SPOOF, 'hello']),
    ['reply', 'conv-1', 'hello'],
  )
})

test('stripAsArgs: removes `--as=<id>` single-token form', () => {
  assert.deepEqual(
    stripAsArgs(['reply', 'conv-1', `--as=${SPOOF}`, 'hello']),
    ['reply', 'conv-1', 'hello'],
  )
})

test('stripAsArgs: removes multiple stacked --as flags (any combination of forms)', () => {
  // Defence against the parseArgs "last --as wins" quirk: leave NONE
  // behind. Both space-form and = -form, repeated.
  assert.deepEqual(
    stripAsArgs(['cmd', '--as', SPOOF, '--as=other', '--as', 'third', 'tail']),
    ['cmd', 'tail'],
  )
})

test('stripAsArgs: leaves an unrelated flag that happens to start with --as untouched', () => {
  // e.g. a future `--ascii` flag must NOT be eaten by the strip rule.
  assert.deepEqual(
    stripAsArgs(['cmd', '--ascii', 'on']),
    ['cmd', '--ascii', 'on'],
  )
})

test('stripAsArgs: returns a NEW array (does not mutate input)', () => {
  const argv = ['cmd', '--as', SPOOF]
  const out = stripAsArgs(argv)
  assert.notEqual(out, argv)
  // The mutation check that matters: input is unchanged after the call.
  assert.deepEqual(argv, ['cmd', '--as', SPOOF])
})

test('stripAsArgs: tolerates a dangling `--as` with no value', () => {
  // Malformed argv — `--as` with nothing after. Still drop the flag.
  assert.deepEqual(
    stripAsArgs(['cmd', 'arg', '--as']),
    ['cmd', 'arg'],
  )
})

test('stripAsArgs: empty argv → empty argv', () => {
  assert.deepEqual(stripAsArgs([]), [])
})

test('stripAsArgs: `--as=` with empty value is still stripped', () => {
  // Edge case: someone passes `--as=` literally. We still want to remove
  // it so it can't sneak through as a positional.
  assert.deepEqual(
    stripAsArgs(['cmd', '--as=', 'tail']),
    ['cmd', 'tail'],
  )
})

// ── buildRuntimeArgv ───────────────────────────────────────────────────

test('buildRuntimeArgv: prepends `--as <jwt.sub>` to a clean argv', () => {
  assert.deepEqual(
    buildRuntimeArgv(ME, ['reply', 'conv-1', 'hello']),
    ['--as', ME, 'reply', 'conv-1', 'hello'],
  )
})

test('buildRuntimeArgv: strips client --as AND prepends JWT sub — the impersonation defence', () => {
  // The exact bypass attempt this exists to defeat: pod sends argv
  // claiming to act as SPOOF. JWT pins ME. Final argv must contain only
  // one --as, and that --as must be ME.
  const out = buildRuntimeArgv(ME, ['reply', 'conv-1', '--as', SPOOF, 'hello'])
  assert.deepEqual(out, ['--as', ME, 'reply', 'conv-1', 'hello'])
  const asFlags = out.filter((tok, i) => tok === '--as' || (i > 0 && out[i - 1] === '--as' && tok === ME))
  assert.equal(out.indexOf('--as'), out.lastIndexOf('--as'), 'exactly one --as in final argv')
  assert.equal(out[out.indexOf('--as') + 1], ME)
  // SPOOF nowhere to be found.
  assert.equal(out.includes(SPOOF), false)
  // Silence the unused-var lint — asFlags is computed for clarity only.
  void asFlags
})

test('buildRuntimeArgv: strips stacked --as smuggle attempts', () => {
  // Pod tries every form at once.
  const out = buildRuntimeArgv(
    ME,
    ['cmd', '--as', SPOOF, '--as=other', '--as', 'third', 'tail'],
  )
  assert.deepEqual(out, ['--as', ME, 'cmd', 'tail'])
  assert.equal(out.indexOf('--as'), out.lastIndexOf('--as'))
})

test('buildRuntimeArgv: empty client argv → just the prepended --as <sub>', () => {
  assert.deepEqual(buildRuntimeArgv(ME, []), ['--as', ME])
})
