import { createHash } from 'node:crypto'
import { homeworkJudgmentSchema } from '../../server/src/modules/learning/homework-contracts.js'

const object = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
const hash = (text: string) => createHash('sha256').update(text).digest('hex')
const type = (value: unknown) => value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value
const fields = ['criteria', 'completion', 'assistance', 'independence', 'weaknesses', 'evidence'] as const
const schemaCodes = ['invalid_type', 'too_big', 'too_small', 'invalid_format', 'not_multiple_of',
  'unrecognized_keys', 'invalid_union', 'invalid_key', 'invalid_element', 'invalid_value', 'custom'] as const
type CanonicalMessage = { messageId: string; role: 'user' | 'assistant'; text: string }
const canonical = (value: unknown): value is CanonicalMessage => {
  const message = object(value)
  return typeof message?.messageId === 'string' && (message.role === 'user' || message.role === 'assistant') && typeof message.text === 'string'
}

/** Mirrors only modelJson response checks and validateJudgment, without database or material checks. */
export function homeworkJudgmentDiagnostics(request: Record<string, unknown>, response: unknown) {
  if (request.stream || object(request.response_format)?.type !== 'json_object' || !Array.isArray(request.messages)) return undefined
  const message = request.messages.map(object).find(item => item?.role === 'user' && typeof item.content === 'string')
  if (!message || typeof message.content !== 'string') return undefined
  let input: Record<string, unknown> | undefined
  try { input = object(JSON.parse(message.content)) } catch { return undefined }
  const requiredCriteria = object(input?.homework)?.criteria
  if (!input || !Array.isArray(requiredCriteria) || !requiredCriteria.every(item => typeof item === 'string')
    || !Array.isArray(input.messages) || !input.messages.every(canonical)) return undefined
  const messages = input.messages
  const choice = object(Array.isArray(object(response)?.choices) ? (object(response)!.choices as unknown[])[0] : undefined)
  const content = object(choice?.message)?.content
  let parsed: unknown, responseJson = false
  if (typeof content === 'string') {
    try { parsed = JSON.parse(content); responseJson = true } catch { /* Never retain parsing errors or response text. */ }
  }
  const value = object(parsed), schema = homeworkJudgmentSchema.safeParse(parsed)
  const criteria = Array.isArray(value?.criteria) ? value.criteria.map(object) : []
  const criteriaMatch = Array.isArray(value?.criteria) && criteria.length === requiredCriteria.length
    && new Set(criteria.map(item => item?.criterion)).size === requiredCriteria.length
    && requiredCriteria.every(criterion => criteria.some(item => item?.criterion === criterion))
  const quotes = schema.success ? schema.data.evidence : Array.isArray(value?.evidence) ? value.evidence : []
  // The production schema admits at most 20 quotes; oversized invalid payloads stay bounded here.
  const evidence = quotes.slice(0, 20).map(raw => {
    const quote = object(raw), id = typeof quote?.messageId === 'string' ? quote.messageId.trim() : undefined
    const excerpt = typeof quote?.excerpt === 'string' ? quote.excerpt : undefined
    const source = messages.find(item => item.messageId === id && item.role === 'user') ?? messages.find(item => item.messageId === id)
    return { sourceFound: Boolean(source), userRole: source?.role === 'user',
      exactSubstring: source !== undefined && excerpt !== undefined && source.text.includes(excerpt),
      excerptChars: excerpt?.length ?? null, excerptSha256: excerpt === undefined ? null : hash(excerpt),
      sourceChars: source?.text.length ?? null, sourceSha256: source === undefined ? null : hash(source.text) }
  })
  const metWithoutEvidence = quotes.length === 0 && criteria.some(item => item?.met === true || item?.independent === true)
  const responseComplete = typeof content === 'string' && content.length > 0 && choice?.finish_reason !== 'length'
  const errorCodes: string[] = []
  if (!responseComplete) errorCodes.push('INCOMPLETE_RESPONSE')
  if (!responseJson) errorCodes.push('INVALID_JSON')
  if (!schema.success) errorCodes.push('INVALID_SCHEMA')
  if (!criteriaMatch) errorCodes.push('CRITERIA_MISMATCH')
  if (evidence.some(item => !item.sourceFound)) errorCodes.push('EVIDENCE_SOURCE_NOT_FOUND')
  if (evidence.some(item => item.sourceFound && !item.userRole)) errorCodes.push('EVIDENCE_NOT_USER')
  if (evidence.some(item => item.sourceFound && !item.exactSubstring)) errorCodes.push('EVIDENCE_NOT_EXACT')
  if (metWithoutEvidence) errorCodes.push('MET_WITHOUT_EVIDENCE')
  return { scope: 'validateJudgment' as const, schemaValid: schema.success, criteriaMatch, hasAnswer: Object.hasOwn(input, 'answer'),
    inputSha256: hash(message.content), responseSha256: typeof content === 'string' ? hash(content) : null,
    responseJson, responseComplete, errorCodes,
    schemaIssueCount: schema.success ? 0 : schema.error.issues.length,
    schemaIssues: schema.success ? [] : schema.error.issues.slice(0, 32).map(issue => ({
      code: schemaCodes.find(code => code === issue.code) ?? 'other', field: fields.find(field => field === issue.path[0]) ?? 'other',
    })),
    topLevelFields: Object.fromEntries(fields.map(field => [field, { present: Boolean(value && Object.hasOwn(value, field)),
      type: type(value?.[field]), count: Array.isArray(value?.[field]) ? value[field].length : null,
      chars: typeof value?.[field] === 'string' ? value[field].length : null }])),
    unknownTopLevelKeyCount: value ? Object.keys(value).filter(key => !fields.some(field => field === key)).length : 0,
    evidence, evidenceCount: quotes.length, evidenceTruncated: quotes.length > evidence.length, metWithoutEvidence,
    matchesHostValidation: responseComplete && responseJson && schema.success && criteriaMatch
      && evidence.every(item => item.sourceFound && item.userRole && item.exactSubstring) && !metWithoutEvidence }
}
