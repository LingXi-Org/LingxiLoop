import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import test from 'node:test'
import { DeepSeekChatDriver, ModelCompatibilityError } from '../agent-os/model-driver.js'

async function withGateway(responseBody: unknown, run: (baseURL: string) => Promise<void>): Promise<void> {
  const streamFlags: unknown[] = []
  const server = createServer((request, response) => {
    let body = ''
    request.setEncoding('utf8')
    request.on('data', (chunk) => { body += chunk })
    request.on('end', () => {
      const payload = JSON.parse(body) as Record<string, unknown>
      streamFlags.push(payload.stream)
      if (payload.stream === true) {
        response.writeHead(200, { 'content-type': 'text/event-stream' })
        response.end('data: {"id":"empty","object":"chat.completion.chunk","choices":[]}\n\ndata: [DONE]\n\n')
        return
      }
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify(responseBody))
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    const address = server.address()
    assert(address && typeof address !== 'string')
    await run(`http://127.0.0.1:${address.port}/v1`)
    assert.deepEqual(streamFlags, [true, false])
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
}

test('falls back to non-streaming when a compatible gateway stream parses as empty', async () => {
  await withGateway({
    id: 'fallback', object: 'chat.completion', created: 1, model: 'test',
    choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: 'Recovered reply' } }],
    usage: { prompt_tokens: 12, completion_tokens: 3, total_tokens: 15 },
  }, async (baseURL) => {
    const deltas: string[] = []
    const result = await new DeepSeekChatDriver('test', { apiKey: 'test', baseURL }).run({
      instructions: 'help', items: [{ role: 'user', content: 'hello' }], onTextDelta: (delta) => { deltas.push(delta) },
    })
    assert.equal(result.text, 'Recovered reply')
    assert.deepEqual(deltas, ['Recovered reply'])
    assert.deepEqual(result.usage, { inputTokens: 12, outputTokens: 3, available: true })
  })
})

test('reports a compatibility error when stream and fallback are both empty', async () => {
  await withGateway({
    id: 'fallback', object: 'chat.completion', created: 1, model: 'test',
    choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: '' } }],
  }, async (baseURL) => {
    const driver = new DeepSeekChatDriver('test', { apiKey: 'test', baseURL })
    await assert.rejects(
      driver.run({ instructions: 'help', items: [{ role: 'user', content: 'hello' }] }),
      (error: unknown) => error instanceof ModelCompatibilityError && /no assistant content or tool calls/.test(error.message),
    )
  })
})
