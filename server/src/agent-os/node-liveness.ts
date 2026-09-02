export function agentOSNodeTimeoutSeconds(): number {
  const value = Number(process.env.AGENT_OS_NODE_TIMEOUT_SECONDS ?? 15)
  if (!Number.isSafeInteger(value) || value < 5 || value > 300) {
    throw new Error('AGENT_OS_NODE_TIMEOUT_SECONDS must be an integer between 5 and 300')
  }
  return value
}
