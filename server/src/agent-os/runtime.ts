import { randomUUID } from 'node:crypto'
import type { AgentOSHostAdapter } from './host-adapter.js'
import {
  ApprovalPendingError,
  KernelCancelledError,
  type KernelExecutor,
  KernelTimeoutError,
} from './kernel-manager.js'
import type { AgentModelDriver } from './model-driver.js'
import { parseIPythonArguments } from './tool.js'
import type { AgentRunEvent, AgentSessionRecord, AgentWorkItem, LingxiMessageV1, ModelItem } from './types.js'

export interface AgentOSRuntimeOptions {
  maxHops?: number
  contextWindowTokens?: number
  compactSoftRatio?: number
  compactHardRatio?: number
  heartbeatMs?: number
}

function sessionKey(work: AgentWorkItem): string {
  return [work.companyId, work.agentId, work.channelId, work.threadRootClientMsgNo ?? '-'].join(':')
}

function contextItems(context: Awaited<ReturnType<AgentOSHostAdapter['loadContext']>>, continuing: boolean): ModelItem[] {
  const relevant = continuing && context.work.reason !== 'resume'
    ? context.messages.filter((message) => message.clientMsgNo === context.work.triggerClientMsgNo)
    : context.work.reason === 'resume' ? [] : context.messages
  const lines = relevant.map((message) => {
    const reply = message.replyToClientMsgNo ? ` reply_to=${message.replyToClientMsgNo}` : ''
    return `[${message.createdAt}] ${message.authorName} (${message.authorKind}, id=${message.authorId}${reply}): ${message.body}`
  })
  const content = [
    context.summary ? `Prior durable summary:\n${context.summary}` : '',
    context.pendingApproval
      ? `Resolved approval: ${JSON.stringify(context.pendingApproval)}`
      : '',
    `Trigger: ${context.work.reason}; client_msg_no=${context.work.triggerClientMsgNo}`,
    lines.join('\n'),
  ].filter(Boolean).join('\n\n')
  return [{ role: 'user', content }]
}

function messagePayload(work: AgentWorkItem, text: string, runId: string): LingxiMessageV1 {
  return {
    version: 1,
    kind: 'text',
    clientMsgNo: `agent-${runId}`,
    body: text,
    ...(work.threadRootClientMsgNo ? { replyToClientMsgNo: work.threadRootClientMsgNo } : {}),
    refs: { runId, agentId: work.agentId },
  }
}

export class AgentOSRuntime {
  private readonly options: Required<AgentOSRuntimeOptions>
  private readonly eventSeqByRun = new Map<string, number>()

  constructor(
    private readonly host: AgentOSHostAdapter,
    private readonly model: AgentModelDriver,
    private readonly kernels: KernelExecutor,
    options: AgentOSRuntimeOptions = {},
  ) {
    this.options = {
      maxHops: options.maxHops ?? 12,
      contextWindowTokens: options.contextWindowTokens ?? Number(process.env.AGENT_OS_CONTEXT_WINDOW_TOKENS ?? 128_000),
      compactSoftRatio: options.compactSoftRatio ?? 0.75,
      compactHardRatio: options.compactHardRatio ?? 0.90,
      heartbeatMs: options.heartbeatMs ?? 5_000,
    }
  }

  private async event(work: AgentWorkItem, runId: string, event: Omit<AgentRunEvent, 'runId' | 'seq'>): Promise<void> {
    const seq = (this.eventSeqByRun.get(runId) ?? 0) + 1
    this.eventSeqByRun.set(runId, seq)
    await this.host.emitEvent(work, { runId, seq, ...event })
  }

  async runWork(work: AgentWorkItem, signal?: AbortSignal): Promise<void> {
    const runId = randomUUID()
    this.eventSeqByRun.set(runId, 0)
    const lifecycle = new AbortController()
    let leaseLost: Error | null = null
    const steerQueue: Array<{ id: string; text: string }> = []
    const seenSteer = new Set<string>()
    const abortFromCaller = () => lifecycle.abort(signal?.reason)
    if (signal?.aborted) abortFromCaller()
    else signal?.addEventListener('abort', abortFromCaller, { once: true })
    const heartbeat = setInterval(() => {
      void this.host.heartbeat(work).then((heartbeat) => {
        if (!heartbeat.ok) {
          leaseLost = new Error('work lease lost')
          lifecycle.abort(leaseLost)
        }
        if (heartbeat.cancelRequested) lifecycle.abort(new Error('stopped by learner'))
        for (const steer of heartbeat.steer ?? []) {
          if (!seenSteer.has(steer.id)) { seenSteer.add(steer.id); steerQueue.push(steer) }
        }
      }).catch((error) => {
        leaseLost = error instanceof Error ? error : new Error(String(error))
        lifecycle.abort(leaseLost)
      })
    }, this.options.heartbeatMs)
    heartbeat.unref?.()

    try {
      await this.event(work, runId, { kind: 'run.started', stage: 'started', visibility: 'user', data: { reason: work.reason } })
      const context = await this.host.loadContext(work)
      const key = sessionKey(work)
      const stored = await this.host.loadSession(key)
      const session: AgentSessionRecord = stored ?? {
        key,
        companyId: work.companyId,
        agentId: work.agentId,
        channelId: work.channelId,
        ...(work.threadRootClientMsgNo ? { threadRootClientMsgNo: work.threadRootClientMsgNo } : {}),
        history: [],
      }
      session.history.push(...contextItems(context, Boolean(stored?.history.length)))
      await this.compactIfNeeded(session, context.persona.instructions, lifecycle.signal)

      let finalText = ''
      for (let hop = 0; hop < this.options.maxHops; hop++) {
        if (leaseLost) throw leaseLost
        if (lifecycle.signal.aborted) throw new KernelCancelledError('model')
        if (steerQueue.length > 0) {
          const steers = steerQueue.splice(0)
          session.history.push({ role: 'user', content: `Highest-priority learner steering:\n${steers.map((item) => item.text).join('\n')}` })
        }
        await this.event(work, runId, { kind: 'model.started', stage: 'started', visibility: 'internal', data: { hop: hop + 1 } })
        const turn = await this.model.run({
          instructions: context.persona.instructions,
          items: session.history,
          signal: lifecycle.signal,
          onTextDelta: (delta) => this.event(work, runId, {
            kind: 'model.delta', stage: 'delta', visibility: 'user', data: { delta },
          }),
        })
        session.history.push(...turn.output)
        await this.event(work, runId, {
          kind: 'model.completed', stage: 'completed', visibility: 'internal',
          data: { hop: hop + 1, usage: turn.usage },
        })
        const calls = turn.output.filter((item): item is Extract<ModelItem, { type: 'function_call' }> => 'type' in item && item.type === 'function_call')
        if (calls.length === 0) {
          finalText = turn.text.trim()
          break
        }
        for (const call of calls) {
          const { code } = parseIPythonArguments(call.arguments)
          await this.event(work, runId, {
            kind: 'ipython.started', stage: 'started', visibility: 'user',
            data: { callId: call.callId, codePreview: code.slice(0, 240) },
          })
          try {
            const execution = await this.kernels.execute(work, runId, code, lifecycle.signal)
            const output = JSON.stringify({
              stdout: execution.stdout, stderr: execution.stderr, result: execution.result,
              truncated: execution.truncated, artifacts: execution.artifacts,
            })
            session.history.push({ type: 'function_call_output', callId: call.callId, output })
            await this.event(work, runId, {
              kind: 'ipython.completed', stage: 'completed', visibility: 'user',
              data: { callId: call.callId, durationMs: execution.durationMs, truncated: execution.truncated },
            })
          } catch (error) {
            if (error instanceof ApprovalPendingError) {
              await this.event(work, runId, {
                kind: 'approval.pending', stage: 'completed', visibility: 'user',
                data: { approvalId: error.approvalId, cellId: error.cellId },
              })
              session.history.push({ type: 'function_call_output', callId: call.callId, output: JSON.stringify({ approvalPending: error.approvalId }) })
              await this.host.saveSession(session)
              await this.host.completeWork(work, { status: 'completed' })
              return
            }
            if (error instanceof KernelTimeoutError) {
              session.history.push({ type: 'function_call_output', callId: call.callId, output: JSON.stringify({ error: error.message, kernelRestarted: true }) })
              await this.event(work, runId, { kind: 'ipython.timeout', stage: 'failed', visibility: 'user', data: { timeoutMs: error.timeoutMs } })
              continue
            }
            throw error
          }
        }
        await this.compactIfNeeded(session, context.persona.instructions, lifecycle.signal)
      }
      if (!finalText) throw new Error(`agent did not finish within ${this.options.maxHops} model hops`)
      await this.host.commitMessage(work, messagePayload(work, finalText, runId))
      await this.host.saveSession(session)
      await this.event(work, runId, { kind: 'run.completed', stage: 'completed', visibility: 'user', data: {} })
      await this.host.completeWork(work, { status: 'completed' })
    } catch (error) {
      const cancelled = !leaseLost && (lifecycle.signal.aborted || error instanceof KernelCancelledError)
      const status = cancelled ? 'cancelled' : 'failed'
      await this.event(work, runId, {
        kind: cancelled ? 'run.cancelled' : 'run.failed', stage: status, visibility: 'user',
        data: { error: error instanceof Error ? error.message : String(error) },
      }).catch(() => undefined)
      await this.host.completeWork(work, { status, error: error instanceof Error ? error.message : String(error) })
    } finally {
      clearInterval(heartbeat)
      this.eventSeqByRun.delete(runId)
      signal?.removeEventListener('abort', abortFromCaller)
    }
  }

  private async compactIfNeeded(session: AgentSessionRecord, instructions: string, signal?: AbortSignal): Promise<void> {
    const estimatedTokens = Math.ceil(JSON.stringify(session.history).length / 4)
    const softLimit = Math.floor(this.options.contextWindowTokens * this.options.compactSoftRatio)
    const hardLimit = Math.floor(this.options.contextWindowTokens * this.options.compactHardRatio)
    if (estimatedTokens < softLimit) return
    const keep = session.history.slice(-20)
    const summarize = session.history.slice(0, -20)
    try {
      const summary = await this.model.compact({ instructions, items: summarize, signal })
      session.summary = [session.summary, summary].filter(Boolean).join('\n\n')
      session.history = [{ role: 'system', content: `Durable session summary:\n${session.summary}` }, ...keep]
    } catch {
      if (estimatedTokens < hardLimit) return
      session.history = keep
      session.summary = [session.summary, `Compaction failed; ${summarize.length} oldest items were dropped.`].filter(Boolean).join('\n')
    }
  }
}
