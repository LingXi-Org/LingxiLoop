#!/usr/bin/env node
/**
 * Deterministic, zero-cost OpenAI-compatible provider for the Compose E2E.
 *
 * Unlike fake-lingxigraph-runtime.mjs, this sits behind the REAL Python
 * LingxiGraph Runtime. It implements the two provider surfaces used by the
 * MVP stack: Chat Completions for LingxiGraph structured output and Responses
 * for LingxiLoop's small-brain Agent→Agent inbox triage.
 */
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'

const PORT = Number(process.env.PORT || 8125)
const REPLY_BODY = 'Hello from the real Python LingxiGraph runtime via the deterministic fake provider.'

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk) => { data += chunk })
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}) } catch (error) { reject(error) }
    })
    req.on('error', reject)
  })
}

function textFrom(value) {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(textFrom).join('\n')
  if (value && typeof value === 'object') return Object.values(value).map(textFrom).join('\n')
  return ''
}

function conversationIdFrom(value) {
  const match = /^# (\S+)\s/m.exec(textFrom(value))
  return match?.[1] ?? null
}

function userContext(messages) {
  if (!Array.isArray(messages)) return ''
  return textFrom(messages.filter((message) => message?.role === 'user'))
}

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

const server = createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    json(res, 200, { status: 'ok' })
    return
  }
  if (req.method !== 'POST') {
    json(res, 404, { error: { message: 'not found', type: 'invalid_request_error' } })
    return
  }

  let body
  try { body = await readJson(req) } catch (error) {
    json(res, 400, { error: { message: `invalid JSON: ${String(error)}`, type: 'invalid_request_error' } })
    return
  }

  if (req.url === '/v1/responses') {
    const isReplyCascade = JSON.stringify(body).includes(REPLY_BODY)
    const outputText = JSON.stringify({
      actionable: !isReplyCascade,
      reason: isReplyCascade
        ? 'deterministic Compose E2E: peer already supplied the requested reply'
        : 'deterministic Compose E2E: direct peer message is actionable',
      promptNote: isReplyCascade ? '' : 'Reply once to the peer message.',
    })
    json(res, 200, {
      id: `resp_${randomUUID()}`,
      object: 'response',
      created_at: Math.floor(Date.now() / 1000),
      status: 'completed',
      model: body.model || 'fake-support',
      output: [{
        id: `msg_${randomUUID()}`,
        type: 'message',
        status: 'completed',
        role: 'assistant',
        content: [{ type: 'output_text', text: outputText, annotations: [] }],
      }],
      usage: { input_tokens: 10, input_tokens_details: { cached_tokens: 0 }, output_tokens: 8, output_tokens_details: { reasoning_tokens: 0 }, total_tokens: 18 },
    })
    return
  }

  if (req.url === '/v1/chat/completions') {
    const context = userContext(body.messages)
    const forceInvalid = context.includes('__SMOKE_FORCE_INVALID_RESPONSE__')
    const alreadyAnswered = context.includes(REPLY_BODY)
    const conversationId = conversationIdFrom(body.messages)
    const structured = forceInvalid ? {
      status: 'not-a-real-status', reason: 'forced invalid provider output', actions: 'not-an-array',
    } : {
      status: 'done',
      reason: alreadyAnswered
        ? 'deterministic anti-cascade: the peer already supplied the requested reply'
        : conversationId ? `deterministic reply into ${conversationId}` : 'no unread conversation',
      actions: conversationId && !alreadyAnswered ? [{ type: 'message.send', conversationId, body: REPLY_BODY }] : [],
    }
    json(res, 200, {
      id: `chatcmpl-${randomUUID()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: body.model || 'fake-chat',
      choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify(structured) }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 20, completion_tokens: 12, total_tokens: 32 },
    })
    return
  }

  json(res, 404, { error: { message: `unsupported endpoint ${req.url}`, type: 'invalid_request_error' } })
})

server.listen(PORT, () => console.log(`[fake-openai-provider] listening on :${PORT}`))
