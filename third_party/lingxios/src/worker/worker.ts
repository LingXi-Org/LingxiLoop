/**
 * AgentWorker — the long-running worker process body: claim loop with bounded
 * concurrency, health/metrics endpoints, and graceful drain.
 *
 * Separated from `main.ts` so the whole lifecycle is testable in-process.
 */
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { errorMessage } from '../errors.js'
import type { HostPort } from '../host/port.js'
import type { KernelManager } from '../kernel/manager.js'
import { nullLogger, type Logger } from '../logging.js'
import type { MetricsRegistry } from '../metrics.js'
import type { AgentRuntime } from '../runtime/runtime.js'

export interface AgentWorkerOptions {
  host: HostPort
  runtime: AgentRuntime
  kernels?: KernelManager
  workerId: string
  maxConcurrentRuns: number
  shutdownGraceMs: number
  pollIdleMs?: number
  healthPort?: number
  logger?: Logger
  metrics?: MetricsRegistry
}

export class AgentWorker {
  private readonly active = new Map<string, Promise<void>>()
  private readonly logger: Logger
  private readonly pollIdleMs: number
  private stopping = false
  private polling: Promise<void> | null = null
  private health: http.Server | null = null

  constructor(private readonly options: AgentWorkerOptions) {
    this.logger = (options.logger ?? nullLogger).child({ workerId: options.workerId })
    this.pollIdleMs = options.pollIdleMs ?? 750
  }

  get activeRuns(): number { return this.active.size }
  get draining(): boolean { return this.stopping }

  async start(): Promise<{ healthPort: number | null }> {
    let healthPort: number | null = null
    if (this.options.healthPort !== undefined) {
      this.health = http.createServer((req, res) => {
        if (req.url === '/healthz') {
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify(this.status()))
          return
        }
        if (req.url === '/readyz') {
          res.writeHead(this.stopping ? 503 : 200, { 'content-type': 'application/json' })
          res.end(JSON.stringify(this.status()))
          return
        }
        if (req.url === '/metrics' && this.options.metrics) {
          res.writeHead(200, { 'content-type': 'text/plain; version=0.0.4' })
          res.end(this.options.metrics.expose())
          return
        }
        res.writeHead(404).end()
      })
      healthPort = await new Promise<number>((resolveListen, rejectListen) => {
        this.health!.once('error', rejectListen)
        this.health!.listen(this.options.healthPort, () => {
          resolveListen((this.health!.address() as AddressInfo).port)
        })
      })
    }
    this.polling = this.poll()
    this.logger.info('worker started', { healthPort, maxConcurrentRuns: this.options.maxConcurrentRuns })
    return { healthPort }
  }

  private status(): Record<string, unknown> {
    return {
      ok: !this.stopping,
      workerId: this.options.workerId,
      activeRuns: this.active.size,
      maxConcurrentRuns: this.options.maxConcurrentRuns,
      draining: this.stopping,
      ...(this.options.kernels ? { kernels: this.options.kernels.size } : {}),
    }
  }

  private async poll(): Promise<void> {
    while (!this.stopping) {
      try {
        if (this.active.size >= this.options.maxConcurrentRuns) {
          await Promise.race(this.active.values())
          continue
        }
        const work = await this.options.host.claimWork()
        if (this.stopping) return
        if (!work) {
          await this.sleep(this.pollIdleMs)
          continue
        }
        if (this.active.has(work.id)) continue
        this.options.metrics?.gauge('agentos_worker_active_runs', 'Runs in flight').set(this.active.size + 1)
        const done = this.options.runtime.runWork(work)
          .catch((error: unknown) => {
            this.logger.error('work escaped runtime handling', { workId: work.id, error: errorMessage(error) })
          })
          .finally(() => {
            this.active.delete(work.id)
            this.options.metrics?.gauge('agentos_worker_active_runs', 'Runs in flight').set(this.active.size)
          })
        this.active.set(work.id, done)
      } catch (error) {
        if (this.stopping) return
        this.logger.error('poll failed', { error: errorMessage(error) })
        await this.sleep(2_000)
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolveSleep) => {
      const timer = setTimeout(resolveSleep, ms)
      timer.unref?.()
    })
  }

  /**
   * Graceful drain: stop claiming, let in-flight runs finish inside the grace
   * window, then tear everything down. Idempotent.
   */
  async stop(): Promise<{ timedOut: boolean }> {
    if (this.stopping) {
      await this.polling
      return { timedOut: false }
    }
    this.stopping = true
    let graceTimer: NodeJS.Timeout | undefined
    const timedOut = await Promise.race([
      Promise.allSettled([this.polling, ...this.active.values()]).then(() => false),
      new Promise<true>((resolveTimeout) => {
        graceTimer = setTimeout(() => resolveTimeout(true), this.options.shutdownGraceMs)
        graceTimer.unref?.()
      }),
    ])
    if (graceTimer) clearTimeout(graceTimer)
    if (timedOut) this.logger.error('shutdown grace period expired', { graceMs: this.options.shutdownGraceMs })
    this.options.kernels?.close()
    if (this.health) {
      await new Promise<void>((resolveClose) => {
        this.health!.close(() => resolveClose())
        this.health!.closeAllConnections?.()
      })
    }
    this.logger.info('worker stopped', { timedOut })
    return { timedOut }
  }
}
