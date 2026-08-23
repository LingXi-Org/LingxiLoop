#!/usr/bin/env node
/** Deterministic DeepSeek Chat Completions-compatible provider for CI. */
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'

const PORT = Number(process.env.PORT ?? 8125)
const REPLY = 'Use a ten-minute recall check: close the notes, write what you remember, then correct only the gaps.'

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk) => { data += chunk })
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}) } catch (error) { reject(error) } })
    req.on('error', reject)
  })
}

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

function response(body) {
  return {
    id: `chatcmpl_${randomUUID()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: body.model ?? 'deepseek-chat',
    choices: [{ index: 0, message: { role: 'assistant', content: REPLY }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 20, completion_tokens: 18, total_tokens: 38 },
  }
}

const server = createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') { json(res, 200, { status: 'ok' }); return }
  if (req.method !== 'POST' || req.url !== '/v1/chat/completions') {
    json(res, 404, { error: { message: `unsupported endpoint ${req.url}`, type: 'invalid_request_error' } }); return
  }
  let body
  try { body = await readJson(req) } catch (error) {
    json(res, 400, { error: { message: `invalid JSON: ${String(error)}`, type: 'invalid_request_error' } }); return
  }
  const final = response(body)
  if (body.stream !== true) { json(res, 200, final); return }

  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  })
  for (let offset = 0; offset < REPLY.length; offset += 16) {
    res.write(`data: ${JSON.stringify({
      id: final.id,
      object: 'chat.completion.chunk',
      created: final.created,
      model: final.model,
      choices: [{ index: 0, delta: { content: REPLY.slice(offset, offset + 16) }, finish_reason: null }],
    })}\n\n`)
  }
  res.write(`data: ${JSON.stringify({
    id: final.id,
    object: 'chat.completion.chunk',
    created: final.created,
    model: final.model,
    choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
  })}\n\n`)
  res.write(`data: ${JSON.stringify({
    id: final.id,
    object: 'chat.completion.chunk',
    created: final.created,
    model: final.model,
    choices: [],
    usage: final.usage,
  })}\n\n`)
  res.write('data: [DONE]\n\n')
  res.end()
})

server.listen(PORT, () => console.log(`[fake-deepseek-provider] listening on :${PORT}`))
