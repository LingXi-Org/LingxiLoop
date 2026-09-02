import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { createInterface, type Interface as ReadlineInterface } from 'node:readline'
import type { AgentWorkItem, HostAction, HostActionResult, KernelExecution } from './types.js'

export interface KernelHostBridge {
  execute(work: AgentWorkItem, action: HostAction): Promise<HostActionResult>
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
}

export interface KernelExecutor {
  execute(work: AgentWorkItem, runId: string, cellId: string, code: string, signal?: AbortSignal, options?: KernelExecutionOptions): Promise<KernelExecution>
}

export interface KernelExecutionOptions {
  allowedNamespaces?: readonly string[]
  allowedMethods?: Readonly<Record<string, readonly string[]>>
  onHostAction?: (event: {
    stage: 'started' | 'completed'
    action: HostAction
    result?: HostActionResult
  }) => Promise<void>
}

interface KernelMessage {
  type: string
  id?: string
  requestId?: string
  runId?: string
  cellId?: string
  callIndex?: number
  action?: string
  args?: unknown
  ok?: boolean
  stdout?: string
  stderr?: string
  result?: unknown
  error?: string
  approvalId?: string
  truncated?: boolean
  durationMs?: number
  artifacts?: KernelExecution['artifacts']
  directives?: KernelExecution['directives']
}

interface PendingExecution {
  work: AgentWorkItem
  runId: string
  cellId: string
  options?: KernelExecutionOptions
  resolve(value: KernelExecution): void
  reject(error: Error): void
  timer: NodeJS.Timeout
}

class PersistentKernel {
  private process: ChildProcessWithoutNullStreams | null = null
  private lines: ReadlineInterface | null = null
  private ready: Promise<void> | null = null
  private readyResolve: (() => void) | null = null
  private readyReject: ((error: Error) => void) | null = null
  private tail: Promise<unknown> = Promise.resolve()
  private readonly pending = new Map<string, PendingExecution>()
  private queuedExecutions = 0
  lastUsedAt = Date.now()

  constructor(
    private readonly key: string,
    private readonly home: string,
    private readonly bridge: KernelHostBridge,
    private readonly options: Required<KernelManagerOptions>,
    private readonly onIdle: () => void,
  ) {}

  private async start(): Promise<void> {
    if (this.process) return this.ready ?? Promise.resolve()
    await mkdir(this.home, { recursive: true })
    await mkdir(dirname(this.options.runnerPath), { recursive: true })
    this.ready = new Promise<void>((resolveReady, rejectReady) => {
      this.readyResolve = resolveReady
      this.readyReject = rejectReady
    })
    const child = spawn(this.options.pythonCommand, ['-I', this.options.runnerPath], {
      cwd: this.home,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        PATH: process.env.PATH ?? '',
        SYSTEMROOT: process.env.SYSTEMROOT ?? '',
        PYTHONIOENCODING: 'utf-8',
        PYTHONUNBUFFERED: '1',
        LINGXILOOP_AGENT_HOME: this.home,
        LINGXILOOP_HOMES_ROOT: this.options.homesRoot,
        LINGXILOOP_KERNEL_MAX_OUTPUT_CHARS: String(this.options.maxOutputChars),
        LINGXILOOP_KERNEL_ALLOW_NETWORK: this.options.allowNetwork ? '1' : '0',
      },
      windowsHide: true,
    })
    this.process = child
    child.stdin.on('error', (error) => this.failAll(error))
    child.stdout.on('error', (error) => this.failAll(error))
    child.stderr.on('error', (error) => this.failAll(error))
    this.lines = createInterface({ input: child.stdout })
    this.lines.on('line', (line) => this.onLine(line))
    this.lines.on('error', (error) => this.failAll(error))
    let stderr = ''
    child.stderr.on('data', (chunk: Buffer) => { stderr = `${stderr}${chunk.toString('utf8')}`.slice(-4000) })
    child.once('error', (error) => this.failAll(error))
    child.once('exit', (code, signal) => {
      this.process = null
      this.lines?.close()
      this.lines = null
      this.failAll(new Error(`IPython kernel ${this.key} exited (${code ?? signal ?? 'unknown'}): ${stderr}`))
    })
    return this.ready
  }

  private write(value: unknown): void {
    if (!this.process?.stdin.writable) throw new Error(`IPython kernel ${this.key} is not writable`)
    // `python -I` ignores PYTHONIOENCODING, so keep the stdio protocol locale-independent.
    const line = JSON.stringify(value).replace(/[\u007f-\uffff]/g, (character) =>
      `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`)
    this.process.stdin.write(`${line}\n`, 'ascii')
  }

  private onLine(line: string): void {
    let message: KernelMessage
    try { message = JSON.parse(line) as KernelMessage } catch { return }
    if (message.type === 'ready') {
      this.readyResolve?.()
      this.readyResolve = null
      this.readyReject = null
      return
    }
    if (message.type === 'host_call') {
      void this.onHostCall(message)
      return
    }
    if (message.type !== 'execution_result' || !message.id) return
    const pending = this.pending.get(message.id)
    if (!pending) return
    clearTimeout(pending.timer)
    this.pending.delete(message.id)
    if (message.approvalId) {
      pending.reject(new ApprovalPendingError(message.approvalId, pending.cellId))
    } else if (!message.ok) {
      pending.reject(new KernelExecutionError(message.error || message.stderr || 'IPython execution failed', pending.cellId))
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
  }

  private async onHostCall(message: KernelMessage): Promise<void> {
    const pending = message.id ? this.pending.get(message.id) : undefined
    const execution = pending ?? [...this.pending.values()][0]
    if (!execution || !message.requestId || !message.action || message.callIndex === undefined) return
    const idempotencyKey = `${execution.runId}:${execution.cellId}:${message.callIndex}`
    const action: HostAction = {
      runId: execution.runId,
      cellId: execution.cellId,
      callIndex: message.callIndex,
      action: message.action,
      args: message.args ?? {},
      idempotencyKey,
    }
    let result: HostActionResult
    try {
      await execution.options?.onHostAction?.({ stage: 'started', action })
    } catch (error) {
      this.failAll(error instanceof Error ? error : new Error(String(error)))
      return
    }
    try {
      result = await this.bridge.execute(execution.work, action)
    } catch (error) {
      result = { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
    try {
      await execution.options?.onHostAction?.({ stage: 'completed', action, result })
    } catch (error) {
      this.failAll(error instanceof Error ? error : new Error(String(error)))
      return
    }
    this.write({ type: 'host_result', requestId: message.requestId, ...result })
  }

  private failAll(error: Error): void {
    this.readyReject?.(error)
    this.readyResolve = null
    this.readyReject = null
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(error)
    }
    this.pending.clear()
  }

  execute(work: AgentWorkItem, runId: string, cellId: string, code: string, signal?: AbortSignal, options?: KernelExecutionOptions): Promise<KernelExecution> {
    this.queuedExecutions++
    const operation = this.tail.then(async () => {
      await this.start()
      this.lastUsedAt = Date.now()
      const executionId = randomUUID()
      return await new Promise<KernelExecution>((resolveExecution, rejectExecution) => {
        const timer = setTimeout(() => {
          this.pending.delete(executionId)
          this.stop('SIGKILL')
          rejectExecution(new KernelTimeoutError(this.options.executionTimeoutMs, cellId))
        }, this.options.executionTimeoutMs)
        timer.unref?.()
        const abort = () => {
          clearTimeout(timer)
          this.pending.delete(executionId)
          this.stop('SIGINT')
          rejectExecution(new KernelCancelledError(cellId))
        }
        if (signal?.aborted) { abort(); return }
        signal?.addEventListener('abort', abort, { once: true })
        this.pending.set(executionId, {
          work, runId, cellId,
          options,
          timer,
          resolve: (value) => { signal?.removeEventListener('abort', abort); resolveExecution(value) },
          reject: (error) => { signal?.removeEventListener('abort', abort); rejectExecution(error) },
        })
        this.write({
          type: 'execute', id: executionId, code,
          context: {
            runId, cellId,
            ...(options?.allowedNamespaces ? { allowedNamespaces: [...options.allowedNamespaces] } : {}),
            ...(options?.allowedMethods ? { allowedMethods: options.allowedMethods } : {}),
          },
        })
      })
    })
    this.tail = operation.catch(() => undefined)
    return operation.finally(() => {
      this.queuedExecutions--
      this.lastUsedAt = Date.now()
      if (!this.busy) this.onIdle()
    })
  }

  stop(signal: NodeJS.Signals = 'SIGTERM'): void {
    const child = this.process
    this.process = null
    if (child && !child.killed) child.kill(signal)
  }

  get busy(): boolean { return this.queuedExecutions > 0 }
}

export class ApprovalPendingError extends Error {
  constructor(readonly approvalId: string, readonly cellId: string) { super(`approval pending: ${approvalId}`) }
}
export class KernelExecutionError extends Error {
  constructor(message: string, readonly cellId: string) { super(message) }
}
export class KernelTimeoutError extends Error {
  constructor(readonly timeoutMs: number, readonly cellId: string) { super(`IPython cell timed out after ${timeoutMs}ms`) }
}
export class KernelCancelledError extends Error {
  constructor(readonly cellId: string) { super('IPython cell cancelled') }
}

function positiveInteger(value: string | number, name: string): number {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer`)
  return parsed
}

export class KernelManager implements KernelExecutor {
  private readonly kernels = new Map<string, PersistentKernel>()
  private readonly options: Required<KernelManagerOptions>
  private readonly sweepTimer: NodeJS.Timeout
  private readonly capacityWaiters = new Set<() => void>()
  private closed = false

  constructor(private readonly bridge: KernelHostBridge, options: KernelManagerOptions = {}) {
    const localPython = resolve(process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python')
    const idleMs = options.idleMs ?? positiveInteger(process.env.AGENT_OS_KERNEL_IDLE_MS ?? 90 * 60_000, 'AGENT_OS_KERNEL_IDLE_MS')
    const maxKernels = options.maxKernels === undefined && process.env.AGENT_OS_MAX_KERNELS === undefined
      ? Number.POSITIVE_INFINITY
      : positiveInteger(options.maxKernels ?? process.env.AGENT_OS_MAX_KERNELS!, 'AGENT_OS_MAX_KERNELS')
    this.options = {
      pythonCommand: options.pythonCommand ?? process.env.AGENT_OS_PYTHON
        ?? (existsSync(localPython) ? localPython : process.platform === 'win32' ? 'python' : 'python3'),
      runnerPath: resolve(options.runnerPath ?? 'server/agent-os/kernel_runner.py'),
      homesRoot: resolve(options.homesRoot ?? process.env.AGENT_OS_HOMES_ROOT ?? '.agent-os/homes'),
      idleMs,
      maxKernels,
      executionTimeoutMs: options.executionTimeoutMs ?? 120_000,
      maxOutputChars: options.maxOutputChars ?? 8_000,
      allowNetwork: options.allowNetwork ?? false,
    }
    this.sweepTimer = setInterval(() => this.sweepIdle(), Math.min(60_000, this.options.idleMs))
    this.sweepTimer.unref?.()
  }

  private key(work: AgentWorkItem, homeEpoch: number): string {
    const sessionKey = [work.companyId, work.agentId, work.channelId, work.threadRootClientMsgNo ?? '-'].join(':')
    return homeEpoch === 1 ? sessionKey : `${sessionKey}:home-epoch:${homeEpoch}`
  }

  private homeSegment(value: string): string {
    // Tenant/agent identifiers are data, never filesystem path components.
    return createHash('sha256').update(value).digest('hex')
  }

  private evictLeastRecentlyUsedIdle(): boolean {
    let candidate: [string, PersistentKernel] | undefined
    for (const entry of this.kernels) {
      if (entry[1].busy) continue
      if (!candidate || entry[1].lastUsedAt < candidate[1].lastUsedAt) candidate = entry
    }
    if (!candidate) return false
    candidate[1].stop()
    this.kernels.delete(candidate[0])
    return true
  }

  private waitForIdle(cellId: string, signal?: AbortSignal): Promise<void> {
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

  async execute(work: AgentWorkItem, runId: string, cellId: string, code: string, signal?: AbortSignal, options?: KernelExecutionOptions): Promise<KernelExecution> {
    const homeEpoch = work.homeEpoch ?? 1
    if (!Number.isSafeInteger(homeEpoch) || homeEpoch < 1) throw new Error('Agent OS home epoch must be a positive integer')
    const key = this.key(work, homeEpoch)
    let kernel = this.kernels.get(key)
    while (!kernel) {
      if (this.closed) throw new KernelCancelledError(cellId)
      if (this.kernels.size >= this.options.maxKernels && !this.evictLeastRecentlyUsedIdle()) {
        await this.waitForIdle(cellId, signal)
        kernel = this.kernels.get(key)
        continue
      }
      const safeCompany = this.homeSegment(work.companyId)
      const safeAgent = this.homeSegment(work.agentId)
      const safeSession = this.homeSegment(`${work.channelId}:${work.threadRootClientMsgNo ?? '-'}`)
      const sessionHome = process.platform === 'win32'
        ? resolve(this.options.homesRoot, this.homeSegment(key))
        : resolve(this.options.homesRoot, safeCompany, safeAgent, 'sessions', safeSession)
      const home = homeEpoch === 1 ? sessionHome : resolve(sessionHome, 'epochs', String(homeEpoch))
      kernel = new PersistentKernel(key, home, this.bridge, this.options, () => this.wakeCapacityWaiters())
      this.kernels.set(key, kernel)
    }
    try {
      return await kernel.execute(work, runId, cellId, code, signal, options)
    } catch (error) {
      if (error instanceof KernelTimeoutError || error instanceof KernelCancelledError) this.kernels.delete(key)
      throw error
    }
  }

  sweepIdle(now = Date.now()): number {
    let removed = 0
    for (const [key, kernel] of this.kernels) {
      if (kernel.busy) continue
      if (now - kernel.lastUsedAt < this.options.idleMs) continue
      kernel.stop()
      this.kernels.delete(key)
      removed++
    }
    return removed
  }

  close(): void {
    this.closed = true
    clearInterval(this.sweepTimer)
    for (const kernel of this.kernels.values()) kernel.stop()
    this.kernels.clear()
    this.wakeCapacityWaiters()
  }

  get size(): number { return this.kernels.size }
}
