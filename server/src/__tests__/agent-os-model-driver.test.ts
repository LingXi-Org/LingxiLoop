import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { test } from 'node:test'
import { DeepSeekChatDriver, ModelAdapterError } from '../agent-os/model-driver.js'

async function withGateway(
  events: unknown[],
  run: (baseURL: string, requestBody: Record<string, unknown>) => Promise<void>,
): Promise<void> {
  const requestBody: Record<string, unknown> = {}
  const server = createServer((request, response) => {
    const body: Buffer[] = []
    request.on('data', (chunk: Buffer) => body.push(chunk))
    request.on('end', () => {
      Object.assign(requestBody, JSON.parse(Buffer.concat(body).toString()) as Record<string, unknown>)
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      for (const event of events) response.write(`data: ${JSON.stringify(event)}\n\n`)
      response.end('data: [DONE]\n\n')
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    const address = server.address()
    assert.ok(address && typeof address === 'object')
    await run(`http://127.0.0.1:${address.port}/v1`, requestBody)
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
}

test('OpenAI-compatible stream parses complete message envelopes and marks missing usage', async () => {
  const events = [{
    id: 'chatcmpl-compatible', object: 'chat.completion.chunk', created: 1, model: 'compatible',
    choices: [{ index: 0, message: { role: 'assistant', content: 'Gateway reply' }, finish_reason: 'stop' }],
  }]
  await withGateway(events, async (baseURL, requestBody) => {
    const driver = new DeepSeekChatDriver('compatible', { apiKey: 'test', baseURL })
    const result = await driver.run({ instructions: 'System prompt', items: [{ role: 'user', content: 'Hello' }] })
    assert.equal(result.text, 'Gateway reply')
    assert.deepEqual(result.output, [{ role: 'assistant', content: 'Gateway reply' }])
    assert.equal(result.usage.available, false)
    assert.deepEqual(result.diagnostics?.finishReasons, ['stop'])
    assert.equal(requestBody.stream, true)
    assert.ok(Array.isArray(requestBody.tools))
  })
})

test('empty compatible stream throws an explicit adapter error with parse diagnostics', async () => {
  const events = [{
    id: 'chatcmpl-empty', object: 'chat.completion.chunk', created: 1, model: 'compatible',
    choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: 'stop' }],
  }]
  await withGateway(events, async (baseURL) => {
    const driver = new DeepSeekChatDriver('compatible', { apiKey: 'test', baseURL })
    await assert.rejects(
      driver.run({ instructions: 'System prompt', items: [{ role: 'user', content: 'Hello' }] }),
      (error: unknown) => {
        assert.ok(error instanceof ModelAdapterError)
        assert.match(error.message, /no assistant content or supported tool calls/)
        assert.equal(error.diagnostics.chunkCount, 1)
        assert.deepEqual(error.diagnostics.finishReasons, ['stop'])
        assert.match(error.diagnostics.chunkShapes[0] ?? '', /deltaKeys/)
        return true
      },
    )
  })
})
