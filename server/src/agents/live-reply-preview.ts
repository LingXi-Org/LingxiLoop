/**
 * Extract the visible prefix of `lingxiloop reply` from an INCOMPLETE
 * Responses API function-call argument string. This lets turn.ts forward the
 * model's native argument deltas instead of waiting for the completed command
 * and cosmetically replaying an already-finished answer.
 */

function partialJsonString(raw: string, start: number): string {
  let out = ''
  for (let i = start; i < raw.length; i += 1) {
    const ch = raw[i]
    if (ch === '"') break
    if (ch !== '\\') { out += ch; continue }
    if (i + 1 >= raw.length) break
    const escaped = raw[++i]
    if (escaped === 'n') out += '\n'
    else if (escaped === 'r') out += '\r'
    else if (escaped === 't') out += '\t'
    else if (escaped === 'b') out += '\b'
    else if (escaped === 'f') out += '\f'
    else if (escaped === 'u') {
      const hex = raw.slice(i + 1, i + 5)
      if (!/^[0-9a-f]{4}$/i.test(hex)) break
      out += String.fromCharCode(Number.parseInt(hex, 16))
      i += 4
    } else out += escaped
  }
  return out
}

export interface LiveReplyPrefix {
  conversationId: string
  body: string
}

export function extractLiveReplyPrefix(rawArguments: string): LiveReplyPrefix | null {
  const commandKey = /"command"\s*:\s*"/.exec(rawArguments)
  if (!commandKey) return null
  const command = partialJsonString(rawArguments, commandKey.index + commandKey[0].length)
  const reply = /(?:^|[;&|]\s*)lingxiloop\s+reply\s+(\S+)\s+'([\s\S]*)$/.exec(command)
  if (!reply) return null
  let body = reply[2]
  // CLI commands shell-escape an apostrophe as '\''; decode every COMPLETE
  // escape group and leave a trailing partial group buffered for the next delta.
  body = body.replace(/'\\''/g, "'")
  if (body.endsWith("'")) body = body.slice(0, -1)
  return { conversationId: reply[1], body }
}
