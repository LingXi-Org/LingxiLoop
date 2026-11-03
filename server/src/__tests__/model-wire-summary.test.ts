import assert from 'node:assert/strict'
import test from 'node:test'
import { modelWireSummary, installModelWireSummary } from '../__integration__/_model-wire-summary.js'

test('wire summary counts both SSE shapes without releasing text, arguments, schema names or credentials', () => {
  const privateValue = 'PRIVATE_DO_NOT_OUTPUT'
  const summary = modelWireSummary({ model: privateValue, apiKey: privateValue, tools: [{ function: { name: 'public_answer', parameters: privateValue } }],
    messages: [{ content: privateValue }], tool_choice: 'required', stream: true, enable_thinking: false })
  const frame = `data: ${JSON.stringify({ choices: [{ delta: { content: privateValue, reasoning_content: privateValue, tool_calls: [{ function: { name: 'public_answer', arguments: privateValue } }] }, finish_reason: 'tool_calls' }, { message: { function_call: {}, tool_calls: [{ function: { name: privateValue, arguments: '中文' } }] }, finish_reason: 'stop' }] })}\r\n`
  for (const chunk of frame) summary.push(chunk)
  summary.push('data: invalid\ndata: [DONE]'); summary.finish()
  assert.equal(summary.record.request.requiredChoice, true)
  assert.equal(summary.record.response.toolCallParts, 2)
  assert.equal(summary.record.response.argumentBytes, Buffer.byteLength(privateValue + '中文'))
  assert.equal(summary.record.response.contentBytes, Buffer.byteLength(privateValue))
  assert.equal(summary.record.response.finishStop, 1)
  assert.equal(summary.record.response.finishTools, 1)
  assert.equal(summary.record.response.legacyFunctionFields, 1)
  assert.equal(summary.record.response.malformedFrames, 1)
  assert.equal(summary.record.response.doneFrames, 1)
  assert.doesNotMatch(JSON.stringify(summary.record), /PRIVATE_DO_NOT_OUTPUT|中文/)
})

test('wire observer forwards every original byte and non-provider request, then restores fetch', async () => {
  const original = globalThis.fetch, wire = new TextEncoder().encode('data: {"choices":[{"delta":{"content":"中文"}}]}\n\ndata: [DONE]\n')
  let calls = 0
  globalThis.fetch = async () => { calls++; return new Response(new ReadableStream({ start(controller) { for (const byte of wire) controller.enqueue(Uint8Array.of(byte)); controller.close() } }), { headers: { 'content-type': 'text/event-stream' } }) }
  const fixtureFetch = globalThis.fetch, observer = installModelWireSummary('https://provider.test/v1/')
  try {
    const response = await fetch('https://provider.test/v1/chat/completions', { method: 'POST', body: JSON.stringify({ stream: true, tool_choice: 'required' }) })
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), wire)
    assert.equal(observer.records[0].response.contentBytes, 6)
    assert.equal(observer.records[0].response.streamEnd, 'eof')
    await fetch('http://127.0.0.1/health')
    assert.equal(calls, 2); assert.equal(observer.records.length, 1)
    observer.restore(); assert.equal(globalThis.fetch, fixtureFetch)
  } finally { globalThis.fetch = original }
})

test('observer restores fetch even if fixture cleanup rejects', async () => {
  const original = globalThis.fetch, observer = installModelWireSummary('https://provider.test/v1/')
  await assert.rejects(observer.close(async () => { throw new Error('synthetic cleanup rejection') }), /synthetic cleanup/)
  assert.equal(globalThis.fetch, original)
})

test('matched controls change one input dimension, emit no payload and never execute returned tools', async () => {
  const original = globalThis.fetch, requests: Record<string, unknown>[] = []
  globalThis.fetch = async (_input, init) => {
    requests.push(JSON.parse(String(init?.body)))
    return new Response('data: {"choices":[{"delta":{"tool_calls":[{"function":{"name":"public_answer","arguments":"PRIVATE_RESPONSE"}}]},"finish_reason":"tool_calls"}]}\n\ndata: [DONE]\n', { headers: { 'content-type': 'text/event-stream' } })
  }
  const observer = installModelWireSummary('https://provider.test/v1/', true)
  const request = { messages: [{ content: 'PRIVATE_PROMPT' }], tools: [{ function: { name: 'public_answer', parameters: { description: 'PRIVATE_SCHEMA' } } }], parallel_tool_calls: true, tool_choice: 'required', stream: true }
  try {
    await (await fetch('https://provider.test/v1/chat/completions', { method: 'POST', headers: { authorization: 'PRIVATE_TOKEN' }, body: JSON.stringify(request) })).text()
    const results = await observer.matchedControls()
    assert.equal(requests.length, 4)
    assert.ok(JSON.stringify(requests[0]) === JSON.stringify(requests[1]))
    assert.ok(JSON.stringify({ ...requests[2], parallel_tool_calls: true }) === JSON.stringify(requests[0]))
    assert.ok(JSON.stringify({ ...requests[3], messages: request.messages }) === JSON.stringify(requests[0]))
    assert.ok(Array.isArray(results))
    assert.equal(results.length, 3)
    assert.ok(results.every(value => value.response.toolCallParts === 1))
    assert.doesNotMatch(JSON.stringify(results), /PRIVATE_/)
    assert.deepEqual(await observer.matchedControls(), [], 'captured request is discarded after controls')
  } finally { observer.restore(); globalThis.fetch = original }
})

test('schema partition stops within eight probes and exposes indices instead of definitions', async () => {
  const original = globalThis.fetch
  let calls = 0
  globalThis.fetch = async (_input, init) => {
    calls++
    const request = JSON.parse(String(init?.body)), bad = request.tools.some((tool: { function: { parameters?: { marker?: string } } }) => tool.function.parameters?.marker === 'PRIVATE_BAD')
    const choice = bad ? { delta: { content: '' }, finish_reason: 'stop' } : { delta: { tool_calls: [{ function: { name: 'public_answer', arguments: 'PRIVATE_ARG' } }] }, finish_reason: 'tool_calls' }
    return new Response(`data: ${JSON.stringify({ choices: [choice] })}\n\ndata: [DONE]\n`, { headers: { 'content-type': 'text/event-stream' } })
  }
  const observer = installModelWireSummary('https://provider.test/v1', true)
  try {
    const tools = Array.from({ length: 8 }, (_, index) => ({ function: { name: index === 0 ? 'public_answer' : `PRIVATE_TOOL_${index}`, parameters: { marker: index === 5 ? 'PRIVATE_BAD' : 'PRIVATE_SCHEMA' } } }))
    await (await fetch('https://provider.test/v1/chat/completions', { method: 'POST', body: JSON.stringify({ tools, messages: [{ content: 'PRIVATE_PROMPT' }], stream: true, tool_choice: 'required' }) })).text()
    const result = await observer.matchedControls(true)
    assert.ok(!Array.isArray(result))
    assert.equal(result.isolatedSingleTool, true)
    assert.deepEqual(result.remainingToolIndices, [5])
    assert.ok(calls <= 9)
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE_/)
  } finally { observer.restore(); globalThis.fetch = original }
})

test('one remaining candidate without a failed probe is never called isolated', async () => {
  const original = globalThis.fetch
  globalThis.fetch = async () => new Response('data: {"choices":[{"delta":{"tool_calls":[{"function":{"name":"public_answer","arguments":"{}"}}]},"finish_reason":"tool_calls"}]}\n', { headers: { 'content-type': 'text/event-stream' } })
  const observer = installModelWireSummary('https://provider.test/v1', true)
  try {
    await (await fetch('https://provider.test/v1/chat/completions', { body: JSON.stringify({ tools: [{ function: { name: 'public_answer' } }, { function: { name: 'synthetic_business' } }] }) })).text()
    const result = await observer.matchedControls(true)
    assert.ok(!Array.isArray(result)); assert.equal(result.isolatedSingleTool, false)
  } finally { observer.restore(); globalThis.fetch = original }
})

test('wire lifecycle distinguishes transport failure from downstream cancellation without exporting its reason', async () => {
  const original = globalThis.fetch
  let cancelled = false
  const chunk = new TextEncoder().encode('data: {"choices":[{"delta":{"tool_calls":[{"function":{"name":"public_answer","arguments":"PRIVATE_PARTIAL"}}]}}]}\n')
  try {
    globalThis.fetch = async () => { let read = false; return new Response(new ReadableStream({ pull(controller) {
      if (!read) { read = true; controller.enqueue(chunk) }
      else controller.error(Object.assign(new TypeError('PRIVATE_ERROR'), { cause: { code: 'UND_ERR_SOCKET' } }))
    } }), { headers: { 'content-type': 'text/event-stream' } }) }
    let observer = installModelWireSummary('https://provider.test/v1')
    await assert.rejects((await fetch('https://provider.test/v1/chat/completions', { body: '{}' })).text())
    assert.equal(observer.records[0].response.streamEnd, 'transport-error')
    assert.equal(observer.records[0].response.transportSocket, true)
    assert.equal(observer.records[0].response.toolCallParts, 1)
    assert.doesNotMatch(JSON.stringify(observer.records), /PRIVATE_/)
    observer.restore()
    globalThis.fetch = async () => new Response(new ReadableStream({ start(controller) { controller.enqueue(chunk) }, cancel() { cancelled = true } }), { headers: { 'content-type': 'text/event-stream' } })
    observer = installModelWireSummary('https://provider.test/v1')
    const reader = (await fetch('https://provider.test/v1/chat/completions', { body: '{}' })).body!.getReader()
    await reader.read(); await reader.cancel(new Error('PRIVATE_CALLBACK_REASON')); reader.releaseLock()
    assert.equal(observer.records[0].response.streamEnd, 'consumer-cancelled')
    assert.equal(observer.records[0].response.consumerReasonProvided, true)
    assert.equal(cancelled, true)
    assert.doesNotMatch(JSON.stringify(observer.records), /PRIVATE_/)
    observer.restore()
  } finally { globalThis.fetch = original }
})
