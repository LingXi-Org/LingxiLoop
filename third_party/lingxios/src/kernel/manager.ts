/**
 * Kernel manager: owns the pool of persistent sandboxed Python runners.
 *
 * One kernel per (session key, home epoch). Executions on a kernel are
 * strictly serialized; host calls raised by a cell are dispatched to the
 * injected {@link KernelHostBridge} and answered inline, which is what makes
 * the bridge look synchronous to model-authored Python.
 *
 * Lifecycle: kernels start lazily, are evicted LRU when the pool is full,
 * swept when idle, and killed (never reused) after a timeout or cancellation
 * so a wedged interpreter cannot poison later cells.
 */
import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createInterface, type Interface as ReadlineInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import {
  KernelCancelledError, KernelExecutionError, KernelProtocolError, KernelTimeoutError,
  ApprovalPendingError, asError,
} from '../errors.js'
import { nullLogger, type Logger } from '../logging.js'
import type { KernelToManager, ManagerToKernel } from '../protocol/kernel-wire.js'
import { sessionKeyOf, type CapabilityGrant, type HostAction, type HostActionResult, type KernelExecution, type WorkItem } from '../protocol/types.js'

export interface KernelHostBridge {
  execute(work: WorkItem, action: HostAction): Promise<HostActionResult>
}

export interface HostActionObserver {
  (event: { stage: 'started' | 'completed'; action: HostAction; result?: HostActionResult }): Promise<void>
}

export interface KernelExecutionOptions {
  capabilities?: readonly CapabilityGrant[]
  onHostAction?: HostActionObserver
}

/** Port the runtime depends on; {@link KernelManager} is the implementation. */
export interface KernelExecutor {
  execute(
    work: WorkItem, runId: string, cellId: string, code: string,
    signal?: AbortSignal, options?: KernelExecutionOptions,
  ): Promise<KernelExecution>
}

export interface KernelManagerOptions {
  pythonCommand?: string
  runnerPath?: string
  homesRoot?: string
  idleMs?: number
  maxKernels?: number
  executionTimeoutMs?: number
  maxOutputChars?: number
  allowNetwork?: boolean
  logger?: Logger
}

interface PendingExecution {
  executionId: string
  work: WorkItem
  runId: string
  cellId: string
  options?: KernelExecutionOptions
  resolve(value: KernelExecution): void
  reject(error: Error): void
  timer: NodeJS.Timeout
}

type KernelState = 'created' | 'starting' | 'ready' | 'dead'

class PersistentKernel {
  private child: ChildProcessWithoutNullStreams | null = null
  private lines: ReadlineInterface | null = null
  private state: KernelState = 'created'
  private ready: Promise<void> | null = null
  private readyResolve: (() => void) | null = null
  private readyReject: ((error: Error) => void) | null = null
  /** Serializes executions; a rejected execution never breaks the chain. */
  private tail: Promise<unknown> = Promise.resolve()
  private pending: PendingExecution | null = null
  private queued = 0
  lastUsedAt = Date.now()

  constructor(
    readonly key: string,
    private readonly home: string,
    private readonly bridge: KernelHostBridge,
    private readonly options: Required<Omit<KernelManagerOptions, 'logger'>>,
    private readonly logger: Logger,
    private readonly onIdle: () => void,
  ) {}

  get busy(): boolean { return this.queued > 0 }
  get dead(): boolean { return this.state === 'dead' }

  private async start(): Promise<void> {
    if (this.state === 'ready') return
    if (this.state === 'starting') return this.ready ?? undefined
    if (this.state === 'dead') throw new KernelProtocolError(`kernel ${this.key} is terminated`)
    this.state = 'starting'
    await mkdir(this.home, { recursive: true })
    this.ready = new Promise<void>((resolveReady, rejectReady) => {
      this.readyResolve = resolveReady
      this.readyReject = rejectReady
    })
    const child = spawn(this.options.pythonCommand, ['-I', this.options.runnerPath], {
      cwd: this.home,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        PATH: process.env['PATH'] ?? '',
        SYSTEMROOT: process.env['SYSTEMROOT'] ?? '',
        PYTHONIOENCODING: 'utf-8',
        PYTHONUNBUFFERED: '1',
        AGENT_OS_KERNEL_HOME: this.home,
        AGENT_OS_HOMES_ROOT: this.options.homesRoot,
        AGENT_OS_KERNEL_MAX_OUTPUT_CHARS: String(this.options.maxOutputChars),
        AGENT_OS_KERNEL_ALLOW_NETWORK: this.options.allowNetwork ? '1' : '0',
      },
      windowsHide: true,
    })
    this.child = child
    child.stdin.on('error', (error) => this.terminate(asError(error)))
    child.stdout.on('error', (error) => this.terminate(asError(error)))
    child.stderr.on('error', () => undefined)
    this.lines = createInterface({ input: child.stdout })
    this.lines.on('line', (line) => this.onLine(line))
    let stderrTail = ''
    child.stderr.on('data', (chunk: Buffer) => {
      stderrTail = `${stderrTail}${chunk.toString('utf8')}`.slice(-4_000)
    })
    child.once('error', (error) => this.terminate(asError(error)))
    child.once('exit', (code, signal) => {
      this.terminate(new KernelProtocolError(
        `kernel ${this.key} exited (${code ?? signal ?? 'unknown'})${stderrTail ? `: ${stderrTail}` : ''}`,
      ))
    })
    return this.ready
  }

  private write(message: ManagerToKernel): void {
    const child = this.child
    if (!child?.stdin.writable) throw new KernelProtocolError(`kernel ${this.key} is not writable`)
    // `python -I` ignores PYTHONIOENCODING, so keep the wire ASCII-safe.
    const line = JSON.stringify(message).replace(/[\u007f-\uffff]/g, (character) =>
      `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`)
    child.stdin.write(`${line}\n`, 'ascii')
  }

  private onLine(line: string): void {
    let message: KernelToManager
    try {
      message = JSON.parse(line) as KernelToManager
    } catch {
      this.logger.warn('kernel emitted non-JSON output', { kernel: this.key, line: line.slice(0, 200) })
      return
    }
    switch (message.type) {
      case 'ready':
        this.state = 'ready'
        this.logger.debug('kernel ready', { kernel: this.key, engine: message.engine, python: message.python })
        this.readyResolve?.()
        this.readyResolve = null
        this.readyReject = null
        return
      case 'host_call':
        void this.onHostCall(message)
        return
      case 'protocol_error':
        this.logger.warn('kernel protocol error', { kernel: this.key, error: message.error })
        return
      case 'execution_result': {
        const pending = this.pending
        if (!pending || pending.executionId !== message.id) return
        this.pending = null
        clearTimeout(pending.timer)
        if (message.approvalId) {
          pending.reject(new ApprovalPendingError(message.approvalId, pending.cellId))
        } else if (!message.ok) {
          pending.reject(new KernelExecutionError(message.error || message.stderr || 'kernel execution failed', pending.cellId))
        } else {
          pending.resolve({
            executionId: message.id,
            stdout: message.stdout ?? '',
            stderr: message.stderr ?? '',
            result: message.result,
            durationMs: message.durationMs ?? 0,
            truncated: message.truncated === true,
            artifacts: message.artifacts ?? [],
            directives: message.directives ?? [],
          })
        }
        return
      }
    }
  }

  private async onHostCall(message: Extract<KernelToManager, { type: 'host_call' }>): Promise<void> {
    const pending = this.pending
    if (!pending || pending.executionId !== message.id || !message.requestId || !message.action) {
      this.logger.warn('kernel host_call without a matching execution', { kernel: this.key })
      return
    }
    const action: HostAction = {
      runId: pending.runId,
      cellId: pending.cellId,
      callIndex: message.callIndex,
      action: message.action,
      args: message.args ?? {},
      idempotencyKey: `${pending.runId}:${pending.cellId}:${message.callIndex}`,
    }
    try {
      await pending.options?.onHostAction?.({ stage: 'started', action })
    } catch (error) {
      this.terminate(asError(error))
      return
    }
    let result: HostActionResult
    try {
      result = await this.bridge.execute(pending.work, action)
    } catch (error) {
      result = { ok: false, error: asError(error).message }
    }
    try {
      await pending.options?.onHostAction?.({ stage: 'completed', action, result })
    } catch (error) {
      this.terminate(asError(error))
      return
    }
    try {
      this.write({ type: 'host_result', requestId: message.requestId, ...result })
    } catch (error) {
      this.terminate(asError(error))
    }
  }

  execute(work: WorkItem, runId: string, cellId: string, code: string, signal?: AbortSignal, options?: KernelExecutionOptions): Promise<KernelExecution> {
    this.queued++
    const operation = this.tail.then(async () => {
      signal?.throwIfAborted()
      await this.start()
      this.lastUsedAt = Date.now()
      const executionId = randomUUID()
      return await new Promise<KernelExecution>((resolveExecution, rejectExecution) => {
        const settle = (settleFn: () => void) => {
          signal?.removeEventListener('abort', onAbort)
          settleFn()
        }
        const timer = setTimeout(() => {
          this.pending = null
          this.terminate(new KernelTimeoutError(this.options.executionTimeoutMs, cellId), 'SIGKILL')
          settle(() => rejectExecution(new KernelTimeoutError(this.options.executionTimeoutMs, cellId)))
        }, this.options.executionTimeoutMs)
        timer.unref?.()
        const onAbort = () => {
          clearTimeout(timer)
          this.pending = null
          this.terminate(new KernelCancelledError(cellId), 'SIGKILL')
          settle(() => rejectExecution(new KernelCancelledError(cellId)))
        }
        if (signal?.aborted) { onAbort(); return }
        signal?.addEventListener('abort', onAbort, { once: true })
        this.pending = {
          executionId, work, runId, cellId,
          ...(options ? { options } : {}),
          timer,
          resolve: (value) => settle(() => resolveExecution(value)),
          reject: (error) => settle(() => rejectExecution(error)),
        }
        try {
          this.write({
            type: 'execute', id: executionId, code,
            context: { runId, cellId, capabilities: [...(options?.capabilities ?? [])] },
          })
        } catch (error) {
          clearTimeout(timer)
          this.pending = null
          settle(() => rejectExecution(asError(error)))
        }
      })
    })
    this.tail = operation.catch(() => undefined)
    return operation.finally(() => {
      this.queued--
      this.lastUsedAt = Date.now()
      if (!this.busy) this.onIdle()
    })
  }

  /** Kill the process and fail everything in flight. Idempotent. */
  terminate(reason: Error, signal: NodeJS.Signals = 'SIGTERM'): void {
    if (this.state === 'dead') return
    this.state = 'dead'
    const child = this.child
    this.child = null
    this.lines?.close()
    this.lines = null
    if (child && !child.killed) child.kill(signal)
    this.readyReject?.(reason)
    this.readyResolve = null
    this.readyReject = null
    const pending = this.pending
    this.pending = null
    if (pending) {
      clearTimeout(pending.timer)
      pending.reject(reason)
    }
  }
}

function positiveInteger(value: string | number, name: string): number {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer`)
  return parsed
}

export class KernelManager implements KernelExecutor {
  private readonly kernels = new Map<string, PersistentKernel>()
  private readonly options: Required<Omit<KernelManagerOptions, 'logger'>>
  private readonly logger: Logger
  private readonly sweepTimer: NodeJS.Timeout
  private readonly capacityWaiters = new Set<() => void>()
  private closed = false

  constructor(private readonly bridge: KernelHostBridge, options: KernelManagerOptions = {}) {
    const localPython = resolve(process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python')
    this.logger = options.logger ?? nullLogger
    this.options = {
      pythonCommand: options.pythonCommand ?? process.env['AGENT_OS_PYTHON']
        ?? (existsSync(localPython) ? localPython : process.platform === 'win32' ? 'python' : 'python3'),
      runnerPath: resolve(options.runnerPath ?? process.env['AGENT_OS_KERNEL_RUNNER'] ?? fileURLToPath(new URL('../../../kernel/runner.py', import.meta.url))),
      homesRoot: resolve(options.homesRoot ?? process.env['AGENT_OS_HOMES_ROOT'] ?? '.agent-os/homes'),
      idleMs: options.idleMs ?? positiveInteger(process.env['AGENT_OS_KERNEL_IDLE_MS'] ?? 90 * 60_000, 'AGENT_OS_KERNEL_IDLE_MS'),
      maxKernels: options.maxKernels === undefined && process.env['AGENT_OS_MAX_KERNELS'] === undefined
        ? Number.POSITIVE_INFINITY
        : positiveInteger(options.maxKernels ?? process.env['AGENT_OS_MAX_KERNELS']!, 'AGENT_OS_MAX_KERNELS'),
      executionTimeoutMs: options.executionTimeoutMs ?? 120_000,
      maxOutputChars: options.maxOutputChars ?? 8_000,
      allowNetwork: options.allowNetwork ?? false,
    }
    this.sweepTimer = setInterval(() => this.sweepIdle(), Math.min(60_000, this.options.idleMs))
    this.sweepTimer.unref?.()
  }

  private key(work: WorkItem): string {
    return `${sessionKeyOf(work)}#${work.homeEpoch}`
  }

  /** Identifiers are data, never path components: hash every segment. */
  private homeOf(work: WorkItem): string {
    const segment = (value: string) => createHash('sha256').update(value).digest('hex').slice(0, 24)
    return resolve(
      this.options.homesRoot,
      segment(work.tenantId),
      segment(work.agentId),
      segment(`${work.sessionId}:${work.threadId ?? '-'}`),
      `epoch-${work.homeEpoch}`,
    )
  }

  private evictLeastRecentlyUsedIdle(): boolean {
    let candidate: [string, PersistentKernel] | undefined
    for (const entry of this.kernels) {
      if (entry[1].busy) continue
      if (!candidate || entry[1].lastUsedAt < candidate[1].lastUsedAt) candidate = entry
    }
    if (!candidate) return false
    candidate[1].terminate(new KernelCancelledError('evicted'))
    this.kernels.delete(candidate[0])
    return true
  }

  private waitForCapacity(cellId: string, signal?: AbortSignal): Promise<void> {
    return new Promise((resolveWait, rejectWait) => {
      const cleanup = () => {
        this.capacityWaiters.delete(wake)
        signal?.removeEventListener('abort', abort)
      }
      const wake = () => { cleanup(); resolveWait() }
      const abort = () => { cleanup(); rejectWait(new KernelCancelledError(cellId)) }
      this.capacityWaiters.add(wake)
      if (signal?.aborted) abort()
      else signal?.addEventListener('abort', abort, { once: true })
    })
  }

  private wakeCapacityWaiters(): void {
    for (const wake of [...this.capacityWaiters]) wake()
  }

  async execute(work: WorkItem, runId: string, cellId: string, code: string, signal?: AbortSignal, options?: KernelExecutionOptions): Promise<KernelExecution> {
    if (!Number.isSafeInteger(work.homeEpoch) || work.homeEpoch < 1) {
      throw new KernelProtocolError('work.homeEpoch must be a positive integer')
    }
    const key = this.key(work)
    let kernel = this.kernels.get(key)
    while (!kernel || kernel.dead) {
      if (kernel?.dead) this.kernels.delete(key)
      if (this.closed) throw new KernelCancelledError(cellId)
      if (this.kernels.size >= this.options.maxKernels && !this.evictLeastRecentlyUsedIdle()) {
        await this.waitForCapacity(cellId, signal)
        kernel = this.kernels.get(key)
        continue
      }
      kernel = new PersistentKernel(
        key, this.homeOf(work), this.bridge, this.options, this.logger.child({ kernel: key }),
        () => this.wakeCapacityWaiters(),
      )
      this.kernels.set(key, kernel)
    }
    try {
      return await kernel.execute(work, runId, cellId, code, signal, options)
    } finally {
      if (kernel.dead && this.kernels.get(key) === kernel) {
        this.kernels.delete(key)
        this.wakeCapacityWaiters()
      }
    }
  }

  sweepIdle(now = Date.now()): number {
    let removed = 0
    for (const [key, kernel] of this.kernels) {
      if (kernel.busy) continue
      if (!kernel.dead && now - kernel.lastUsedAt < this.options.idleMs) continue
      kernel.terminate(new KernelCancelledError('idle-swept'))
      this.kernels.delete(key)
      removed++
    }
    if (removed > 0) this.wakeCapacityWaiters()
    return removed
  }

  close(): void {
    this.closed = true
    clearInterval(this.sweepTimer)
    for (const kernel of this.kernels.values()) kernel.terminate(new KernelCancelledError('manager-closed'))
    this.kernels.clear()
    this.wakeCapacityWaiters()
  }

  get size(): number { return this.kernels.size }
}
