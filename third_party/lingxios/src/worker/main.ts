/**
 * Worker entrypoint: wire the HTTP host client, model driver, kernel manager,
 * and runtime together from environment configuration, then run until
 * SIGINT/SIGTERM drains the process.
 */
import { loadWorkerConfig } from '../config.js'
import { HttpHostClient } from '../host/http-client.js'
import { KernelManager } from '../kernel/manager.js'
import { createLogger } from '../logging.js'
import { MetricsRegistry } from '../metrics.js'
import { OpenAIChatDriver } from '../model/openai.js'
import { AgentRuntime } from '../runtime/runtime.js'
import { AgentWorker } from './worker.js'

const config = loadWorkerConfig()
const logger = createLogger().child({ service: 'agent-os-worker' })
const metrics = new MetricsRegistry()

const host = new HttpHostClient({
  baseUrl: config.controlPlaneUrl,
  serviceToken: config.serviceToken,
  workerId: config.workerId,
})
const model = new OpenAIChatDriver(config.model.id, {
  apiKey: config.model.apiKey,
  baseUrl: config.model.baseUrl,
})
const kernels = new KernelManager(
  { execute: (work, action) => host.executeAction(work, action) },
  { logger },
)
const runtime = new AgentRuntime(host, model, kernels, { logger })
const worker = new AgentWorker({
  host,
  runtime,
  kernels,
  workerId: config.workerId,
  maxConcurrentRuns: config.maxConcurrentRuns,
  shutdownGraceMs: config.shutdownGraceMs,
  pollIdleMs: config.pollIdleMs,
  healthPort: config.healthPort,
  logger,
  metrics,
})

await worker.start()

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void worker.stop().then(() => process.exit(0))
  })
}
