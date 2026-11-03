/** Test-only transparent wire observer. Text, tool arguments, headers and tool
 * schemas are consumed in memory; only closed counters/flags escape this module. */
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const bytes = (value: unknown) => typeof value === 'string' ? Buffer.byteLength(value) : 0
export function modelWireSummary(request: unknown) {
  const input = object(request), tools = Array.isArray(input.tools) ? input.tools : []
  const names = tools.map(tool => object(object(tool).function).name)
  const record = {
    request: { streamed: input.stream === true, requiredChoice: input.tool_choice === 'required', autoChoice: input.tool_choice === 'auto',
      namedChoice: typeof input.tool_choice === 'object' && input.tool_choice !== null,
      toolCount: tools.length, publicAnswerCount: names.filter(name => name === 'public_answer').length,
      publicAnswerFirst: names[0] === 'public_answer', parallelTools: input.parallel_tool_calls === true,
      thinkingDisabled: input.enable_thinking === false, responseFormatAbsent: input.response_format === undefined,
      messages: Array.isArray(input.messages) ? input.messages.length : 0 },
    response: { frames: 0, malformedFrames: 0, doneFrames: 0, deltaChoices: 0, messageChoices: 0,
      contentFields: 0, contentBytes: 0, reasoningFields: 0, reasoningBytes: 0,
      toolCallFields: 0, toolCallParts: 0, publicAnswerNameParts: 0, otherNameParts: 0,
      argumentFields: 0, argumentBytes: 0, legacyFunctionFields: 0,
      finishStop: 0, finishTools: 0, finishLength: 0, finishOther: 0, oversizedLines: 0, otherDeltaFields: 0 },
  }
  let buffer = '', overflow = false
  const line = (text: string) => {
    if (!text.startsWith('data:')) return
    const data = text.slice(5).trim()
    if (data === '[DONE]') { record.response.doneFrames++; return }
    record.response.frames++
    let frame: Record<string, unknown>
    try { frame = object(JSON.parse(data)) } catch { record.response.malformedFrames++; return }
    for (const raw of Array.isArray(frame.choices) ? frame.choices : []) {
      const choice = object(raw)
      if (choice.finish_reason) {
        if (choice.finish_reason === 'stop') record.response.finishStop++
        else if (choice.finish_reason === 'tool_calls') record.response.finishTools++
        else if (choice.finish_reason === 'length') record.response.finishLength++
        else record.response.finishOther++
      }
      for (const key of ['delta', 'message'] as const) {
        if (!choice[key]) continue
        if (key === 'delta') record.response.deltaChoices++; else record.response.messageChoices++
        const part = object(choice[key])
        record.response.otherDeltaFields += Object.keys(part).filter(field => !['role', 'content', 'reasoning_content', 'tool_calls', 'function_call'].includes(field)).length
        if (typeof part.content === 'string') { record.response.contentFields++; record.response.contentBytes += bytes(part.content) }
        if (typeof part.reasoning_content === 'string') { record.response.reasoningFields++; record.response.reasoningBytes += bytes(part.reasoning_content) }
        if (part.function_call) record.response.legacyFunctionFields++
        if (!Array.isArray(part.tool_calls)) continue
        record.response.toolCallFields++
        for (const rawTool of part.tool_calls) {
          record.response.toolCallParts++
          const fn = object(object(rawTool).function)
          if (typeof fn.name === 'string') {
            if (fn.name === 'public_answer') record.response.publicAnswerNameParts++
            else record.response.otherNameParts++
          }
          if (typeof fn.arguments === 'string') { record.response.argumentFields++; record.response.argumentBytes += bytes(fn.arguments) }
        }
      }
    }
  }
  return { record,
    push(text: string) {
      for (const fragment of text.split(/(?<=\n)/)) {
        if (!overflow) buffer += fragment
        if (buffer.length > 2_000_000) { buffer = ''; overflow = true; record.response.oversizedLines++ }
        if (fragment.endsWith('\n')) { if (!overflow) line(buffer.trimEnd()); buffer = ''; overflow = false }
      }
    },
    finish() { if (!overflow && buffer) line(buffer.trimEnd()); buffer = '' },
  }
}

export function installModelWireSummary(base: string, controls = false) {
  const endpoint = `${base.replace(/\/+$/, '')}/chat/completions`
  let first: { request: Record<string, unknown>; init: RequestInit } | undefined
  const original = globalThis.fetch, records: ReturnType<typeof modelWireSummary>['record'][] = []
  const scoped: typeof fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input)
    if (url !== endpoint || typeof init?.body !== 'string') return original(input, init)
    let request: unknown
    try { request = JSON.parse(init.body) } catch { return original(input, init) }
    if (controls && !first) first = { request: object(request), init }
    const observer = modelWireSummary(request)
    records.push(observer.record)
    const response = await original(input, init)
    if (!response.body || !response.ok || !response.headers.get('content-type')?.includes('text/event-stream')) return response
    const decoder = new TextDecoder()
    const body = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) { observer.push(decoder.decode(chunk, { stream: true })); controller.enqueue(chunk) },
      flush() { observer.push(decoder.decode()); observer.finish() },
    }))
    return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers })
  }
  globalThis.fetch = scoped
  const restore = () => { first = undefined; if (globalThis.fetch !== scoped) throw new Error('wire observer fetch changed before restoration'); globalThis.fetch = original }
  return { records, restore,
    async close(cleanup: () => Promise<void>) { try { await cleanup() } finally { restore() } },
    async matchedControls(schema = false) {
      const captured = first; first = undefined
      if (!captured) return []
      const variants = [
        ['same-request', captured.request],
        ['parallel-disabled', { ...captured.request, parallel_tool_calls: false }],
        ['minimal-context', { ...captured.request, messages: [
          { role: 'system', content: 'Use the exposed public_answer native tool to answer. Its arguments must match its schema: append operation, one short answer, empty commentary, and a satisfied outcome with no gaps. Do not use assistant prose.' },
          { role: 'user', content: 'In one sentence, is Wi-Fi the same as the Internet?' },
        ] }],
      ] as const
      const results: Array<{ kind: string; status: number; transportFailed: boolean } & ReturnType<typeof modelWireSummary>['record']> = []
      const probe = async (kind: string, request: unknown) => {
        const observer = modelWireSummary(request)
        let status = 0, transportFailed = false
        try {
          const response = await original(endpoint, { ...captured.init, body: JSON.stringify(request), signal: AbortSignal.timeout(45000) })
          status = response.status
          if (response.ok && response.body && response.headers.get('content-type')?.includes('text/event-stream')) {
            const reader = response.body.getReader(), decoder = new TextDecoder()
            try { while (true) { const { value, done } = await reader.read(); if (done) break; observer.push(decoder.decode(value, { stream: true })) } }
            finally { reader.releaseLock() }
            observer.push(decoder.decode()); observer.finish()
          } else await response.body?.cancel()
        } catch { transportFailed = true }
        const result = { kind, status, transportFailed, ...observer.record }; results.push(result); return result
      }
      if (schema) {
        const minimal = variants[2][1], all = Array.isArray(captured.request.tools) ? captured.request.tools : []
        const publicTools = all.filter(tool => object(object(tool).function).name === 'public_answer')
        let candidates = all.map((tool, index) => ({ tool, index })).filter(value => object(object(value.tool).function).name !== 'public_answer')
        const empty = (value: Awaited<ReturnType<typeof probe>>) => value.status === 200 && !value.transportFailed && value.response.finishStop > 0 && value.response.toolCallParts === 0
        const baseline = await probe('public-only', { ...minimal, tools: publicTools })
        if (baseline.response.toolCallParts === 0) return results
        let failedSubsetObserved = false
        while (candidates.length > 1 && results.length < 8) {
          const middle = Math.ceil(candidates.length / 2), halves = [candidates.slice(0, middle), candidates.slice(middle)]
          let reduced = false
          for (const half of halves) {
            if (results.length >= 8) break
            const result = await probe(`subset-${results.length}`, { ...minimal, tools: [...publicTools, ...half.map(value => value.tool)] })
            if (empty(result)) { candidates = half; failedSubsetObserved = true; reduced = true; break }
          }
          if (!reduced) break
        }
        // Only indices escape; schema/name/content remain in the captured memory.
        return { results, remainingToolIndices: candidates.map(value => value.index), isolatedSingleTool: candidates.length === 1 && failedSubsetObserved, probeLimit: 8 }
      }
      for (const [kind, request] of variants) await probe(kind, request)
      return results
    },
  }
}
