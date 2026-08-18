/**
 * Unit tests for the agent CLI's identity resolution. This is the
 * last resolver layer after the production runtime endpoint has
 * normalized argv. Pod invocations are pinned by JWT-backed runtime
 * env; local bash-tool invocations get a temporary `cumora` wrapper
 * so the supported PATH command runs as the current agent.
 *
 * The production impersonation defence is tested in
 * agents-runtime-cli-argv.test.ts: /runtime/cli strips caller `--as`
 * flags and injects the JWT subject. The local wrapper tests here are
 * a developer guard for normal `cumora ...` bash usage, not a complete
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
const ENVS = ['CUMORA_AGENT_ID', 'CUMORA_RUNTIME_CLIENT', 'CUMORA_CLI_IDENTITY_SOURCE', 'CUMORA_DEFAULT_AS']

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

test('pin wins: inside an agent pod, CUMORA_AGENT_ID overrides any --as the model smuggled in', () => {
  process.env.CUMORA_RUNTIME_CLIENT = 'http'
  process.env.CUMORA_AGENT_ID = ME
  // Model wrote `cumora --as atlas-7860 reply X foo`. The CLI still
  // resolves to the REAL agent.
  assert.equal(resolveAs(args({ as: SPOOF })), ME)
})

test('pin wins: even without any --as flag at all, the pin is used (pod runtime path)', () => {
  process.env.CUMORA_RUNTIME_CLIENT = 'http'
  process.env.CUMORA_AGENT_ID = ME
  assert.equal(resolveAs(args({})), ME)
})

test('pin wins: CUMORA_DEFAULT_AS is ignored when pin is in effect', () => {
  process.env.CUMORA_RUNTIME_CLIENT = 'http'
  process.env.CUMORA_AGENT_ID = ME
  process.env.CUMORA_DEFAULT_AS = SPOOF
  assert.equal(resolveAs(args({})), ME)
})

test('pin wins: local agent bash wrapper identity overrides any --as the model smuggled in', () => {
  process.env.CUMORA_CLI_IDENTITY_SOURCE = 'agent-bash'
  process.env.CUMORA_AGENT_ID = ME
  assert.equal(resolveAs(args({ as: SPOOF })), ME)
})

// ── Pin is GATED on CUMORA_RUNTIME_CLIENT=http ──────────────────────────

test('pin GATE: CUMORA_AGENT_ID alone (without a trusted source) does NOT pin', () => {
  // Dev shell where someone exported CUMORA_AGENT_ID for testing
  // shouldn't accidentally pin every cumora-server CLI invocation.
  process.env.CUMORA_AGENT_ID = SPOOF
  // (trusted source env unset — beforeEach deleted it)
  assert.equal(resolveAs(args({ as: ME })), ME, 'when not in pod mode, --as wins')
})

test('pin GATE: CUMORA_RUNTIME_CLIENT=http alone (without CUMORA_AGENT_ID) does NOT pin', () => {
  // Some other in-proc context that set CUMORA_RUNTIME_CLIENT but
  // didn't set CUMORA_AGENT_ID. --as flag is honored.
  process.env.CUMORA_RUNTIME_CLIENT = 'http'
  assert.equal(resolveAs(args({ as: ME })), ME)
})

test('pin GATE: CUMORA_CLI_IDENTITY_SOURCE=agent-bash alone (without CUMORA_AGENT_ID) does NOT pin', () => {
  process.env.CUMORA_CLI_IDENTITY_SOURCE = 'agent-bash'
  assert.equal(resolveAs(args({ as: ME })), ME)
})

// ── Non-pod path: --as flag wins, CUMORA_DEFAULT_AS is fallback ────────

test('non-pod: --as flag is honoured when no pin is set (cumora-server runtime endpoint path)', () => {
  // The cumora-server's /runtime endpoint injects --as from the
  // JWT-decoded agentId before calling runCli — that's a trusted
  // injection point.
  assert.equal(resolveAs(args({ as: ME })), ME)
})

test('non-pod: CUMORA_DEFAULT_AS is the fallback when --as is missing (dev shell path)', () => {
  process.env.CUMORA_DEFAULT_AS = ME
  assert.equal(resolveAs(args({})), ME)
})

test('non-pod: explicit --as overrides CUMORA_DEFAULT_AS', () => {
  process.env.CUMORA_DEFAULT_AS = SPOOF
  assert.equal(resolveAs(args({ as: ME })), ME)
})

// ── Throw on no identity ───────────────────────────────────────────────

test('no identity: throws — does NOT silently default to a seed user (the original impersonation hole)', () => {
  // The pre-fix bug this guards: resolveAs used to fall back to
  // `'yetone'` (the dev seed user) when nothing else was set, so
  // running `cumora email send …` without --as would impersonate.
  assert.throws(() => resolveAs(args({})), /--as.*required|CUMORA_DEFAULT_AS/i)
})

test('no identity: an empty-string --as is treated as missing', () => {
  // Defensive: parseArgs gives boolean `true` for `--as` without a
  // value, but a manual `runCli([..., '--as', ''])` is possible too.
  // Empty strings must NOT pass as a valid identity.
  assert.throws(() => resolveAs(args({ as: '' })), /required/i)
})

test('no identity: an empty-string CUMORA_DEFAULT_AS does NOT silently work', () => {
  process.env.CUMORA_DEFAULT_AS = ''
  assert.throws(() => resolveAs(args({})), /required/i)
})

test('no identity: an empty-string CUMORA_AGENT_ID does NOT silently pin', () => {
  process.env.CUMORA_RUNTIME_CLIENT = 'http'
  process.env.CUMORA_AGENT_ID = ''
  // No fallback set → throw.
  assert.throws(() => resolveAs(args({})), /required/i)
})

// ── Boolean flag form ───────────────────────────────────────────────────

test('boolean `--as` (no value) is rejected (parseArgs sets it to `true`, not a string)', () => {
  // parseArgs gives flags.as = true when the command is `cumora foo --as`.
  // resolveAs's `typeof explicit === 'string'` check rejects that.
  assert.throws(() => resolveAs(args({ as: true })), /required/i)
})

// ── Smuggle-defence smoke test ──────────────────────────────────────────

test('smuggle defence: even with --as set to a spoof AND in pod mode, the pin wins', () => {
  // resolveAs MUST return the pinned agentId, not the spoofed --as value.
  process.env.CUMORA_RUNTIME_CLIENT = 'http'
  process.env.CUMORA_AGENT_ID = ME
  // All three spoof channels engaged at once.
  process.env.CUMORA_DEFAULT_AS = SPOOF
  assert.equal(resolveAs(args({ as: SPOOF })), ME)
})
