import { escapeWorkflowCommandData } from './bootstrap-diagnostics.mjs'

const reasons = new Set(['exit', 'signal', 'timeout', 'spawn', 'suite_budget'])
const signals = new Set(['SIGKILL', 'SIGTERM', 'SIGABRT', 'SIGSEGV', 'SIGINT'])
export function integrationFailure(input) {
  const result = { integration: 'failed', file: /^[\w-]+\.test\.ts$/.test(input?.file ?? '') ? input.file : 'historical-runtime-proof',
    reason: reasons.has(input?.reason) ? input.reason : 'exit' }
  if (Number.isSafeInteger(input?.exitCode) && input.exitCode >= 0 && input.exitCode <= 255) result.exitCode = input.exitCode
  if (signals.has(input?.signal)) result.signal = input.signal
  if (Number.isSafeInteger(input?.timeoutMs) && input.timeoutMs > 0 && input.timeoutMs <= 3_600_000) result.timeoutMs = input.timeoutMs
  return result
}
export function integrationFailureAnnotation(input, githubActions = process.env.GITHUB_ACTIONS) {
  if (githubActions !== 'true') return null
  const failure = integrationFailure(input)
  return `::error title=Integration test process failed::${escapeWorkflowCommandData(Object.entries(failure).map(([key,value])=>`${key}=${value}`).join('; '))}`
}
export function reportIntegrationFailure(input, githubActions = process.env.GITHUB_ACTIONS) {
  console.error(JSON.stringify(integrationFailure(input)))
  const annotation = integrationFailureAnnotation(input, githubActions)
  if (annotation) console.error(annotation)
}
