import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { knowledgeObservationRunId, knowledgeObservation, observePublicRunBudget, publicRunBudgetObservation } from './knowledge-observation.mjs'

const runId = 'im:88655fc9ed2c99c17d6a980c071367d5867952b20a41e5a2a9f9c0d97cf765e5'
const PRIVATE = 'PRIVATE_PROMPT_CREDENTIAL_OR_TOOL_BODY'
const payload = { run: { id: runId, requestVersion: 1, fence: 1, status: 'partial', executionMs: 182286,
  goalOutcome: { gaps: ['Model call, token, cost or execution-time budget exhausted'] }, private: PRIVATE },
usage: { calls: 12, pendingCalls: 0, estimatedCalls: 1, inputTokens: 723741, outputTokens: 25027, costMicros: 235380 },
events: [{ data: { private: PRIVATE } }], diagnostics: { private: PRIVATE } }
const rpc = value => new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: JSON.stringify(value) }] } }))

test('only one validated run ID is accepted; deployment arguments cannot enter the observer', () => {
  assert.equal(knowledgeObservationRunId([runId]), runId)
  for (const args of [[], ['--execute'], [runId, 'servers'], ['run;touch /tmp/unwanted'], ['$(deploy)'], ['a'.repeat(501)]]) assert.throws(() => knowledgeObservationRunId(args))
  const cli = readFileSync('deploy/cli.mjs', 'utf8')
  const entry = cli.slice(cli.indexOf("if (command === 'knowledge-observe')"), cli.indexOf("  const head = git('rev-parse'"))
  assert.match(entry, /knowledgeObservation\(runId/)
  assert.doesNotMatch(entry, /ensureImages|patchEntry|runtimePatch\(|servers\(|workers\(|convergeScript|pull\(/)
  assert.match(entry, /true, 45_000/)
  assert.match(entry, /true, 20_000/)
})

test('the real CLI rejects extra deployment options before credentials, SSH or Sigillo are accessed', () => {
  const child = spawnSync(process.execPath, ['deploy/cli.mjs', 'knowledge-observe', runId, 'servers'], {
    env: { PATH: process.env.PATH }, encoding: 'utf8', timeout: 5000,
  })
  assert.equal(child.status, 1)
  assert.match(child.stderr, /knowledge-observe requires exactly one run ID/)
  assert.doesNotMatch(child.stdout + child.stderr, /sigillo login|SSH|deploy .*done/)
})

test('independent read failures preserve the other observations without printing exception details or retries', async () => {
  const calls = []
  const observed = await knowledgeObservation(runId, {
    notebook: () => { calls.push('notebook'); throw Error(PRIVATE) },
    worker: async slot => { calls.push(slot); return { status: 'observed', configuration: {} } },
    runBudget: async id => { calls.push(id); return publicRunBudgetObservation(payload, id) },
  })
  assert.deepEqual(calls, ['notebook', 'a', 'b', runId])
  assert.equal(observed.observationOnly, true)
  assert.equal(observed.status, 'partial')
  assert.equal(observed.notebook.status, 'unavailable')
  assert.equal(observed.runBudget.status, 'observed')
  assert.doesNotMatch(JSON.stringify(observed), new RegExp(PRIVATE))
})

test('one fixed authenticated public read skips event/tool payloads and leaves unsupported budget facts unknown', async () => {
  let calls = 0
  const observed = await observePublicRunBudget(runId, { token: PRIVATE, fetchImpl: async (url, request) => {
    calls++
    assert.equal(url, 'https://admin.lingxilearn.cn/api/mcp')
    assert.equal(request.redirect, 'error')
    assert.equal(request.headers.authorization, `Bearer ${PRIVATE}`)
    assert.ok(request.signal)
    const rpc = JSON.parse(request.body)
    assert.deepEqual(rpc.params, { name: 'lingxiloop_agent_run_operations', arguments: { runId, afterSeq: Number.MAX_SAFE_INTEGER } })
    return new Response(JSON.stringify({ result: { content: [{ type: 'text', text: JSON.stringify(payload) }] } }))
  } })
  assert.equal(calls, 1)
  assert.equal(observed.budgetExhaustionReported, true)
  assert.equal(observed.usage.calls, 12)
  assert.equal(observed.trigger.status, 'unknown')
  assert.equal(observed.frozenRootLimits.status, 'unknown')
  assert.doesNotMatch(JSON.stringify(observed), /PRIVATE_|executionMs|events|diagnostics/)
})

test('missing/denied identity and malformed/oversized responses fail without another identity or retry', async () => {
  let calls = 0
  const fetchImpl = async () => { calls++; return new Response(PRIVATE, { status: 403 }) }
  assert.equal((await observePublicRunBudget(runId, { fetchImpl })).code, 'existing_mcp_identity_missing')
  assert.equal(calls, 0)
  assert.equal((await observePublicRunBudget(runId, { token: PRIVATE, fetchImpl })).code, 'existing_identity_not_authorized')
  assert.equal(calls, 1)
  for (const response of [rpc({ ...payload, run: { ...payload.run, id: 'another-run' } }), new Response(PRIVATE.repeat(12000))]) {
    const value = await observePublicRunBudget(runId, { token: PRIVATE, fetchImpl: async () => response })
    assert.deepEqual(value, { status: 'unavailable', code: 'public_reader_unavailable' })
  }
})

test('running worker metadata reports only four configured limits, never a frozen root or credentials', () => {
  const raw = execFileSync(process.execPath, ['deploy/worker-budget-observe.mjs'], { encoding: 'utf8', timeout: 5000,
    env: { AGENT_OS_MAX_MODEL_CALLS: '128', AGENT_OS_MAX_MODEL_TOKENS: '1000000', AGENT_OS_MAX_MODEL_COST_MICROS: PRIVATE,
      AGENT_OS_MAX_WORK_MS: '1800000', OPENAI_API_KEY: PRIVATE, DATABASE_URL: PRIVATE } })
  const observed = JSON.parse(raw)
  assert.equal(observed.configuration.AGENT_OS_MAX_MODEL_CALLS, 128)
  assert.equal(observed.configuration.AGENT_OS_MAX_MODEL_COST_MICROS, null)
  assert.equal(observed.scope, 'current_worker_environment_only')
  assert.equal(observed.frozenRootLimits, 'unknown')
  assert.doesNotMatch(raw, /PRIVATE_|OPENAI_API_KEY|DATABASE_URL/)
})


test('existing Actions diagnostics reuse identity and permissions while passing the run ID as one literal argument', () => {
  const workflow = readFileSync('.github/workflows/deploy.yml', 'utf8')
  assert.match(workflow, /options: \[[^\n]*knowledge-observe\]/)
  assert.match(workflow, /permissions:\n  contents: read\n  packages: write\n/)
  assert.equal((workflow.match(/secrets\.SIGILLO_TOKEN/g) ?? []).length, 1)
  const images = workflow.split('  images:\n')[1].split('  deploy:\n')[0]
  assert.doesNotMatch(images, /knowledge-observe/)
  const block = workflow.split('      - name: Read-only knowledge observation\n')[1]
  assert.ok(block, 'a separate observation step is required')
  assert.match(block, /if: inputs.command == 'knowledge-observe'/)
  assert.match(block, /OBSERVATION_RUN_ID: \$\{\{ inputs.run_id \}\}/)
  assert.match(workflow, /if: inputs.command != 'knowledge-observe'/)
  const command = block.match(/^        run: (.+)$/m)?.[1]
  assert.equal(command, 'node deploy/cli.mjs knowledge-observe "$OBSERVATION_RUN_ID"')
  assert.doesNotMatch(command, /\$\{\{|inputs.stacks/)
  const dir = mkdtempSync(join(tmpdir(), 'knowledge-observe-contract-'))
  try {
    const record = join(dir, 'argv.json')
    writeFileSync(join(dir, 'node'), `#!${process.execPath}\nrequire('node:fs').writeFileSync(process.env.ARGV_RECORD, JSON.stringify(process.argv.slice(2)))`, { mode: 0o700 })
    const literal = 'im:example;$(echo injected) "another argument"'
    const child = spawnSync('/bin/bash', ['-e'], { input: command, encoding: 'utf8', timeout: 5000,
      env: { PATH: dir, OBSERVATION_RUN_ID: literal, ARGV_RECORD: record } })
    assert.equal(child.status, 0, child.stderr)
    assert.deepEqual(JSON.parse(readFileSync(record, 'utf8')), ['deploy/cli.mjs', 'knowledge-observe', literal])
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
