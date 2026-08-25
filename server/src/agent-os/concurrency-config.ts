export const DEFAULT_AGENT_OS_CONCURRENCY = 8

export function parseAgentOSConcurrency(value: string | undefined): number {
  const parsed = Number(value ?? DEFAULT_AGENT_OS_CONCURRENCY)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 32) {
    throw new Error('AGENT_OS_MAX_CONCURRENT_RUNS must be an integer between 1 and 32')
  }
  return parsed
}
