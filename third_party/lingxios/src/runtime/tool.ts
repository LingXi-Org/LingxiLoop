/**
 * Parsing and bounding of the single `ipython` tool call.
 */
import { MAX_TOOL_OUTPUT_CHARS } from '../protocol/constants.js'

/**
 * Parse the model-emitted tool arguments strictly: a JSON object with exactly
 * one non-empty string property `code`. Anything else is a protocol
 * violation the runtime converts into a bounded correction turn.
 */
export function parseIPythonArguments(raw: string): { code: string } {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('ipython arguments must be strict JSON')
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('ipython arguments must be a JSON object')
  }
  const record = parsed as Record<string, unknown>
  const keys = Object.keys(record)
  if (keys.length !== 1 || keys[0] !== 'code') {
    throw new Error('ipython arguments must contain exactly one property: "code"')
  }
  const code = record['code']
  if (typeof code !== 'string' || !code.trim()) {
    throw new Error('ipython "code" must be a non-empty string')
  }
  return { code }
}

/**
 * Serialize a tool output for the model, truncating oversized payloads into
 * an explicit `{truncated, preview}` shape rather than corrupting JSON.
 */
export function boundedToolOutput(value: unknown, maxChars: number = MAX_TOOL_OUTPUT_CHARS): string {
  const serialized = JSON.stringify(value) ?? 'null'
  if (serialized.length <= maxChars) return serialized
  return JSON.stringify({ truncated: true, preview: serialized.slice(0, maxChars - 80) })
}
