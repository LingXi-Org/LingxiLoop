import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { createHash } from 'node:crypto'

function usageOf(usage) {
  if (!usage) return null
  const cacheHit = usage.prompt_cache_hit_tokens ?? usage.prompt_tokens_details?.cached_tokens
  const cacheMiss = usage.prompt_cache_miss_tokens ??
    (Number.isSafeInteger(cacheHit) ? usage.prompt_tokens - cacheHit : undefined)
  const output = usage.completion_tokens
  const parts = { cacheHit, cacheMiss, output }
  return Object.values(parts).every(value => Number.isSafeInteger(value) && value >= 0) &&
    cacheHit + cacheMiss === usage.prompt_tokens ? parts : null
}

async function requestJson(request, limit) {
  const parts = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > limit) throw new Error('request too large')
    parts.push(chunk)
  }
  return JSON.parse(Buffer.concat(parts))
}

function observeFrame(frame, callParts) {
  for (const choice of frame.choices ?? []) {
    const content = choice.delta ?? choice.message
    for (const [position, delta] of (content?.tool_calls ?? []).entries()) {
      const key = `${choice.index ?? 0}:${delta.index ?? position}`
      const call = callParts.get(key) ?? { tool: '', arguments: '' }
      call.tool += delta.function?.name ?? ''
      call.arguments += delta.function?.arguments ?? ''
      callParts.set(key, call)
    }
  }
  return usageOf(frame.usage)
}

function smokeReply(task, index, model, streaming) {
  const next = task.expectedCalls[index]
  const content = next ? { tool_calls: [{
    id: `fixture-${index}`, type: 'function', ...(streaming ? { index: 0 } : {}),
    function: { name: next.tool, arguments: JSON.stringify(next.args) },
  }] } : { content: task.expectedAnswer }
  const usage = { prompt_tokens: 200, completion_tokens: 20, total_tokens: 220,
    prompt_cache_hit_tokens: 0, prompt_cache_miss_tokens: 200 }
  const base = { id: `fixture-${index}`, model, created: 1234567890 }
  const choice = { index: 0, finish_reason: next ? 'tool_calls' : 'stop' }
  if (!streaming) return Response.json({ ...base, object: 'chat.completion', usage,
    choices: [{ ...choice, message: { role: 'assistant', ...content } }] })
  const object = 'chat.completion.chunk'
  return new Response([
    { ...base, object, choices: [{ ...choice, finish_reason: null, delta: { role: 'assistant', ...content } }] },
    { ...base, object, choices: [{ ...choice, delta: {} }] },
    { ...base, object, choices: [], usage },
  ].map(frame => 'data: ' + JSON.stringify(frame) + '\n\n').join('') + 'data: [DONE]\n\n',
  { headers: { 'content-type': 'text/event-stream' } })
}

export async function openGateway({ manifest, task, tools, executeTool, key }) {
  const providerUsage = []
  const attempts = []
  const catalogs = []
  const failures = []
  const requestDiagnostics = []
  let sampleStarted = performance.now()
  let blockedStatus
  let exceeded = false
  let signal
  const active = new Set()
  const server = createServer(async (request, response) => {
    let finish
    const settled = new Promise(resolve => { finish = resolve })
    active.add(settled)
    let callParts
    let usageIndex
    let diagnostic
    let began
    try {
      if (request.method !== 'POST') return response.writeHead(405).end()
      if (request.url === '/fixture') {
        const { tool, args } = await requestJson(request, 131_072)
        const result = await executeTool(tool, args)
        return response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(result))
      }
      if (request.url !== '/v1/chat/completions') return response.writeHead(404).end()
      if (!signal || signal.aborted || providerUsage.length >= manifest.maxModelRequests ||
          attempts.length > manifest.maxToolAttempts) {
        exceeded = true
        return response.writeHead(429).end()
      }
      const input = await requestJson(request, 131_072)
      assert.equal(input.model, manifest.model.id, 'Unexpected model route')
      const nativeCatalog = new Set((input.tools ?? []).map(tool => tool.function.name))
      assert.ok(tools.every(tool => nativeCatalog.has(tool.name)), `Fixture tool missing from native model request: ${[...nativeCatalog]}`)
      const expectedCatalog = tools.map(tool => ({ type: 'function', function: tool }))
      // Both adapters reach the same provider with identical public schemas and model controls.
      // LingxiOS's internal task helpers may exist locally, but are excluded from the advertised catalog.
      const { tools: _nativeTools, tool_choice: _choice, parallel_tool_calls: _parallel, reasoning_effort: _effort,
        max_completion_tokens: _completionLimit, thinking: _thinking, enable_thinking: _enableThinking, ...body } = input
      Object.assign(body, {
        max_tokens: manifest.model.maxTokens,
        temperature: manifest.model.temperature,
        enable_thinking: manifest.model.thinking !== 'disabled',
        ...(expectedCatalog.length ? { tools: expectedCatalog, tool_choice: 'auto',
          parallel_tool_calls: manifest.model.parallelToolCalls } : {}),
      })
      if (body.stream) body.stream_options = { include_usage: true }
      catalogs.push(tools.map(tool => tool.name))
      usageIndex = providerUsage.push(null) - 1
      began = performance.now()
      const messageBytesByRole = {}
      for (const message of body.messages ?? []) {
        const role = ['system', 'developer', 'user', 'assistant', 'tool'].includes(message.role) ? message.role : 'other'
        messageBytesByRole[role] = (messageBytesByRole[role] ?? 0) + Buffer.byteLength(JSON.stringify(message))
      }
      diagnostic = { index: usageIndex, startOffsetMs: began - sampleStarted, messageBytesByRole,
        requestBytes: Buffer.byteLength(JSON.stringify(body)),
        requestSha256: createHash('sha256').update(JSON.stringify(body)).digest('hex'),
        systemSha256: createHash('sha256').update(JSON.stringify((body.messages ?? []).filter(m => m.role === 'system'))).digest('hex'),
        stream: Boolean(body.stream), nativeToolCount: nativeCatalog.size, providerToolCount: tools.length }
      requestDiagnostics.push(diagnostic)
      response.once('close', () => {
        diagnostic.clientClosedMs = performance.now() - began
        diagnostic.clientClosedBeforeEnd = !response.writableEnded
      })
      const upstream = key ? await fetch(new URL('chat/completions', manifest.model.baseUrl), {
        method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify(body), signal, redirect: 'error',
      }) : smokeReply(task, usageIndex, manifest.model.id, body.stream)
      diagnostic.headersMs = performance.now() - began
      diagnostic.httpStatus = upstream.status
      if (!upstream.ok) {
        if ([401, 402, 403].includes(upstream.status)) blockedStatus = upstream.status
        failures.push(`provider-http-${upstream.status}`)
        // Retain no provider error body and never expose authorization headers.
        await upstream.body?.cancel()
        return response.writeHead(upstream.status).end()
      }
      callParts = new Map()
      const contentType = upstream.headers.get('content-type') ?? 'application/json'
      response.writeHead(200, { 'content-type': contentType })
      if (contentType.startsWith('text/event-stream')) {
        const decoder = new TextDecoder()
        let remainder = ''
        function consume(text) {
          remainder += text
          const lines = remainder.split('\n')
          remainder = lines.pop()
          for (const line of lines) {
            if (!line.startsWith('data:')) continue
            const payload = line.slice(5).trim()
            if (payload === '[DONE]') { diagnostic.doneMarkerMs = performance.now() - began; continue }
            if (!payload) continue
            const frame = JSON.parse(payload)
            if (frame.choices?.some(c => c.delta?.content || c.delta?.tool_calls?.length)) diagnostic.firstContentMs ??= performance.now() - began
            const usage = observeFrame(frame, callParts)
            if (usage) providerUsage[usageIndex] = usage
          }
        }
        for await (const chunk of upstream.body) {
          diagnostic.firstByteMs ??= performance.now() - began
          consume(decoder.decode(chunk, { stream: true }))
          if (response.destroyed) break
          if (!response.write(chunk)) await once(response, 'drain', { signal })
        }
        consume(decoder.decode() + '\n')
      } else {
        const frame = await upstream.json()
        providerUsage[usageIndex] = observeFrame(frame, callParts)
        response.write(JSON.stringify(frame))
      }
      response.end()
    } catch (error) {
      if (diagnostic) diagnostic.error = error.name
      failures.push(key ? error.name : error.message)
      if (!response.headersSent && !response.destroyed) response.writeHead(502)
      response.end()
    } finally {
      if (diagnostic) { diagnostic.elapsedMs = performance.now() - began; diagnostic.usagePresent = providerUsage[usageIndex] !== null }
      if (callParts) for (const { tool, arguments: raw } of callParts.values()) {
        let args
        try { args = JSON.parse(raw) } catch { args = raw }
        attempts.push({ tool, args })
      }
      if (attempts.length > manifest.maxToolAttempts) exceeded = true
      active.delete(settled)
      finish()
    }
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const url = `http://127.0.0.1:${server.address().port}`
  return {
    baseUrl: url + '/v1', fixtureUrl: url + '/fixture', providerUsage, attempts, catalogs, failures, requestDiagnostics,
    get blockedStatus() { return blockedStatus },
    get exceeded() { return exceeded },
    start(deadline) { signal = deadline; sampleStarted = performance.now() },
    async stop() {
      server.closeAllConnections()
      await new Promise(resolve => server.close(resolve))
      await Promise.all([...active])
    },
  }
}
