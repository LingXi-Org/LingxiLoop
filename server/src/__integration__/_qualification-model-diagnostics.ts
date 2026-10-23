const enums = {
  kind: new Set(['provider', 'protocol']),
  category: new Set(['authorization', 'quota', 'rate_limit', 'timeout', 'network', 'unavailable',
    'protocol', 'cancelled', 'circuit_open', 'unknown']),
  protocolCode: new Set(['public_text_invalid', 'public_text_incomplete', 'public_text_answer_required',
    'tool_identity_invalid', 'response_empty', 'native_envelope_invalid', 'terminal_outcome_required']),
}
const finishReasons = new Set(['stop', 'length', 'tool_calls', 'function_call', 'content_filter', 'missing', 'unknown'])

/** Test artifacts retain terminal public diagnostics, never arbitrary errors. */
export function qualificationModelDiagnostics(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const diagnostics = value as Record<string, unknown>
  const result: Record<string, unknown> = {}
  for (const key of ['kind', 'category', 'protocolCode'] as const) {
    const candidate = diagnostics[key]
    if (typeof candidate === 'string' && enums[key].has(candidate)) result[key] = candidate
  }
  if (typeof diagnostics.status === 'number' && Number.isInteger(diagnostics.status)
    && diagnostics.status >= 100 && diagnostics.status <= 599) result.status = diagnostics.status
  if (typeof diagnostics.retryable === 'boolean') result.retryable = diagnostics.retryable
  if (Array.isArray(diagnostics.finishReasons)) result.finishReasons = diagnostics.finishReasons.slice(0, 32)
    .map(reason => typeof reason === 'string' && finishReasons.has(reason) ? reason : 'unknown')
  return result
}
