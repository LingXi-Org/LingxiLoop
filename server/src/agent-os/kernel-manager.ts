import { createHash, randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
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
  executionTimeoutMs?: number
  maxOutputChars?: number
  allowNetwork?: boolean
}

export interface KernelExecutor {
  execute(work: AgentWorkItem, runId: string, cellId: string, code: string, signal?: AbortSignal): Promise<KernelExecution>
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
  lastUsedAt = Date.now()

  constructor(
    private readonly key: string,
    private readonly home: string,
    private readonly bridge: KernelHostBridge,
    private readonly options: Required<KernelManagerOptions>,
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
    this.lines = createInterface({ input: child.stdout })
    this.lines.on('line', (line) => this.onLine(line))
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
    this.process.stdin.write(`${JSON.stringify(value)}\n`)
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
      pending.reject(new Error(message.error || message.stderr || 'IPython execution failed'))
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
    let result: HostActionResult
    try {
      result = await this.bridge.execute(execution.work, {
        runId: execution.runId,
        cellId: execution.cellId,
        callIndex: message.callIndex,
        action: message.action,
        args: message.args ?? {},
        idempotencyKey,
      })
    } catch (error) {
      result = { ok: false, error: error instanceof Error ? error.message : String(error) }
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

  execute(work: AgentWorkItem, runId: string, cellId: string, code: string, signal?: AbortSignal): Promise<KernelExecution> {
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
          timer,
          resolve: (value) => { signal?.removeEventListener('abort', abort); resolveExecution(value) },
          reject: (error) => { signal?.removeEventListener('abort', abort); rejectExecution(error) },
        })
        this.write({ type: 'execute', id: executionId, code, context: { runId, cellId } })
      })
    })
    this.tail = operation.catch(() => undefined)
    return operation
  }

  stop(signal: NodeJS.Signals = 'SIGTERM'): void {
    const child = this.process
    this.process = null
    if (child && !child.killed) child.kill(signal)
  }
}

export class ApprovalPendingError extends Error {
  constructor(readonly approvalId: string, readonly cellId: string) { super(`approval pending: ${approvalId}`) }
}
export class KernelTimeoutError extends Error {
  constructor(readonly timeoutMs: number, readonly cellId: string) { super(`IPython cell timed out after ${timeoutMs}ms`) }
}
export class KernelCancelledError extends Error {
  constructor(readonly cellId: string) { super('IPython cell cancelled') }
}

export class KernelManager implements KernelExecutor {
  private readonly kernels = new Map<string, PersistentKernel>()
  private readonly options: Required<KernelManagerOptions>
  private readonly sweepTimer: NodeJS.Timeout

  constructor(private readonly bridge: KernelHostBridge, options: KernelManagerOptions = {}) {
    this.options = {
      pythonCommand: options.pythonCommand ?? process.env.AGENT_OS_PYTHON ?? 'python3',
      runnerPath: resolve(options.runnerPath ?? 'server/agent-os/kernel_runner.py'),
      homesRoot: resolve(options.homesRoot ?? process.env.AGENT_OS_HOMES_ROOT ?? '.agent-os/homes'),
      idleMs: options.idleMs ?? 90 * 60_000,
      executionTimeoutMs: options.executionTimeoutMs ?? 120_000,
      maxOutputChars: options.maxOutputChars ?? 64_000,
      allowNetwork: options.allowNetwork ?? false,
    }
    this.sweepTimer = setInterval(() => this.sweepIdle(), Math.min(60_000, this.options.idleMs))
    this.sweepTimer.unref?.()
  }

  private key(work: AgentWorkItem): string {
    return [work.companyId, work.agentId, work.channelId, work.threadRootClientMsgNo ?? '-'].join(':')
  }

  private homeSegment(value: string): string {
    // Tenant/agent identifiers are data, never filesystem path components.
    return createHash('sha256').update(value).digest('hex')
  }

  async execute(work: AgentWorkItem, runId: string, cellId: string, code: string, signal?: AbortSignal): Promise<KernelExecution> {
    const key = this.key(work)
    let kernel = this.kernels.get(key)
    if (!kernel) {
      const safeCompany = this.homeSegment(work.companyId)
      const safeAgent = this.homeSegment(work.agentId)
      const safeSession = this.homeSegment(`${work.channelId}:${work.threadRootClientMsgNo ?? '-'}`)
      kernel = new PersistentKernel(key, resolve(this.options.homesRoot, safeCompany, safeAgent, 'sessions', safeSession), this.bridge, this.options)
      this.kernels.set(key, kernel)
    }
    try {
      return await kernel.execute(work, runId, cellId, code, signal)
    } catch (error) {
      if (error instanceof KernelTimeoutError || error instanceof KernelCancelledError) this.kernels.delete(key)
      throw error
    }
  }

  sweepIdle(now = Date.now()): number {
    let removed = 0
    for (const [key, kernel] of this.kernels) {
      if (now - kernel.lastUsedAt < this.options.idleMs) continue
      kernel.stop()
      this.kernels.delete(key)
      removed++
    }
    return removed
  }

  close(): void {
    clearInterval(this.sweepTimer)
    for (const kernel of this.kernels.values()) kernel.stop()
    this.kernels.clear()
  }

  get size(): number { return this.kernels.size }
}
