import { assembleHarness, createLingxiOS, doctor, type ModelCallObservation } from '@lyyzka/lingxios'
import { createWorker, type WorkerOptions } from '@lyyzka/lingxios/worker'
import { execFileSync } from 'node:child_process'
import { pool } from '../db/pool.js'
import { env } from '../env.js'
import { recordLlmCall } from '../llm-ledger.js'
import { createProductTools } from './tools.js'
import { createProductContext, ProductRuntimePolicy } from './context.js'
import { createProductDelivery } from './delivery.js'
import { createCanvasRuntime, completeCanvasWork } from '../modules/canvas/index.js'
import { resolveMemoryScopes } from '../modules/memory/public.js'
import { nativeEvolutionBenchmark, createNativeEvolutionEvaluator } from '../modules/memory/evolution.js'
import { scheduleRoutines } from '../modules/routines/public.js'
import { withTransaction } from '../db/transaction.js'
import { createProductHarness } from './harness.js'
import { productConversationId, assertFrozenAudience } from './identity.js'
import { authorizeAudienceRead } from '../agents/tools.js'
import { loadRuntimeBinding } from './context.js'
import { siliconFlowCost, siliconFlowPricing } from './pricing.js'

function positiveInteger(name: string, fallback: number): number {
  const raw = process.env[name]?.trim()
  const value = raw ? Number(raw) : fallback
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`)
  return value
}

function modelRate(name: string, fallback = 0): number {
  const raw = process.env[name]?.trim()
  if (!raw && env.NODE_ENV === 'production' && !fallback) throw new Error(`${name} is required in production`)
  const value = raw ? Number(raw) : fallback
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer`)
  return value
}

function kernelOptions() {
  const homesRoot = process.env.AGENT_OS_HOMES_ROOT?.trim() || '.agent-os/homes'
  if (env.NODE_ENV === 'production' && process.env.LINGXIOS_CONTAINER_ISOLATED !== 'true') {
    throw new Error('production LingxiOS workers require LINGXIOS_CONTAINER_ISOLATED=true and container resource isolation')
  }
  return {
    kernel: { homesRoot, pythonCommand: process.env.AGENT_OS_PYTHON?.trim() || (process.platform === 'win32' ? 'python' : 'python3'),
      ...(env.NODE_ENV === 'production' ? { isolation: 'bubblewrap' as const } : {}) },
  }
}

function providerPricing(model = env.OPENAI_MODEL) {
  if (model !== 'deepseek-ai/DeepSeek-V4-Flash' || new URL(env.OPENAI_BASE_URL).hostname !== 'api.siliconflow.cn') return undefined
  const rate = process.env.SILICONFLOW_USD_CNY_RATE?.trim()
  if (!rate && env.NODE_ENV === 'production') throw new Error('SILICONFLOW_USD_CNY_RATE is required in production')
  return siliconFlowPricing(Number(rate || 7))
}
const common = () => {
  const pricing=providerPricing()
  return { database: pool,
    modelBudget: {
      maxModelCalls: positiveInteger('AGENT_OS_MAX_MODEL_CALLS', 128),
      maxTokens: positiveInteger('AGENT_OS_MAX_MODEL_TOKENS', 1_000_000),
      ...(env.NODE_ENV === 'production' || process.env.AGENT_OS_MAX_MODEL_COST_MICROS?.trim() ? { maxCostMicros: positiveInteger('AGENT_OS_MAX_MODEL_COST_MICROS', 10_000_000) } : {}),
      wallClockMs: positiveInteger('AGENT_OS_MAX_WORK_MS', 30 * 60_000),
      inputCostMicrosPerMillion: modelRate('AGENT_OS_INPUT_COST_MICROS_PER_MILLION',pricing ? Math.ceil(pricing.inputPerMillion*1_000_000/pricing.usdCny) : 0),
      outputCostMicrosPerMillion: modelRate('AGENT_OS_OUTPUT_COST_MICROS_PER_MILLION',pricing ? Math.ceil(pricing.outputPerMillion*1_000_000/pricing.usdCny) : 0),
    },
    onModelCall: recordModelCall,
} }

let control: ReturnType<typeof createLingxiOS> | undefined

/** Web/API ownership: ingress, reads, cancellation and approval continuation only. */
export function lingxiOSControl(): ReturnType<typeof createLingxiOS> {
  if (!control) {
    const harness = createProductHarness(createProductTools(lingxiOSControl))
    const { tools } = assembleHarness(harness)
    control = createLingxiOS({ ...common(), harness, ...createProductContext(tools), delivery: createProductDelivery(lingxiOSControl),
      performance: { notifications: true, contextSnapshot: true, outboxConcurrency: 4 },
      realtime: { async allowDraft(work) {
        if (work.conversation?.internal) return false
        await loadRuntimeBinding({ ...work, conversationId: productConversationId(work) })
        await assertFrozenAudience(pool,work)
        await authorizeAudienceRead({ work,database: pool },{ action: 'conversation:read',resource: { type: 'conversation',id: productConversationId(work) } })
        return true
      } },
      memory: { contextBudget: { ratio: 0.08, maxTokens: 8000, concurrency: 2, timeoutMs: 10000, optionalRecall: true },
        reflection: { afterInteractions: 5, idleMs: 600000 },
        evolution: { benchmarkId: nativeEvolutionBenchmark.id }, async resolveScopes(work,database,signal) {
        const scopes = await resolveMemoryScopes(work,database,signal)
        if (scopes.length) await (await lingxiOSControl()).freezeEvolutionBenchmark(work.tenantId,nativeEvolutionBenchmark)
        return scopes
      } }, verifyRun: createCanvasRuntime(lingxiOSControl).verify,
      homesRoot: process.env.AGENT_OS_HOMES_ROOT?.trim() || '.agent-os/homes' })
  }
  return control
}

async function recordModelCall(observation: ModelCallObservation): Promise<void> {
  if (!observation.cost) throw new Error('model observation is missing its durable price and cost snapshot')
  const binding = (await pool.query<{ conversation_id: string }>('SELECT conversation_id FROM agent_run_bindings WHERE company_id=$1 AND run_id=$2',
    [observation.tenantId,observation.workId])).rows[0]
  const usage = observation.usage?.available ? observation.usage : undefined
  const pricing=providerPricing(observation.model), billing=usage && pricing ? siliconFlowCost(usage,pricing) : undefined
  const record = {
    context: {
      purpose: `lingxios.${observation.purpose}`,
      companyId: observation.tenantId,
      agentId: observation.agentId,
      runId: observation.workId,
      ...(binding ? { conversationId: binding.conversation_id } : {}),
      source: 'agent-os' as const,
      extras: { callId: observation.callId, pricing: observation.cost.pricing, costMeasurement: observation.cost.usage,
        ...(billing ? { providerPricing: pricing,...billing } : {}),
        ...(observation.instructionsSha256 ? { instructionsSha256: observation.instructionsSha256 } : {}),
        ...(observation.threadId ? { threadId: observation.threadId } : {}),
        ...(observation.principalId ? { principalId: observation.principalId } : {}) },
    },
    model: observation.model,
    ...(usage ? { usage: {
      prompt_tokens: usage.inputTokens,
      completion_tokens: usage.outputTokens,
      ...(usage.cachedInputTokens !== undefined ? { prompt_tokens_details: { cached_tokens: usage.cachedInputTokens } } : {}),
    } } : {}),
    costUsd: billing?.costUsd ?? observation.cost.amountMicros / 1_000_000,
    costEstimated: true,
    latencyMs: observation.latencyMs,
    status: observation.status,
    ...(observation.error ? { error: observation.error } : {}),
    measured: observation.usage?.available === true,
  }
  await recordLlmCall(record, pool, `lingxios-${observation.callId}`)
}

let worker: ReturnType<typeof createWorker> | undefined

export async function stopLingxiOSControl(): Promise<void> {
  const current = control
  control = undefined
  if (current) await (await current).stop()
}

export function lingxiOSServiceToken(): string {
  const token = process.env.LINGXIOS_SERVICE_TOKEN?.trim()
  if (!token || token.length < 32) throw new Error('LINGXIOS_SERVICE_TOKEN must contain at least 32 characters')
  return token
}

export async function listenLingxiOSControl() {
  return (await lingxiOSControl()).listenControlPlane({ serviceToken: lingxiOSServiceToken(),
    port: positiveInteger('LINGXIOS_CONTROL_PORT',5182), host: process.env.LINGXIOS_CONTROL_HOST?.trim() || '127.0.0.1' })
}

/** Worker ownership: the sole in-process agent runner; PostgreSQL leases fence replicas. */
export async function startLingxiOSWorker() {
  if (worker) throw new Error('LingxiOS worker already started in this process')
  const options = {
    modelBudget: common().modelBudget,
    controlPlane: { url: process.env.LINGXIOS_CONTROL_URL?.trim() || 'http://127.0.0.1:5182', serviceToken: lingxiOSServiceToken() },
    ...kernelOptions(), policy: new ProductRuntimePolicy(),
    model: { id: env.OPENAI_MODEL, apiKey: env.OPENAI_API_KEY, baseUrl: env.OPENAI_BASE_URL,
      reasoningEffort: 'high' as const },
    worker: { id: `lingxiloop-${env.INSTANCE_ID}`, concurrency: positiveInteger('AGENT_OS_MAX_CONCURRENT_RUNS', 2), reservedInteractiveRuns: 1 },
    resources: { model: 2, python: 1 },
    performance: { checkpointDedup: true, promptCache: true, asyncCompaction: true, onDemandAttachments: true },
    evolutionEvaluator: createNativeEvolutionEvaluator(lingxiOSControl),
    processors: { canvas_worker: 'conversation', canvas_summary: 'conversation', routine: 'conversation',
      teacher_digest: 'conversation', mission_coordinator: 'conversation', handoff: 'conversation', calendar: 'conversation' },
  } satisfies WorkerOptions
  if (env.NODE_ENV === 'production') execFileSync('bwrap', [
    '--die-with-parent', '--unshare-all', '--new-session', '--ro-bind', '/', '/',
    '--proc', '/proc', '--dev', '/dev', '--', '/usr/bin/true',
  ], { stdio: 'ignore', timeout: 10_000 })
  const readiness = await doctor({ database: pool, pythonCommand: options.kernel.pythonCommand,
    env: { ...process.env, AGENT_OS_MODEL_API_KEY: env.OPENAI_API_KEY } })
  if (!readiness.ready) throw new Error(`LingxiOS worker readiness failed: ${readiness.checks.filter(check => check.status !== 'passed').map(check => check.name).join(', ')}`)
  const app = createWorker(options)
  await app.start()
  worker = app
  const cancellation = new AbortController(), canvas = createCanvasRuntime(lingxiOSControl)
  let pending: Promise<unknown> | undefined
  const tick = () => {
    if (pending || cancellation.signal.aborted) return
    pending = Promise.allSettled([
      scheduleRoutines(run => withTransaction(pool, run), lingxiOSControl),
      canvas.reconcile(pool, completeCanvasWork, cancellation.signal),
    ]).then(results => { for (const result of results) if (result.status === 'rejected') console.error('[lingxios] product scheduling failed', result.reason instanceof Error ? result.reason.name : 'error') })
      .finally(() => { pending = undefined })
  }
  const timer = setInterval(tick, 1000)
  timer.unref()
  tick()
  return { stop: async () => {
    clearInterval(timer); cancellation.abort(); await app.stop()
    await (await lingxiOSControl()).stop()
    if (pending) {
      let timeout: ReturnType<typeof setTimeout> | undefined
      await Promise.race([pending,new Promise<void>(resolve => { timeout = setTimeout(resolve,5000) })])
      if (timeout) clearTimeout(timeout)
    }
    if (worker === app) { worker = undefined; control = undefined }
  } }
}
