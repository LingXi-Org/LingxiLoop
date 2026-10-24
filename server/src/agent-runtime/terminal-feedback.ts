import type { createLingxiOS, RunIdentity, RunState, RuntimeOperationContext, TerminalFeedback } from '@lyyzka/lingxios'

type Runtime = Awaited<ReturnType<typeof createLingxiOS>>
export type TerminalFailure = 'protocol' | 'timeout' | null

/** Read only structured diagnostics for this terminal request/fence. Never infer
 * a cause from private exception text or an elapsed duration. */
export async function terminalFailure(
  api: Pick<Runtime, 'readEvents'>, identity: RunIdentity, state: RunState, operation: RuntimeOperationContext,
): Promise<TerminalFailure> {
  if (state.run.status !== 'failed') return null
  let cursor = 0
  // Event reads share the callback's signal and deadline. Large histories keep
  // the generic reason instead of introducing an unbounded diagnostic scan.
  for (let page = 0; page < 4; page++) {
    const result = await api.readEvents(identity, cursor, operation)
    for (const event of result.events) {
      if (event.kind !== 'run.failed' || event.runId !== identity.runId) continue
      const timing = event.data._executionTrace
      if (!timing || typeof timing !== 'object'
        || Reflect.get(timing, 'requestVersion') !== state.run.requestVersion || Reflect.get(timing, 'fence') !== state.run.fence) continue
      const diagnostics = event.data.modelDiagnostics
      if (!diagnostics || typeof diagnostics !== 'object') return null
      if (Reflect.get(diagnostics, 'kind') === 'protocol') return 'protocol'
      return Reflect.get(diagnostics, 'category') === 'timeout' ? 'timeout' : null
    }
    if (result.events.length < 100 || result.nextSeq <= cursor) break
    cursor = result.nextSeq
  }
  return null
}

export function terminalFeedbackText(
  feedback: TerminalFeedback, state: RunState, failure: TerminalFailure, notStartedNames: readonly string[] = [],
): string {
  const delivered = state.run.id === feedback.rootWorkId && state.run.requestVersion === feedback.requestVersion
    && state.run.resultId !== null && state.run.resultFence === state.run.fence && state.delivery === 'delivered'
    && state.message?.envelope.requestVersion === feedback.requestVersion
  const reasons = {
    context_limit: '当前执行超出了可处理的上下文范围，可以缩小材料范围后继续。',
    budget_limit: '本轮预算已达上限，部分工作未能继续。',
    model_unavailable: failure === 'timeout' ? '模型响应超时，当前答复未能完成。' : '模型服务暂时不可用，当前答复未能完成。',
    permission_denied: '当前权限不足，执行已停止。',
    dependency_unavailable: '所需服务暂时不可用，执行未能完成。',
    cancelled: '执行已取消。',
    interrupted: '执行在恢复过程中中断，未能完成。',
    execution_failed: failure === 'protocol' ? '模型返回的答复格式有误，当前答复未能完成。'
      : failure === 'timeout' ? '模型响应超时，当前答复未能完成。' : '当前执行未能完成。',
  } as const
  const followUpReasons = {
    context_limit: '后续协作超出了可处理的上下文范围，可以缩小材料范围后继续。',
    budget_limit: '本轮预算已达上限，后续协作未能全部继续。',
    model_unavailable: '后续协作的模型服务暂时不可用。',
    permission_denied: '后续协作因权限不足已停止。',
    dependency_unavailable: '后续协作所需服务暂时不可用。',
    cancelled: '后续协作已取消。',
    interrupted: '后续协作在恢复过程中中断。',
    execution_failed: '后续协作未全部完成。',
  } as const
  const parts = [delivered ? `已有答复已发送，${followUpReasons[feedback.reason]}` : reasons[feedback.reason]]
  if (feedback.failedCount) parts.push(`${delivered ? '后续有' : '本轮有'} ${feedback.failedCount} 项${delivered ? '协作' : '执行'}失败。`)
  if (feedback.cancelledCount) parts.push(`${delivered ? '后续有' : '本轮有'} ${feedback.cancelledCount} 项${delivered ? '协作' : '执行'}已取消。`)
  if (feedback.notStartedCount) parts.push(`本轮有 ${feedback.notStartedCount} 项协作未启动${notStartedNames.length ? `（${notStartedNames.join('、')}）` : ''}。`)
  parts.push('已完成的操作会保留，你可以发送新消息继续。')
  return parts.join(' ')
}
