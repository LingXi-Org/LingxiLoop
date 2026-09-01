export interface OpenAIFunctionTool {
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
export const IPYTHON_TOOL: OpenAIFunctionTool = {
  type: 'function',
  function: {
    name: 'ipython',
    description: 'Execute pure Python in the persistent per-agent IPython session. Product actions use only the preloaded capability-gated loop SDK. loop methods are synchronous and accept keyword arguments.',
    parameters: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'Executable Python source only, without Markdown fences or user-facing prose. Python state persists across turns; never await loop SDK calls.',
        },
      },
      required: ['code'],
      additionalProperties: false,
    },
    strict: true,
  },
}

export const MODEL_TOOLS: readonly OpenAIFunctionTool[] = Object.freeze([IPYTHON_TOOL])

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
