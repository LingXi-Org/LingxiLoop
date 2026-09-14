import type { createLingxiOS } from '@lyyzka/lingxios'
import { HttpError } from '../../http/errors.js'

export type PlatformAgentRuntime = Pick<Awaited<ReturnType<typeof createLingxiOS>>,
  'listRuns' | 'readRunState' | 'readDiagnostics' | 'readEvents' | 'readUsage' | 'revise' | 'continueInput' | 'cancel'
  | 'readApproval' | 'decideApproval' | 'reconcileAction' | 'retryDelivery' | 'maintenance'>

export async function platformAgentRun(runtime: PlatformAgentRuntime, runId: string) {
  const run = (await runtime.listRuns({ id: runId, limit: 1 })).items[0]
  if (!run) throw new HttpError(404, 'run not found')
  return run
}

export async function inspectPlatformAgentRun(runtime: PlatformAgentRuntime, runId: string, afterSeq = 0) {
  const run = await platformAgentRun(runtime, runId)
  const [state, diagnostics, events, usage] = await Promise.all([
    runtime.readRunState(run.identity),
    runtime.readDiagnostics(run.identity),
    runtime.readEvents(run.identity, afterSeq),
    runtime.readUsage(run.identity),
  ])
  return { run, state: state ? { run: state.run, delivery: state.delivery } : null, diagnostics, ...events, usage }
}

export async function revisePlatformAgentRun(runtime: PlatformAgentRuntime, runId: string, text: string) {
  const run = await platformAgentRun(runtime, runId)
  return { revised: await runtime.revise(run.identity, text), run }
}

export async function continuePlatformAgentRun(
  runtime: PlatformAgentRuntime,
  runId: string,
  input: { inputId: string; requestVersion: number; text: string },
) {
  const run = await platformAgentRun(runtime, runId)
  return { result: await runtime.continueInput({ ...run.identity, ...input }), run }
}

export async function cancelPlatformAgentRun(runtime: PlatformAgentRuntime, runId: string) {
  const run = await platformAgentRun(runtime, runId)
  return { cancelled: await runtime.cancel(run.identity), run }
}

export async function platformAgentApproval(runtime: PlatformAgentRuntime, runId: string, approvalId: string) {
  const run = await platformAgentRun(runtime, runId)
  const approval = await runtime.readApproval({ approvalId, tenantId: run.identity.tenantId, principalId: run.identity.principalId })
  if (!approval || approval.runId !== run.id) throw new HttpError(404, 'approval not found')
  return { approval, run }
}

export async function decidePlatformAgentApproval(
  runtime: PlatformAgentRuntime,
  runId: string,
  approvalId: string,
  approved: boolean,
) {
  const { approval, run } = await platformAgentApproval(runtime, runId, approvalId)
  return { result: await runtime.decideApproval({ ...approval, approved }), run }
}

export async function reconcilePlatformAgentAction(runtime: PlatformAgentRuntime, runId: string, actionKey: string) {
  const run = await platformAgentRun(runtime, runId)
  return { result: await runtime.reconcileAction({ ...run.identity, actionKey }), run }
}

export async function retryPlatformAgentDelivery(
  runtime: PlatformAgentRuntime,
  runId: string,
  channel: 'message' | 'events' | 'usage',
) {
  const run = await platformAgentRun(runtime, runId)
  return { retried: await runtime.retryDelivery(run.identity, channel), run }
}
