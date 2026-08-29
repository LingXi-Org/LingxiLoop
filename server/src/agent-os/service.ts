import '../logging.js'
import http from 'node:http'
import { parseAgentOSConcurrency } from './concurrency-config.js'
import { HttpHostAdapter } from './host-adapter.js'
import { KernelManager } from './kernel-manager.js'
import { OpenAIChatDriver } from './model-driver.js'
import { AgentOSRuntime } from './runtime.js'

function required(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`missing required environment variable: ${name}`)
  return value
}

const port = Number(process.env.AGENT_OS_PORT ?? 5190)
const workerId = process.env.AGENT_OS_WORKER_ID ?? `agent-os-${process.pid}`
const host = new HttpHostAdapter({
  baseUrl: required('LINGXILOOP_CONTROL_PLANE_URL'),
  serviceToken: required('AGENT_OS_SERVICE_TOKEN'),
  workerId,
})
const model = new OpenAIChatDriver(required('OPENAI_MODEL'), {
  apiKey: required('OPENAI_API_KEY'),
  baseURL: process.env.OPENAI_BASE_URL?.trim() || 'https://api.openai.com/v1',
})
const kernels = new KernelManager({ execute: (work, action) => host.executeAction(work, action) })
const runtime = new AgentOSRuntime(host, model, kernels)
const maxConcurrentRuns = parseAgentOSConcurrency(process.env.AGENT_OS_MAX_CONCURRENT_RUNS)
const active = new Map<string, { controller: AbortController; done: Promise<void> }>()
let stopping = false

async function poll(): Promise<void> {
  while (!stopping) {
    try {
      if (active.size >= maxConcurrentRuns) {
        await Promise.race([...active.values()].map((entry) => entry.done))
        continue
      }
      const work = await host.claimWork()
      if (!work) { await new Promise((resolveDelay) => setTimeout(resolveDelay, 750)); continue }
      if (active.has(work.id)) continue
      const controller = new AbortController()
      const done = runtime.runWork(work, controller.signal).finally(() => active.delete(work.id))
      active.set(work.id, { controller, done })
      void done
    } catch (error) {
      console.error('[agent-os] poll failed:', error instanceof Error ? error.message : String(error))
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 2_000))
    }
  }
}

const health = http.createServer((req, res) => {
  if (req.url === '/readyz' || req.url === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: true, workerId, activeRuns: active.size, maxConcurrentRuns, kernels: kernels.size }))
    return
  }
  res.writeHead(404).end()
})
health.listen(port, () => console.log(`[agent-os] ready on :${port} as ${workerId}`))
void poll()

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    stopping = true
    for (const { controller } of active.values()) controller.abort()
    kernels.close()
    health.close(() => process.exit(0))
  })
}
