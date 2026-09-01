import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer, type Server } from 'node:http'
import test from 'node:test'

function listen(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string')
        return reject(new Error('test server has no TCP address'))
      resolve(address.port)
    })
  })
}

function close(server: Server): Promise<void> {
  server.closeAllConnections()
  return new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  )
}

async function waitFor(check: () => boolean): Promise<void> {
  const deadline = Date.now() + 3_000
  while (!check()) {
    if (Date.now() >= deadline) throw new Error('timed out waiting for OTLP spans')
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}

test('OpenLIT instruments a preloaded OpenAI module without exporting message content', async (t) => {
  const otlpBodies: Buffer[] = []
  const collector = createServer((request, response) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => chunks.push(chunk))
    request.on('end', () => {
      otlpBodies.push(Buffer.concat(chunks))
      response.writeHead(200).end()
    })
  })
  const collectorPort = await listen(collector)
  t.after(() => close(collector))

  let providerAttempts = 0
  const provider = createServer((request, response) => {
    if (request.method !== 'POST') {
      response.writeHead(404).end()
      return
    }
    providerAttempts += 1
    if (request.url === '/fail/v1/chat/completions') {
      response.writeHead(500, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ error: { message: 'provider failed', type: 'server_error' } }))
      return
    }
    if (request.url === '/v1/chat/completions' && providerAttempts === 1) {
      response.writeHead(429, { 'content-type': 'application/json', 'retry-after': '0' })
      response.end(JSON.stringify({ error: { message: 'rate limited', type: 'rate_limit_error' } }))
      return
    }
    if (request.url === '/v1/chat/completions' && providerAttempts === 3) {
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      response.end(
        [
          `data: ${JSON.stringify({ id: 'chatcmpl-stream', object: 'chat.completion.chunk', created: 1, model: 'observability-test-model', choices: [{ index: 0, delta: { role: 'assistant', content: 'streamed' }, finish_reason: null }] })}\n\n`,
          `data: ${JSON.stringify({ id: 'chatcmpl-stream', object: 'chat.completion.chunk', created: 1, model: 'observability-test-model', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 } })}\n\n`,
          'data: [DONE]\n\n',
        ].join(''),
      )
      return
    }
    response.writeHead(200, { 'content-type': 'application/json' })
    if (request.url === '/v1/chat/completions') {
      response.end(
        JSON.stringify({
          id: 'chatcmpl-observability-test',
          object: 'chat.completion',
          created: 1,
          model: 'observability-test-model',
          choices: [
            { index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' },
          ],
          usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
        }),
      )
      return
    }
    if (request.url === '/v1/embeddings') {
      response.end(
        JSON.stringify({
          object: 'list',
          data: [{ object: 'embedding', index: 0, embedding: [0.1, 0.2] }],
          model: 'observability-embedding-model',
          usage: { prompt_tokens: 1, total_tokens: 1 },
        }),
      )
      return
    }
    if (request.url === '/v1/images/generations') {
      response.end(
        JSON.stringify({ created: 1, data: [{ url: 'https://assets.test.invalid/image.png' }] }),
      )
      return
    }
    response.end(JSON.stringify({ error: { message: 'not found' } }))
  })
  const providerPort = await listen(provider)
  t.after(() => close(provider))

  process.env.OTEL_EXPORTER_OTLP_ENDPOINT = `http://127.0.0.1:${collectorPort}`
  process.env.OTEL_SERVICE_NAME = 'lingxiloop-observability-test'
  process.env.OTEL_DEPLOYMENT_ENVIRONMENT = 'test'
  process.env.OPENLIT_DISABLE_BATCH = 'true'
  process.env.OPENLIT_DISABLE_METRICS = 'true'
  process.env.OPENLIT_DISABLE_EVENTS = 'true'
  process.env.OPENLIT_PRICING_JSON = JSON.stringify({
    chat: { 'observability-test-model': { promptPrice: 0.001, completionPrice: 0.002 } },
    embeddings: { 'observability-embedding-model': 0.001 },
    images: { 'observability-image-model': { standard: { '1024x1024': 0.01 } } },
    limits: {
      [`127.0.0.1:${providerPort}`]: {
        'observability-test-model': { tpm: 100_000, rpm: 1_000 },
        'observability-embedding-model': { tpm: 50_000, rpm: 500 },
        'observability-image-model': { tpm: 10_000, rpm: 100 },
      },
    },
  })

  await import('openai')
  const { createOpenAIClient } = await import('../llm-client.js')
  const client = createOpenAIClient({
    apiKey: 'test-key',
    baseURL: `http://127.0.0.1:${providerPort}/v1`,
    maxRetries: 1,
  })
  const pendingResult = client.chat.completions.create({
    model: 'observability-test-model',
    messages: [{ role: 'user', content: 'TOP-SECRET-OBSERVABILITY-CONTENT' }],
  })
  assert.equal(typeof pendingResult.withResponse, 'function')
  const result = await pendingResult

  assert.equal(result.choices[0]?.message.content, 'ok')
  const stream = await client.chat.completions.create({
    model: 'observability-test-model',
    messages: [{ role: 'user', content: 'TOP-SECRET-STREAM-CONTENT' }],
    stream: true,
    stream_options: { include_usage: true },
  })
  let streamedText = ''
  for await (const chunk of stream) streamedText += chunk.choices[0]?.delta.content ?? ''
  const embedding = await client.embeddings.create({
    model: 'observability-embedding-model',
    input: 'TOP-SECRET-EMBEDDING-CONTENT',
    encoding_format: 'float',
  })
  const image = await client.images.generate({
    model: 'observability-image-model',
    prompt: 'TOP-SECRET-IMAGE-CONTENT',
  })
  const failingClient = createOpenAIClient({
    apiKey: 'test-key',
    baseURL: `http://127.0.0.1:${providerPort}/fail/v1`,
    maxRetries: 0,
  })
  await assert.rejects(
    failingClient.chat.completions.create({
      model: 'observability-test-model',
      messages: [{ role: 'user', content: 'TOP-SECRET-FAILED-CONTENT' }],
    }),
    /provider failed/,
  )

  assert.equal(streamedText, 'streamed')
  assert.deepEqual(embedding.data[0]?.embedding, [0.1, 0.2])
  assert.equal(image.data?.[0]?.url, 'https://assets.test.invalid/image.png')
  assert.equal(providerAttempts, 6)
  await waitFor(
    () =>
      Buffer.concat(otlpBodies).toString('utf8').split('lingxiloop.openai.http_attempt').length -
        1 >=
      6,
  )

  const telemetry = Buffer.concat(otlpBodies).toString('utf8')
  assert.equal(telemetry.split('lingxiloop.openai.http_attempt').length - 1, 6)
  assert.ok(telemetry.split('gen_ai.usage.input_tokens').length - 1 >= 3)
  assert.match(telemetry, /rate_limited/)
  assert.match(telemetry, /http_500/)
  assert.match(telemetry, /gen_ai\.usage\.cost/)
  assert.match(telemetry, /lingxiloop\.limit\.tpm/)
  assert.match(telemetry, /lingxiloop\.limit\.rpm/)
  assert.doesNotMatch(telemetry, /TOP-SECRET-OBSERVABILITY-CONTENT/)
  assert.doesNotMatch(telemetry, /TOP-SECRET-(STREAM|EMBEDDING|IMAGE|FAILED)-CONTENT/)
  assert.doesNotMatch(telemetry, /gen_ai\.tool\.(definitions|args)/)
})

test('model calls fail open when pricing and OTLP are unavailable', async (t) => {
  const provider = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(
      JSON.stringify({
        id: 'chatcmpl-fail-open',
        object: 'chat.completion',
        created: 1,
        model: 'unpriced-model',
        choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
    )
  })
  const providerPort = await listen(provider)
  t.after(() => close(provider))

  const script = `
    const { createOpenAIClient } = await import('./server/src/llm-client.ts')
    const client = createOpenAIClient({ apiKey: 'test-key', baseURL: 'http://127.0.0.1:${providerPort}/v1', maxRetries: 0 })
    const result = await client.chat.completions.create({ model: 'unpriced-model', messages: [{ role: 'user', content: 'private' }] })
    if (result.choices[0]?.message.content !== 'ok') process.exit(1)
    process.exit(0)
  `
  const child = spawn(
    process.execPath,
    ['--import', 'tsx', '--input-type=module', '--eval', script],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        OPENLIT_DISABLE_BATCH: 'true',
        OPENLIT_DISABLE_EVENTS: 'true',
        OPENLIT_DISABLE_METRICS: 'true',
        OPENLIT_PRICING_JSON: 'http://127.0.0.1:1/pricing.json',
        OTEL_EXPORTER_OTLP_ENDPOINT: 'http://127.0.0.1:1',
      },
      stdio: ['ignore', 'ignore', 'pipe'],
    },
  )
  let stderr = ''
  child.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk.toString()
  })
  const exitCode = await new Promise<number | null>((resolve) => child.once('exit', resolve))
  assert.equal(exitCode, 0, stderr)
})
