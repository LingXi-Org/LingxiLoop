/**
 * Unit tests for the agent CLI's identity resolution. This is the
 * last resolver layer after the production runtime endpoint has
 * normalized argv. Pod invocations are pinned by JWT-backed runtime
 * env; local bash-tool invocations get a temporary `lingxiloop` wrapper
 * so the supported PATH command runs as the current agent.
 *
 * The production impersonation defence is tested in
 * agents-runtime-cli-argv.test.ts: /runtime/cli strips caller `--as`
 * flags and injects the JWT subject. The local wrapper tests here are
 * a developer guard for normal `lingxiloop ...` bash usage, not a complete
 * boundary for arbitrary unsandboxed shell commands.
 *
 * Run: node --import tsx --test server/src/__tests__/agents-cli-identity.test.ts
 */
import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { resolveAs } from '../agents/cli-identity.js'
import type { ParsedArgs } from '../agents/cli-parse.js'

const ME = 'iris-0c97'
const SPOOF = 'atlas-7860'

// Snapshot + restore the env vars we toggle so tests don't leak state.
const SAVED: Record<string, string | undefined> = {}
const ENVS = ['LINGXILOOP_AGENT_ID', 'LINGXILOOP_RUNTIME_CLIENT', 'LINGXILOOP_CLI_IDENTITY_SOURCE', 'LINGXILOOP_DEFAULT_AS']

beforeEach(() => {
  for (const k of ENVS) SAVED[k] = process.env[k]
  for (const k of ENVS) delete process.env[k]
})

afterEach(() => {
  for (const k of ENVS) {
    if (SAVED[k] === undefined) delete process.env[k]
    else process.env[k] = SAVED[k]
  }
})

function args(flags: Record<string, string | boolean> = {}): ParsedArgs {
  return { positional: [], flags }
}

// ── Pod-pinned identity wins ────────────────────────────────────────────

test('pin wins: inside an agent pod, LINGXILOOP_AGENT_ID overrides any --as the model smuggled in', () => {
  process.env.LINGXILOOP_RUNTIME_CLIENT = 'http'
  process.env.LINGXILOOP_AGENT_ID = ME
  // Model wrote `lingxiloop --as atlas-7860 reply X foo`. The CLI still
  // resolves to the REAL agent.
  assert.equal(resolveAs(args({ as: SPOOF })), ME)
})

test('pin wins: even without any --as flag at all, the pin is used (pod runtime path)', () => {
  process.env.LINGXILOOP_RUNTIME_CLIENT = 'http'
  process.env.LINGXILOOP_AGENT_ID = ME
  assert.equal(resolveAs(args({})), ME)
})

test('pin wins: LINGXILOOP_DEFAULT_AS is ignored when pin is in effect', () => {
  process.env.LINGXILOOP_RUNTIME_CLIENT = 'http'
  process.env.LINGXILOOP_AGENT_ID = ME
  process.env.LINGXILOOP_DEFAULT_AS = SPOOF
  assert.equal(resolveAs(args({})), ME)
})

test('pin wins: local agent bash wrapper identity overrides any --as the model smuggled in', () => {
  process.env.LINGXILOOP_CLI_IDENTITY_SOURCE = 'agent-bash'
  process.env.LINGXILOOP_AGENT_ID = ME
  assert.equal(resolveAs(args({ as: SPOOF })), ME)
})

// ── Pin is GATED on LINGXILOOP_RUNTIME_CLIENT=http ──────────────────────────

test('pin GATE: LINGXILOOP_AGENT_ID alone (without a trusted source) does NOT pin', () => {
  // Dev shell where someone exported LINGXILOOP_AGENT_ID for testing
  // shouldn't accidentally pin every lingxiloop-server CLI invocation.
  process.env.LINGXILOOP_AGENT_ID = SPOOF
  // (trusted source env unset — beforeEach deleted it)
  assert.equal(resolveAs(args({ as: ME })), ME, 'when not in pod mode, --as wins')
})

test('pin GATE: LINGXILOOP_RUNTIME_CLIENT=http alone (without LINGXILOOP_AGENT_ID) does NOT pin', () => {
  // Some other in-proc context that set LINGXILOOP_RUNTIME_CLIENT but
  // didn't set LINGXILOOP_AGENT_ID. --as flag is honored.
  process.env.LINGXILOOP_RUNTIME_CLIENT = 'http'
  assert.equal(resolveAs(args({ as: ME })), ME)
})

test('pin GATE: LINGXILOOP_CLI_IDENTITY_SOURCE=agent-bash alone (without LINGXILOOP_AGENT_ID) does NOT pin', () => {
  process.env.LINGXILOOP_CLI_IDENTITY_SOURCE = 'agent-bash'
  assert.equal(resolveAs(args({ as: ME })), ME)
})

// ── Non-pod path: --as flag wins, LINGXILOOP_DEFAULT_AS is fallback ────────

test('non-pod: --as flag is honoured when no pin is set (lingxiloop-server runtime endpoint path)', () => {
  // The lingxiloop-server's /runtime endpoint injects --as from the
  // JWT-decoded agentId before calling runCli — that's a trusted
  // injection point.
  assert.equal(resolveAs(args({ as: ME })), ME)
})

test('non-pod: LINGXILOOP_DEFAULT_AS is the fallback when --as is missing (dev shell path)', () => {
  process.env.LINGXILOOP_DEFAULT_AS = ME
  assert.equal(resolveAs(args({})), ME)
})

test('non-pod: explicit --as overrides LINGXILOOP_DEFAULT_AS', () => {
  process.env.LINGXILOOP_DEFAULT_AS = SPOOF
  assert.equal(resolveAs(args({ as: ME })), ME)
})

// ── Throw on no identity ───────────────────────────────────────────────

test('no identity: throws — does NOT silently default to a seed user (the original impersonation hole)', () => {
  // The pre-fix bug this guards: resolveAs used to fall back to
  // `'yetone'` (the dev seed user) when nothing else was set, so
  // running `lingxiloop email send …` without --as would impersonate.
  assert.throws(() => resolveAs(args({})), /--as.*required|LINGXILOOP_DEFAULT_AS/i)
})

test('no identity: an empty-string --as is treated as missing', () => {
  // Defensive: parseArgs gives boolean `true` for `--as` without a
  // value, but a manual `runCli([..., '--as', ''])` is possible too.
  // Empty strings must NOT pass as a valid identity.
  assert.throws(() => resolveAs(args({ as: '' })), /required/i)
})

test('no identity: an empty-string LINGXILOOP_DEFAULT_AS does NOT silently work', () => {
  process.env.LINGXILOOP_DEFAULT_AS = ''
  assert.throws(() => resolveAs(args({})), /required/i)
})

test('no identity: an empty-string LINGXILOOP_AGENT_ID does NOT silently pin', () => {
  process.env.LINGXILOOP_RUNTIME_CLIENT = 'http'
  process.env.LINGXILOOP_AGENT_ID = ''
  // No fallback set → throw.
  assert.throws(() => resolveAs(args({})), /required/i)
})

// ── Boolean flag form ───────────────────────────────────────────────────

test('boolean `--as` (no value) is rejected (parseArgs sets it to `true`, not a string)', () => {
  // parseArgs gives flags.as = true when the command is `lingxiloop foo --as`.
  // resolveAs's `typeof explicit === 'string'` check rejects that.
  assert.throws(() => resolveAs(args({ as: true })), /required/i)
})

// ── Smuggle-defence smoke test ──────────────────────────────────────────

test('smuggle defence: even with --as set to a spoof AND in pod mode, the pin wins', () => {
  // resolveAs MUST return the pinned agentId, not the spoofed --as value.
  process.env.LINGXILOOP_RUNTIME_CLIENT = 'http'
  process.env.LINGXILOOP_AGENT_ID = ME
  // All three spoof channels engaged at once.
  process.env.LINGXILOOP_DEFAULT_AS = SPOOF
  assert.equal(resolveAs(args({ as: SPOOF })), ME)
})
