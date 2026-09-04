import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { test } from 'node:test'
import { ModelAdapterError, OpenAIChatDriver } from '../agent-os/model-driver.js'

async function withGateway(
  events: unknown[],
  run: (baseURL: string, requestBodies: Record<string, unknown>[]) => Promise<void>,
): Promise<void> {
  const requestBodies: Record<string, unknown>[] = []
  const server = createServer((request, response) => {
    const body: Buffer[] = []
    request.on('data', (chunk: Buffer) => body.push(chunk))
    request.on('end', () => {
      const requestBody = JSON.parse(Buffer.concat(body).toString()) as Record<string, unknown>
      requestBodies.push(requestBody)
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      for (const event of events) response.write(`data: ${JSON.stringify(event)}\n\n`)
      response.end('data: [DONE]\n\n')
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    const address = server.address()
    assert.ok(address && typeof address === 'object')
    await run(`http://127.0.0.1:${address.port}/v1`, requestBodies)
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
}

test('OpenAI stream parses native deltas and marks missing usage', async () => {
  const events = [{
    id: 'chatcmpl-native', object: 'chat.completion.chunk', created: 1, model: 'native-test-model',
    choices: [{ index: 0, delta: { role: 'assistant', content: 'Gateway reply' }, finish_reason: 'stop' }],
  }]
  await withGateway(events, async (baseURL, requestBodies) => {
    const driver = new OpenAIChatDriver('native-test-model', { apiKey: 'test', baseURL })
    const result = await driver.run({ instructions: 'System prompt', items: [{ role: 'user', content: 'Hello' }] })
    assert.equal(result.text, 'Gateway reply')
    assert.deepEqual(result.output, [{ role: 'assistant', content: 'Gateway reply' }])
    assert.equal(result.usage.available, false)
    assert.deepEqual(result.diagnostics?.finishReasons, ['stop'])
    assert.equal(requestBodies[0]?.stream, true)
    assert.equal(requestBodies[0]?.parallel_tool_calls, false)
    const tools = requestBodies[0]?.tools as Array<{ function?: { strict?: boolean; parameters?: { additionalProperties?: boolean } } }>
    assert.equal(tools[0]?.function?.strict, true)
    assert.equal(tools[0]?.function?.parameters?.additionalProperties, false)
  })
})

test('multiple streamed tool calls fail instead of entering invalid history', async () => {
  const events = [{
    id: 'chatcmpl-multiple', object: 'chat.completion.chunk', created: 1, model: 'native-test-model',
    choices: [{
      index: 0,
      delta: { tool_calls: [
        { index: 0, id: 'call-1', function: { name: 'ipython', arguments: '{"code":"1"}' } },
        { index: 1, id: 'call-2', function: { name: 'ipython', arguments: '{"code":"2"}' } },
      ] },
      finish_reason: 'tool_calls',
    }],
  }]
  await withGateway(events, async (baseURL) => {
    await assert.rejects(
      new OpenAIChatDriver('native-test-model', { apiKey: 'test', baseURL }).run({
        instructions: 'System prompt',
        items: [{ role: 'user', content: 'Inspect' }],
      }),
      /multiple tool calls/,
    )
  })
})

test('OpenAI stream discards provider reasoning and invisible whitespace text', async () => {
  const events = [
    {
      id: 'chatcmpl-reasoning', object: 'chat.completion.chunk', created: 1, model: 'native-test-model',
      choices: [{ index: 0, delta: { reasoning_content: 'Inspecting' }, finish_reason: null }],
    },
    {
      id: 'chatcmpl-reasoning', object: 'chat.completion.chunk', created: 1, model: 'native-test-model',
      choices: [{ index: 0, delta: { content: '\n\n' }, finish_reason: null }],
    },
    {
      id: 'chatcmpl-reasoning', object: 'chat.completion.chunk', created: 1, model: 'native-test-model',
      choices: [{
        index: 0,
        delta: { tool_calls: [{ index: 0, id: 'call-1', function: { name: 'ipython', arguments: '{"code":"1 + 1"}' } }] },
        finish_reason: 'tool_calls',
      }],
    },
  ]
  await withGateway(events, async (baseURL, requestBodies) => {
    const text: string[] = []
    const result = await new OpenAIChatDriver('Qwen/Qwen3.5-4B', { apiKey: 'test', baseURL }).run({
      instructions: 'System prompt',
      items: [{ role: 'user', content: 'Inspect' }],
      onTextDelta: (delta) => { text.push(delta) },
    })
    assert.deepEqual(text, [])
    assert.deepEqual(result.output, [{ type: 'function_call', callId: 'call-1', name: 'ipython', arguments: '{"code":"1 + 1"}' }])
    assert.equal(requestBodies[0]?.enable_thinking, false)
  })
})

test('Qwen aliases disable thinking and remove its provider reasoning envelope', async () => {
  const events = [{
    id: 'chatcmpl-qwen', object: 'chat.completion.chunk', created: 1, model: 'qwen3.5-plus',
    choices: [{ index: 0, delta: { content: '</thinking>\n\n最终回答' }, finish_reason: 'stop' }],
  }]
  await withGateway(events, async (baseURL, requestBodies) => {
    const deltas: string[] = []
    const result = await new OpenAIChatDriver('qwen3.5-plus', { apiKey: 'test', baseURL }).run({
      instructions: 'System prompt',
      items: [{ role: 'user', content: 'Hello' }],
      onTextDelta: (delta) => { deltas.push(delta) },
    })
    assert.equal(requestBodies[0]?.enable_thinking, false)
    assert.deepEqual(deltas, ['最终回答'])
    assert.equal(result.text, '最终回答')
  })
})

test('empty native stream throws an explicit adapter error with parse diagnostics', async () => {
  const events = [{
    id: 'chatcmpl-empty', object: 'chat.completion.chunk', created: 1, model: 'native-test-model',
    choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: 'stop' }],
  }]
  await withGateway(events, async (baseURL, requestBodies) => {
    const driver = new OpenAIChatDriver('native-test-model', { apiKey: 'test', baseURL })
    await assert.rejects(
      driver.run({ instructions: 'System prompt', items: [{ role: 'user', content: 'Hello' }] }),
      (error: unknown) => {
        assert.ok(error instanceof ModelAdapterError)
        assert.match(error.message, /no assistant content or supported tool calls/)
        assert.equal(error.diagnostics.chunkCount, 1)
        assert.deepEqual(error.diagnostics.finishReasons, ['stop'])
        assert.match(error.diagnostics.chunkShapes[0] ?? '', /deltaKeys/)
        assert.deepEqual(requestBodies.map((body) => body.stream), [true])
        return true
      },
    )
  })
})

test('empty stream fails without issuing an alternate request', async () => {
  await withGateway([], async (baseURL, requestBodies) => {
    await assert.rejects(
      new OpenAIChatDriver('native-test-model', { apiKey: 'test', baseURL }).run({
        instructions: 'System prompt',
        items: [{ role: 'user', content: 'Hello' }],
      }),
      ModelAdapterError,
    )
    assert.deepEqual(requestBodies.map((body) => body.stream), [true])
  })
})
