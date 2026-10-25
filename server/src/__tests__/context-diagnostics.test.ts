import assert from 'node:assert/strict'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { createLogger, NoEffectError, releaseVersions } from '@lyyzka/lingxios'
import { contextFailureDiagnosticSchema, createContextDiagnosticsLogger, projectContextFailure, type ContextFailureDiagnostic } from '../agent-runtime/context-diagnostics.js'

const privateValue = 'PRIVATE_BODY_KEY_QUERY_SENTINEL'
const runId = 'im:' + 'a'.repeat(64)
const path = `/v5/work/${encodeURIComponent(runId)}/context?leaseToken=${privateValue}`
const runtimeRoot = fileURLToPath(new URL('.', import.meta.resolve('@lyyzka/lingxios')))
const productRoot = fileURLToPath(new URL('../', import.meta.url))
const error = () => Object.assign(new TypeError(privateValue), {
  code: '42P01',
  stack: `TypeError: ${privateValue}\n    at recall (${runtimeRoot}memory/semantic.js:88:19)\n    at private (${privateValue}:91:2)\n    at load (${productRoot}agent-runtime/context.ts:144:8)\n    at spoof (/private/${privateValue}/server/src/agent-runtime/context.ts:42:1)`,
})

test('projection keeps fixed classification and controlled frames without original exception data', () => {
  const diagnostic = projectContextFailure(runId, error(), 'b'.repeat(40))
  assert.equal(diagnostic.schemaVersion, 1)
  assert.match(diagnostic.correlationId, /^[0-9a-f-]{36}$/)
  assert.equal(diagnostic.runId, runId)
  assert.equal(diagnostic.stage, 'context_load')
  assert.equal(diagnostic.reason, 'native_rejected')
  assert.equal(diagnostic.category, 'unknown')
  assert.equal(diagnostic.retryable, false)
  assert.equal(diagnostic.errorName, 'TypeError')
  assert.equal(diagnostic.sqlState, '42P01')
  assert.equal(diagnostic.runtimeVersion, releaseVersions.runtime)
  assert.equal(diagnostic.serviceCommit, 'b'.repeat(40))
  assert.deepEqual(diagnostic.frames, [
    { module: 'lingxios/memory/semantic.js', line: 88, column: 19 },
    { module: 'server/agent-runtime/context.ts', line: 144, column: 8 },
  ])
  assert.doesNotMatch(JSON.stringify(diagnostic), /PRIVATE_|file:|\/app\/|stack|message|leaseToken/)
})

test('official cause classification, unknown names and untrusted getters remain safe', () => {
  const timeout = projectContextFailure(runId, Object.assign(new Error(privateValue), {
    name: privateValue, cause: Object.assign(new Error(privateValue), { code: 'ETIMEDOUT' }),
  }), privateValue)
  assert.equal(timeout.reason, 'dependency_unavailable')
  assert.equal(timeout.category, 'dependency')
  assert.equal(timeout.retryable, true)
  assert.equal(timeout.causeCode, 'ETIMEDOUT')
  assert.equal(timeout.errorName, 'UnknownError')
  assert.equal(timeout.serviceCommit, 'unknown')
  const denied = projectContextFailure(runId, new NoEffectError(privateValue, 'forbidden'))
  assert.equal(denied.reason, 'forbidden')
  assert.equal(denied.category, 'authorization')
  const unknown = projectContextFailure(runId, new Proxy({}, { get() { throw new Error(privateValue) } }))
  assert.equal(unknown.errorName, 'UnknownError')
  assert.deepEqual(unknown.frames, [])
  const filesystem = projectContextFailure(runId, Object.assign(new Error(privateValue), {
    cause: { code: 'EACCES', message: privateValue },
  }))
  assert.equal(filesystem.systemCode, 'EACCES')
  assert.equal(filesystem.reason, 'dependency_blocked')
  assert.equal(filesystem.category, 'dependency')
  const http = projectContextFailure(runId, { name: 'HttpError', status: 503, message: privateValue,
    stack: `HttpError: ${privateValue}\n    at read (${productRoot}im/wukong.ts:42:5)` })
  assert.equal(http.errorName, 'HttpError')
  assert.equal(http.httpStatus, 503)
  assert.equal(http.reason, 'dependency_unavailable')
  assert.deepEqual(http.frames, [{ module: 'server/im/wukong.ts', line: 42, column: 5 }])
  assert.equal(projectContextFailure(runId, { cause: { statusCode: 404, code: 'ENOENT' } }).httpStatus, 404)
  const invalid = projectContextFailure(runId, { status: '503', code: privateValue, cause: { statusCode: 600.5 } })
  assert.equal(invalid.httpStatus, undefined)
  assert.equal(invalid.systemCode, undefined)
  assert.doesNotMatch(JSON.stringify({ timeout, denied, unknown, filesystem, http, invalid }), /PRIVATE_/)
})

test('SQLSTATE and frames are constrained and malformed identities are rejected', () => {
  const diagnostic = projectContextFailure(runId, { code: 'TOKEN', name: 'Error',
    stack: Array.from({ length: 8 }, (_, index) => `    at recall (${runtimeRoot}memory/semantic.js:${index + 1}:2)`).join('\n') })
  assert.equal(diagnostic.sqlState, undefined)
  assert.equal(diagnostic.frames.length, 4)
  for (const invalid of ['', '../private', 'im:with?query', 'im:with%2Fslash', privateValue + '\n']) {
    assert.throws(() => projectContextFailure(invalid, error()))
  }
})

test('stored schema rejects arbitrary fields, names, reason/cause codes, source modules and metadata', () => {
  const value = projectContextFailure(runId, error())
  assert.equal(contextFailureDiagnosticSchema.safeParse({ ...value, runtimeVersion: '3.8.11' }).success, true)
  for (const invalid of [
    { ...value, message: privateValue }, { ...value, reason: privateValue }, { ...value, causeCode: privateValue },
    { ...value, errorName: privateValue }, { ...value, frames: [{ module: `/private/${privateValue}`, line: 1 }] },
    { ...value, frames: [{ module: 'lingxios/memory/semantic.js', line: 1, body: privateValue }] },
    { ...value, runtimeVersion: privateValue }, { ...value, serviceCommit: privateValue },
    { ...value, httpStatus: 399 }, { ...value, httpStatus: 600 }, { ...value, httpStatus: '503' },
    { ...value, systemCode: privateValue },
  ]) assert.equal(contextFailureDiagnosticSchema.safeParse(invalid).success, false)
})

test('exact context failures are persisted, sanitized before logging, and inherited child fields are intercepted', async () => {
  const lines: string[] = [], writes: ContextFailureDiagnostic[] = []
  const recorder = createContextDiagnosticsLogger({ logger: createLogger({ sink: line => lines.push(line) }),
    record: async diagnostic => { writes.push(diagnostic) }, serviceCommit: 'c'.repeat(40) })
  recorder.logger.child({ path, error: error(), privateBody: privateValue }).child({ extra: privateValue })
    .error('control-plane request failed')
  await recorder.flush()
  assert.equal(writes.length, 1)
  assert.equal(writes[0].runId, runId)
  assert.equal(lines.length, 1)
  assert.doesNotMatch(JSON.stringify({ lines, writes }), /PRIVATE_|leaseToken|privateBody|extra|file:/)
  recorder.logger.child({ ordinary: 'retained' }).info('ordinary event', { count: 2 })
  assert.equal(JSON.parse(lines[1]).ordinary, 'retained')
  assert.equal(JSON.parse(lines[1]).count, 2)
})

test('non-target and malformed control routes never persist or spill raw errors and query strings', async () => {
  const lines: string[] = [], writes: ContextFailureDiagnostic[] = []
  const recorder = createContextDiagnosticsLogger({ logger: createLogger({ sink: line => lines.push(line) }), record: async value => { writes.push(value) } })
  for (const unsafePath of ['/v5/work/other/actions?key=' + privateValue,
    '/v5/work/../context', '/v5/work/im%2Funsafe/context', '/v5/work/im%253Aunsafe/context', '/v5/work/run/context/extra', privateValue]) {
    recorder.logger.error('control-plane request failed', { path: unsafePath, error: error(), body: privateValue })
  }
  await recorder.flush()
  assert.deepEqual(writes, [])
  assert.equal(lines.length, 6)
  assert.doesNotMatch(JSON.stringify(lines), /PRIVATE_|leaseToken|body|path|stack/)
  assert.doesNotThrow(() => recorder.logger.error('control-plane request failed', {
    path, get error() { throw new Error(privateValue) },
  }))
  assert.equal(JSON.parse(lines.at(-1)!).code, 'context_diagnostic_projection_failed')
  assert.doesNotMatch(JSON.stringify(lines), /PRIVATE_/)
  const brokenSink = createContextDiagnosticsLogger({ logger: {
    debug() {}, info() {}, warn() {}, error() { throw new Error(privateValue) }, child() { return this },
  }, record: async () => { throw new Error(privateValue) } })
  assert.doesNotThrow(() => brokenSink.logger.error('control-plane request failed', { path, error: error() }))
  await brokenSink.flush()
})

test('flush awaits pending writes and sink failures use only a fixed safe code', async () => {
  const lines: string[] = []
  let release!: () => void
  const pending = new Promise<void>(resolve => { release = resolve })
  let calls = 0
  const recorder = createContextDiagnosticsLogger({ logger: createLogger({ sink: line => lines.push(line) }), record: async () => {
    calls++
    await pending
    throw new Error(privateValue)
  } })
  recorder.logger.error('control-plane request failed', { path, error: error() })
  let flushed = false
  const flushing = recorder.flush().then(() => { flushed = true })
  await Promise.resolve(); await Promise.resolve()
  assert.equal(calls, 1)
  assert.equal(flushed, false)
  release(); await flushing
  assert.equal(flushed, true)
  assert.equal(JSON.parse(lines.at(-1)!).code, 'context_diagnostic_write_failed')
  assert.doesNotMatch(lines.join('\n'), /PRIVATE_|leaseToken|stack/)
})
