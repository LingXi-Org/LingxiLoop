import type { WorkerOptions } from '@lingxi-org/lingxios/worker'

/** Root-wide limits include generation, reviews, repairs, compaction and retries.
 * Explicit overrides also permit bounded low-budget failure qualification. */
export const executionBudgetDefaults = Object.freeze({
  maxModelCalls: 512,
  maxTokens: 8_000_000,
  maxCostMicros: 50_000_000,
  wallClockMs: 2 * 60 * 60_000,
})

export function runtimeExecutionBudget(values: NodeJS.ProcessEnv = process.env): Required<Pick<NonNullable<WorkerOptions['modelBudget']>,
  'maxModelCalls' | 'maxTokens' | 'maxCostMicros' | 'wallClockMs'>> {
  const read = (name: string, fallback: number) => {
    const raw = values[name]?.trim(), value = raw ? Number(raw) : fallback
    if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`)
    return value
  }
  return {
    maxModelCalls: read('AGENT_OS_MAX_MODEL_CALLS', executionBudgetDefaults.maxModelCalls),
    maxTokens: read('AGENT_OS_MAX_MODEL_TOKENS', executionBudgetDefaults.maxTokens),
    maxCostMicros: read('AGENT_OS_MAX_MODEL_COST_MICROS', executionBudgetDefaults.maxCostMicros),
    wallClockMs: read('AGENT_OS_MAX_WORK_MS', executionBudgetDefaults.wallClockMs),
  }
}
