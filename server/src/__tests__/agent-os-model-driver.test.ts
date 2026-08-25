import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { test } from 'node:test'
import { DeepSeekChatDriver, ModelAdapterError } from '../agent-os/model-driver.js'

async function withGateway(
  events: unknown[],
  run: (baseURL: string, requestBodies: Record<string, unknown>[]) => Promise<void>,
  fallbackResponse?: unknown,
): Promise<void> {
  const requestBodies: Record<string, unknown>[] = []
  const server = createServer((request, response) => {
    const body: Buffer[] = []
    request.on('data', (chunk: Buffer) => body.push(chunk))
    request.on('end', () => {
      const requestBody = JSON.parse(Buffer.concat(body).toString()) as Record<string, unknown>
      requestBodies.push(requestBody)
      if (requestBody.stream === false) {
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end(JSON.stringify(fallbackResponse))
        return
      }
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

test('OpenAI-compatible stream parses complete message envelopes and marks missing usage', async () => {
  const events = [{
    id: 'chatcmpl-compatible', object: 'chat.completion.chunk', created: 1, model: 'compatible',
    choices: [{ index: 0, message: { role: 'assistant', content: 'Gateway reply' }, finish_reason: 'stop' }],
  }]
  await withGateway(events, async (baseURL, requestBodies) => {
    const driver = new DeepSeekChatDriver('compatible', { apiKey: 'test', baseURL })
    const result = await driver.run({ instructions: 'System prompt', items: [{ role: 'user', content: 'Hello' }] })
    assert.equal(result.text, 'Gateway reply')
    assert.deepEqual(result.output, [{ role: 'assistant', content: 'Gateway reply' }])
    assert.equal(result.usage.available, false)
    assert.deepEqual(result.diagnostics?.finishReasons, ['stop'])
    assert.equal(requestBodies[0]?.stream, true)
    assert.ok(Array.isArray(requestBodies[0]?.tools))
  })
})

test('empty compatible stream throws an explicit adapter error with parse diagnostics', async () => {
  const events = [{
    id: 'chatcmpl-empty', object: 'chat.completion.chunk', created: 1, model: 'compatible',
    choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: 'stop' }],
  }]
  await withGateway(events, async (baseURL, requestBodies) => {
    const driver = new DeepSeekChatDriver('compatible', { apiKey: 'test', baseURL })
    await assert.rejects(
      driver.run({ instructions: 'System prompt', items: [{ role: 'user', content: 'Hello' }] }),
      (error: unknown) => {
        assert.ok(error instanceof ModelAdapterError)
        assert.match(error.message, /no assistant content or supported tool calls/)
        assert.equal(error.diagnostics.chunkCount, 1)
        assert.deepEqual(error.diagnostics.finishReasons, ['stop'])
        assert.match(error.diagnostics.chunkShapes[0] ?? '', /deltaKeys/)
        assert.deepEqual(requestBodies.map((body) => body.stream), [true, false])
        return true
      },
    )
  }, {
    id: 'fallback-empty', object: 'chat.completion', created: 1, model: 'compatible',
    choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: '' } }],
  })
})

test('empty stream falls back to a non-streaming compatible response', async () => {
  await withGateway([], async (baseURL, requestBodies) => {
    const deltas: string[] = []
    const result = await new DeepSeekChatDriver('compatible', { apiKey: 'test', baseURL }).run({
      instructions: 'System prompt',
      items: [{ role: 'user', content: 'Hello' }],
      onTextDelta: (delta) => { deltas.push(delta) },
    })
    assert.equal(result.text, 'Recovered reply')
    assert.deepEqual(deltas, ['Recovered reply'])
    assert.deepEqual(result.usage, { inputTokens: 12, outputTokens: 3, available: true })
    assert.deepEqual(requestBodies.map((body) => body.stream), [true, false])
  }, {
    id: 'fallback', object: 'chat.completion', created: 1, model: 'compatible',
    choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: 'Recovered reply' } }],
    usage: { prompt_tokens: 12, completion_tokens: 3, total_tokens: 15 },
  })
})
