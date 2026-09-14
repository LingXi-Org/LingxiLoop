import { releaseVersions, type createLingxiOS, type RequestInput } from '@lyyzka/lingxios'
import { executeRequest } from '@lyyzka/lingxios/eval'
import { EvaluationError, hash, type EvalTarget } from '../src/contracts.js'

/** The caller owns an isolated evaluation app/queue and its independently configured model. */
export function createLingxiOSTarget(options: {
  app: Awaited<ReturnType<typeof createLingxiOS>>
  worker: { runNext(): Promise<boolean> }
  request: Omit<RequestInput,'id'|'text'|'sourceRef'|'sessionId'>
  configurationFingerprint: string
  usdCny: number
}): EvalTarget {
  if (!Number.isFinite(options.usdCny) || options.usdCny<=0 || !options.configurationFingerprint.trim()) throw new EvaluationError('invalid_native_target_config')
  return {
    identity: { id: 'lingxios-native',version: releaseVersions.runtime,fingerprint: hash({ request: options.request,model: options.configurationFingerprint,usdCny: options.usdCny,releaseVersions }) },
    async execute(request) {
      request.signal.throwIfAborted()
      if (request.scenario || request.toolBudget) throw new EvaluationError('native_target_requires_native_fixtures')
      const input={ ...options.request,id: request.requestId,sessionId: `eval:${request.requestId}`,sourceRef: `eval:${request.requestId}`,text: request.input }
      const identity={ tenantId: input.tenantId,agentId: input.agentId,principalId: input.principalId,sessionId: input.sessionId,
        runId: request.requestId,...input.threadId ? { threadId: input.threadId } : {} }
      const result=await executeRequest(options.app,{ async runNext() {
        if (request.signal.aborted) { await options.app.cancel(identity);request.signal.throwIfAborted() }
        let cancellation: Promise<unknown> | undefined,cancelError: unknown
        const cancel=()=>{ cancellation=options.app.cancel(identity).catch(error=>{ cancelError=error }) }
        request.signal.addEventListener('abort',cancel,{ once: true })
        try { return await options.worker.runNext() }
        finally {
          request.signal.removeEventListener('abort',cancel);await cancellation
          if (cancelError) throw new EvaluationError('native_cancellation_failed')
        }
      } },input)
      request.signal.throwIfAborted()
      if (!result.workDequeued || !result.message || (await options.app.readRun(result.identity))?.status!=='succeeded') {
        await options.app.cancel(result.identity)
        throw new EvaluationError('native_execution_incomplete')
      }
      const usage=await options.app.readUsage(result.identity)
      if (!usage || usage.pendingCalls || usage.estimatedCalls) throw new EvaluationError('native_usage_unavailable')
      return { output: result.message.body,usage: { inputTokens: usage.inputTokens,outputTokens: usage.outputTokens,costCny: usage.costMicros/1_000_000*options.usdCny } }
    },
  }
}
