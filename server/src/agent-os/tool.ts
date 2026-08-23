export interface DeepSeekFunctionTool {
  type: 'function'
  function: {
    name: 'ipython'
    description: string
    parameters: Record<string, unknown>
    strict: true
  }
}

/** The complete model-visible tool surface. Product capabilities are composed
 * through the preloaded `loop` object inside the persistent IPython kernel. */
export const IPYTHON_TOOL: DeepSeekFunctionTool = {
  type: 'function',
  function: {
    name: 'ipython',
    description: 'Execute Python in your persistent per-agent IPython session. Use the preloaded loop SDK for chat, memory, files, documents, boards, canvas, calendar, routines, research, email, polls, and turn control.',
    parameters: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'Python source. Top-level await is supported. State persists across turns while this agent kernel is alive.',
        },
      },
      required: ['code'],
      additionalProperties: false,
    },
    strict: true,
  },
}

export const MODEL_TOOLS: readonly DeepSeekFunctionTool[] = Object.freeze([IPYTHON_TOOL])

export function parseIPythonArguments(value: string): { code: string } {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new Error('ipython arguments must be valid JSON')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('ipython arguments must be an object')
  }
  const keys = Object.keys(parsed)
  if (keys.length !== 1 || keys[0] !== 'code') {
    throw new Error('ipython accepts exactly one argument: code')
  }
  const code = (parsed as { code?: unknown }).code
  if (typeof code !== 'string' || code.trim().length === 0) {
    throw new Error('ipython code must be a non-empty string')
  }
  return { code }
}
