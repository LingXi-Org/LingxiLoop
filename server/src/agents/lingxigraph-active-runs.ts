/** Trusted, process-local index of LingxiGraph calls currently in flight.
 * The run id is registered by the turn runner, never supplied by a message.
 * LingxiGraph remains the durable owner after a steer has been accepted. */
export interface ActiveLingxiGraphRun {
  runId: string
  agentId: string
  companyId: string | null
}

const activeRuns = new Map<string, ActiveLingxiGraphRun>()

export function registerActiveLingxiGraphRun(run: ActiveLingxiGraphRun): void {
  activeRuns.set(run.agentId, run)
}

export function clearActiveLingxiGraphRun(agentId: string, runId: string): void {
  if (activeRuns.get(agentId)?.runId === runId) activeRuns.delete(agentId)
}

export function getActiveLingxiGraphRun(agentId: string): ActiveLingxiGraphRun | null {
  return activeRuns.get(agentId) ?? null
}

export function _resetActiveLingxiGraphRunsForTests(): void {
  activeRuns.clear()
}
