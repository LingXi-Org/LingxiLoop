import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { packageResources, releaseVersions } from '@lingxi-org/lingxios'
import pg from 'pg'

const dsh = fileURLToPath(new URL('./node_modules/.bin/dsh', import.meta.url))
const plugin = fileURLToPath(new URL('./dsh-tools.mjs', import.meta.url))

export async function openDatabase() {
  // This endpoint belongs to the dedicated Colima container. Do not inherit DATABASE_URL.
  const pool = new pg.Pool({
    host: '127.0.0.1', port: 55438, user: 'harness_eval',
    password: 'harness-eval-local-only', database: 'harness_eval', max: 8, connectionTimeoutMillis: 5000,
  })
  try {
    assert.equal(releaseVersions.runtime, '4.0.0')
    const schemas = await pool.query(
      "SELECT nspname FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname NOT IN ('information_schema','public')",
    )
    if (!schemas.rows.length) await pool.query(await readFile(packageResources().schema, 'utf8'))
    else assert.deepEqual(schemas.rows, [{ nspname: 'lingxios' }], 'Expected isolated benchmark schema')
    return pool
  } catch (error) {
    await pool.end()
    throw error
  }
}

export async function openLingxiOS({ pool, root, manifest, task, tools, executeTool, inspect, baseUrl, identity, runtime }) {
  const candidate = runtime === 'lingxios-candidate'
  const { createLingxiOS, NoEffectError } = candidate ? await import('./.state/candidate/dist/src/index.js') : await import('@lingxi-org/lingxios')
  const { createWorker } = candidate ? await import('./.state/candidate/dist/src/worker/index.js') : await import('@lingxi-org/lingxios/worker')
  const { executeRequest } = candidate ? await import('./.state/candidate/dist/src/eval/index.js') : await import('@lingxi-org/lingxios/eval')
  const budget = {
    maxModelCalls: manifest.maxModelRequests,
    wallClockMs: manifest.timeoutMs,
    inputCostMicrosPerMillion: 300_000,
    outputCostMicrosPerMillion: 1_200_000,
  }
  const app = await createLingxiOS({
    database: pool, homesRoot: root, background: { role: 'passive' },
    persona: { name: 'Assistant', role: 'assistant', instructions: manifest.instruction },
    modelBudget: budget,
    tools: tools.map(({ name, description, parameters }) => ({
      name, description, parameters, action: name.replace('__', '.'),
      effect: name === 'document__read' ? 'read' : 'transaction',
      approval: false,
      parse: args => args,
      async authorize({ work }) {
        assert.equal(work.principalId, identity)
      },
      async execute(_context, args) {
        const result = await executeTool(name, args)
        if (result.outcome !== 'ok') throw new NoEffectError(JSON.stringify(result), 'native_rejected')
        return { ok: true, value: result }
      },
      ...(name === 'document__edit' ? { async verify(_context, _input, receipt) {
        const state = await inspect()
        return { status: receipt?.revision === state.revision && receipt?.content === state.content ? 'passed' : 'failed',
          evidence: { revision: state.revision } }
      } } : {}),
    })),
  })
  const worker = createWorker({
    controlPlane: app, modelBudget: budget, worker: { concurrency: 1, shutdownGraceMs: 1000 },
    model: {
      id: manifest.model.id, apiKey: 'benchmark-loopback', baseUrl,
      maxOutputTokens: manifest.model.maxTokens, maxThinkingTokens: 0,
      contextWindowTokens: 1_000_000, requestTimeoutMs: manifest.timeoutMs,
      capabilities: { parallelTools: false },
    },
  })
  return {
    async run(prompt) {
      const result = await executeRequest(app, worker, {
        id: identity, tenantId: identity, principalId: identity, sessionId: identity,
        agentId: 'benchmark', text: prompt, mode: 'execute', codeExecution: 'disabled',
        deliveryMode: task.id.startsWith('edit-') ? 'action' : 'text',
      })
      const state = await app.readRun(result.identity)
      return {
        answer: result.message?.body ?? '',
        status: state?.status === 'succeeded' && result.message ? 'completed' : 'runtime-error',
        runtimeStatus: state?.status ?? 'missing',
        runtimeGaps: result.outcome?.gaps ?? [],
      }
    },
    async diagnostics() {
      const result = await pool.query(`SELECT observation->'stageTimings' AS timing,
        observation->'failure' AS failure, observation->'attempt' AS attempt,
        observation->'status' AS status, observation->'latencyMs' AS "latencyMs"
        FROM lingxios.agent_model_budget_calls WHERE work_id = $1 ORDER BY available_at, call_id`, [identity])
      return result.rows
    },
    async stop() {
      await app.cancel({ runId: identity, tenantId: identity, agentId: 'benchmark', sessionId: identity, principalId: identity })
        .catch(() => {})
      await worker.stop()
      await app.stop()
    },
  }
}

export async function openDeepSeek({ root, manifest, tools, baseUrl, fixtureUrl, identity }) {
  const patchPath = join(root, 'cordis.patch.json')
  const disable = ['llm-deepseek', 'deepseek-llm-api-extensions', 'session-log-deepseek', 'plugin-package-inventory-deepseek',
    'tool-fs', 'tool-working-directory', 'persistent-bash', 'persistent-pwsh']
  await writeFile(patchPath, JSON.stringify([
    ...disable.map(id => ({ id, disabled: true })),
    { insert: [{ id: 'eval-model', name: '@deepseek-ai/dsh-llm-pi-ai', config: {
      providers: { benchmark: {
        api: 'openai-completions', apiKeyEnv: 'HARNESS_LOOPBACK_KEY', baseURL: baseUrl,
        models: [{ id: manifest.model.id, contextWindow: 1_000_000, maxTokens: manifest.model.maxTokens, reasoningEfforts: false }],
        compat: { maxTokensField: 'max_tokens', supportsDeveloperRole: false, supportsStore: false },
        retryPolicy: { mode: 'normal', maxRetries: 0 },
      } },
    } },
    { id: 'eval-documents', name: plugin, inject: ['tools'], config: { fixtureUrl, tools } }] },
  ]))
  const child = spawn(dsh, ['sdk-minimal', '--patch', patchPath], {
    cwd: root,
    env: { PATH: process.env.PATH, HOME: root, DSH_HOME: join(root, 'dsh-home'),
      DSH_SYSTEM_PROMPT: manifest.instruction, HARNESS_LOOPBACK_KEY: 'benchmark-loopback' },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  const pending = new Map()
  let sequence = 0
  let stderr = ''
  let answer = ''
  let endReason = ''
  child.stderr.setEncoding('utf8').on('data', chunk => { stderr = (stderr + chunk).slice(-2000) })
  createInterface({ input: child.stdout }).on('line', line => {
    const frame = JSON.parse(line)
    if (frame.id && !frame.method) {
      const resolve = pending.get(frame.id)
      pending.delete(frame.id)
      resolve?.(frame)
    }
    if (frame.method !== 'session.event' || frame.params.sessionId !== identity) return
    const event = frame.params.event
    if (event.type === 'turn/end') endReason = event.data.reason.kind
    if (event.type === 'assistant/message') {
      const blocks = event.data.message.content.filter(part => part.type === 'text')
      if (blocks.length) answer = blocks.map(part => part.text).join('')
    }
  })
  const exited = new Promise(resolve => {
    child.once('error', () => resolve())
    child.once('exit', resolve)
  })
  function rpc(method, params, timeoutMs = manifest.timeoutMs) {
    const id = ++sequence
    const deadline = AbortSignal.timeout(timeoutMs)
    const request = new Promise(resolve => {
      pending.set(id, resolve)
      deadline.addEventListener('abort', () => resolve({ error: { message: 'rpc deadline', code: 'timeout' } }), { once: true })
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n', error => {
        if (error) resolve({ error: { message: 'sdk stdin closed' } })
      })
    })
    return Promise.race([request, exited.then(() => ({ error: { message: 'sdk process exited' } }))])
      .then(frame => {
        if (frame.error) throw Object.assign(new Error(frame.error.message), { code: frame.error.code })
        return frame.result
      }).finally(() => pending.delete(id))
  }
  async function stop() {
    await rpc('shutdown', {}, 1000).catch(() => {})
    child.stdin.end()
    child.kill()
    const kill = setTimeout(() => child.kill('SIGKILL'), 1000)
    try { await exited } finally { clearTimeout(kill) }
  }
  try {
    await rpc('initialize', { cwd: root, provider: 'benchmark', model: manifest.model.id, maxTokens: manifest.model.maxTokens }, 15000)
  } catch (error) {
    await stop()
    throw new Error(`DeepSeek SDK initialization: ${error.message}\n${stderr}`)
  }
  return {
    async run(prompt) {
      await rpc('session/prompt', { sessionId: identity, contentBlocks: [{ type: 'text', text: prompt }] })
      await rpc('session/wait', { sessionId: identity })
      return { answer, runtimeStatus: endReason, status: endReason === 'completed' || endReason === 'success' || endReason === 'stop'
        ? 'completed' : 'runtime-error' }
    },
    stop,
  }
}
