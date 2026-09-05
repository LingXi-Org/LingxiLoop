import 'dotenv/config'
import '../logging.js'
import { resolve } from 'node:path'
import {
  AgentRuntime,
  AgentWorker,
  HttpHostClient,
  KernelManager,
  MetricsRegistry,
} from '../../../third_party/lingxios/src/index.js'
import { parseAgentOSConcurrency } from './concurrency-config.js'
import { createMemoryClient, createMemorySynthesisProcessor } from './memory-processor.js'
import { OpenAIChatDriver } from './model-driver.js'
import { LingxiLoopRuntimePolicy } from './runtime.js'
import { PROMPT_CONTRACT_VERSION } from './types.js'

function required(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`missing required environment variable: ${name}`)
  return value
}

function positiveInteger(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback)
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`)
  return value
}

const serviceToken = required('AGENT_OS_SERVICE_TOKEN')
const controlPlaneRoot = `${required('LINGXILOOP_CONTROL_PLANE_URL').replace(/\/+$/, '')}/internal/agent-os`
const workerId = process.env.AGENT_OS_WORKER_ID ?? `agent-os-${process.pid}`
const host = new HttpHostClient({ baseUrl: controlPlaneRoot, serviceToken, workerId })
const model = new OpenAIChatDriver(required('OPENAI_MODEL'), {
  apiKey: required('OPENAI_API_KEY'),
  baseURL: process.env.OPENAI_BASE_URL?.trim() || 'https://api.openai.com/v1',
})
const kernels = new KernelManager(
  { execute: (work, action) => host.executeAction(work, action) },
  {
    pythonCommand: process.env.AGENT_OS_PYTHON ?? 'python3',
    runnerPath: resolve('third_party/lingxios/kernel/runner.py'),
    homesRoot: process.env.AGENT_OS_HOMES_ROOT ?? resolve('.agent-os-v2/homes'),
    maxKernels: positiveInteger('AGENT_OS_MAX_KERNELS', 32),
    executionTimeoutMs: positiveInteger('AGENT_OS_EXECUTION_TIMEOUT_MS', 120_000),
    maxOutputChars: positiveInteger('AGENT_OS_MAX_OUTPUT_CHARS', 8_000),
    allowNetwork: false,
  },
)
const runtime = new AgentRuntime(host, model, kernels, {
  policy: new LingxiLoopRuntimePolicy(),
  heartbeatMs: positiveInteger('AGENT_OS_HEARTBEAT_MS', 5_000),
  maxHops: positiveInteger('AGENT_OS_MAX_HOPS', 12),
  promptContractVersion: PROMPT_CONTRACT_VERSION,
})
runtime.registerProcessor('memory_synthesis', createMemorySynthesisProcessor(
  createMemoryClient({ baseUrl: controlPlaneRoot, serviceToken }),
))

const worker = new AgentWorker({
  host,
  runtime,
  kernels,
  metrics: new MetricsRegistry(),
  workerId,
  healthPort: positiveInteger('AGENT_OS_PORT', 5190),
  maxConcurrentRuns: parseAgentOSConcurrency(process.env.AGENT_OS_MAX_CONCURRENT_RUNS),
  shutdownGraceMs: positiveInteger('AGENT_OS_SHUTDOWN_GRACE_MS', 20_000),
})

await worker.start()

async function shutdown(): Promise<void> {
  await worker.stop()
  process.exit(0)
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => { void shutdown() })
}
