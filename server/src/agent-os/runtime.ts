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

export function canvasContextContract(roster: unknown[]): string {
  return `Agent OS Canvas decision policy: loop.canvas is preloaded in IPython, your only model-visible tool. Proactively start a Canvas workspace when the request needs multiple learning specialties, parallel investigation, dependent stages, or a shared visual result. First call loop.canvas.available_agents(); choose the smallest useful capable team yourself; then call loop.canvas.start_workspace(title=..., goal=..., members=[...]) with concrete assignments and dependsOnAgentIds where ordering matters. Never ask the human to open Canvas, select agents, or allocate work. Do not create a workspace for a quick single-agent answer. start_workspace safely defers the initiating turn after the live card appears.

Canvas IPython recipe (these are real calls, not pseudocode):
workspace = loop.canvas.get(canvasId=canvas_id)
loop.canvas.set_status(canvasId=canvas_id, status="正在整理资料")
frame = loop.canvas.create_frame(canvasId=canvas_id, type="markdown", title="阶段结论", content="# 结论\\n\\n- 要点", data={})
loop.canvas.set_status(canvasId=canvas_id, status="正在编辑阶段结论", frameId=frame["id"])
fresh = loop.canvas.get(canvasId=canvas_id)
current = next(item for item in fresh["frames"] if item["id"] == frame["id"])
loop.canvas.update_frame(frameId=frame["id"], content="# 更新后的结论", baseRevision=current["revision"])
loop.canvas.append_content(frameId=frame["id"], content="\\n\\n补充内容")

Canvas workers must read the current workspace before editing, announce meaningful focus changes with set_status, and publish usable results as html, markdown, document, image, or artifact frames. Human right-click @ assignments and card feedback arrive as the current Canvas assignment or steering input: act on them in the same workspace, update the relevant frame when one is identified, and do not reply directly to the source conversation. Read a frame before replacing content and pass its revision as baseRevision; append_content is atomic. Use loop.canvas.add_agents(canvasId=..., members=[...]) only when a missing specialty is truly required. Keep execution inside your own IPython/Agent Home. Available Canvas agents: ${JSON.stringify(roster)}.`
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
    canvasContextContract(context.canvasRoster ?? []),
    context.canvas ? `Current Canvas work context:\n${JSON.stringify(context.canvas)}` : '',
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
    clientMsgNo: `agent-${work.id}`,
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
    // A retried durable work item must reuse every externally visible identity.
    const runId = work.id
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
        revision: 0,
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
        for (const [callIndex, call] of calls.entries()) {
          const { code } = parseIPythonArguments(call.arguments)
          await this.event(work, runId, {
            kind: 'ipython.started', stage: 'started', visibility: 'user',
            data: { callId: call.callId, codePreview: code.slice(0, 240) },
          })
          try {
            const cellId = `hop-${hop + 1}-call-${callIndex + 1}`
            const execution = await this.kernels.execute(work, runId, cellId, code, lifecycle.signal)
            const output = JSON.stringify({
              stdout: execution.stdout, stderr: execution.stderr, result: execution.result,
              truncated: execution.truncated, artifacts: execution.artifacts,
            })
            session.history.push({ type: 'function_call_output', callId: call.callId, output })
            await this.event(work, runId, {
              kind: 'ipython.completed', stage: 'completed', visibility: 'user',
              data: { callId: call.callId, durationMs: execution.durationMs, truncated: execution.truncated },
            })
            const defer = execution.directives?.find((directive) => directive.type === 'defer_to_canvas')
            if (defer) {
              await this.host.saveSession(session)
              await this.event(work, runId, { kind: 'run.completed', stage: 'completed', visibility: 'user', data: { deferredToCanvasId: defer.canvasId } })
              await this.host.completeWork(work, { status: 'completed' })
              return
            }
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
      if (work.reason !== 'canvas_worker') await this.host.commitMessage(work, messagePayload(work, finalText, runId))
      await this.host.saveSession(session)
      await this.event(work, runId, { kind: 'run.completed', stage: 'completed', visibility: 'user', data: {} })
      await this.host.completeWork(work, { status: 'completed', resultText: finalText })
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
