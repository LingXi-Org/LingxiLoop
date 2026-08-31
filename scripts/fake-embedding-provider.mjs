#!/usr/bin/env node
/** A deterministic embeddings-only OpenAI-compatible provider for Compose CI. */
import { createServer } from 'node:http'
import { timingSafeEqual } from 'node:crypto'

const port = Number(process.env.PORT ?? 8126)
const controlToken = process.env.CONTROL_TOKEN?.trim() ?? ''
const stats = {
  embeddingRequests: 0,
  blockedEmbeddingRequests: 0,
  controlRequests: 0,
  chatRequests: 0,
  otherRequests: 0,
}
const state = { blocked: false, waiters: new Set() }

function json(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json' })
  response.end(JSON.stringify(body))
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let data = ''
    request.on('data', (chunk) => { data += chunk })
    request.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}) } catch (error) { reject(error) }
    })
    request.on('error', reject)
  })
}

function authorized(request) {
  if (!controlToken) return false
  const header = request.headers.authorization ?? ''
  const expected = Buffer.from(`Bearer ${controlToken}`)
  const received = Buffer.from(header)
  return received.length === expected.length && timingSafeEqual(received, expected)
}

function controlState() {
  return {
    blocked: state.blocked,
    waitingRequests: state.waiters.size,
    blockedEmbeddingRequests: stats.blockedEmbeddingRequests,
  }
}

function waitUntilUnblocked(request) {
  if (!state.blocked) return Promise.resolve(true)
  return new Promise((resolve) => {
    const finish = (completed) => {
      state.waiters.delete(finish)
      request.off('aborted', abort)
      request.off('close', close)
      resolve(completed)
    }
    const abort = () => finish(false)
    const close = () => {
      if (request.aborted) finish(false)
    }
    state.waiters.add(finish)
    request.once('aborted', abort)
    request.once('close', close)
  })
}

function unblockEmbeddingRequests() {
  state.blocked = false
  for (const finish of [...state.waiters]) finish(true)
}

const server = createServer(async (request, response) => {
  if (request.method === 'GET' && request.url === '/health') {
    json(response, 200, { status: 'ok' })
    return
  }
  if (request.method === 'GET' && request.url === '/stats') {
    json(response, 200, { ...stats, ...controlState() })
    return
  }
  if (request.url === '/control') {
    if (!authorized(request)) {
      json(response, controlToken ? 401 : 404, { error: 'embedding control is unavailable' })
      return
    }
    stats.controlRequests += 1
    if (request.method === 'GET') {
      json(response, 200, controlState())
      return
    }
    if (request.method !== 'POST') {
      json(response, 405, { error: 'control accepts only GET and POST' })
      return
    }
    let body
    try {
      body = await readJson(request)
    } catch (error) {
      json(response, 400, { error: `invalid JSON: ${String(error)}` })
      return
    }
    if (typeof body.blocked !== 'boolean' || Object.keys(body).some((key) => key !== 'blocked')) {
      json(response, 400, { error: 'control requires exactly one boolean blocked field' })
      return
    }
    if (body.blocked) state.blocked = true
    else unblockEmbeddingRequests()
    json(response, 200, controlState())
    return
  }
  if (request.method !== 'POST' || request.url !== '/v1/embeddings') {
    if (request.url === '/v1/chat/completions') stats.chatRequests += 1
    else stats.otherRequests += 1
    json(response, 404, { error: { message: 'only /v1/embeddings is available', type: 'invalid_request_error' } })
    return
  }

  let body
  try {
    body = await readJson(request)
  } catch (error) {
    json(response, 400, { error: { message: `invalid JSON: ${String(error)}`, type: 'invalid_request_error' } })
    return
  }

  stats.embeddingRequests += 1
  if (state.blocked) {
    stats.blockedEmbeddingRequests += 1
    if (!await waitUntilUnblocked(request)) return
  }
  const inputs = Array.isArray(body.input) ? body.input : [body.input]
  const vector = Array(1536).fill(0.001)
  const encoded = Buffer.alloc(vector.length * Float32Array.BYTES_PER_ELEMENT)
  vector.forEach((value, index) => {
    encoded.writeFloatLE(value, index * Float32Array.BYTES_PER_ELEMENT)
  })
  const embedding = body.encoding_format === 'base64' ? encoded.toString('base64') : vector
  json(response, 200, {
    object: 'list',
    model: body.model ?? 'text-embedding-3-small',
    data: inputs.map((_, index) => ({ object: 'embedding', index, embedding })),
    usage: { prompt_tokens: Math.max(1, inputs.length), total_tokens: Math.max(1, inputs.length) },
  })
})

server.listen(port, () => console.log(`[fake-embedding-provider] listening on :${port}`))
