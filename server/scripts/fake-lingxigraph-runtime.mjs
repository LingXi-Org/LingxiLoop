#!/usr/bin/env node
// Deterministic stand-in for the real LingxiGraph Runtime (server/lingxigraph),
// used ONLY by the CI/service-level Compose smoke (docker-compose.mvp.ci.yml).
//
// It speaks the exact same `/v1/turn` HTTP contract LingxiLoop's Node adapter
// expects (server/src/agents/lingxigraph-adapter.ts: request has
// `{version, runId, agent, trigger, systemPrompt, contextPrompt}`, response
// must be `{version: 1, status, reason, actions, modelCalls}`), but never
// calls a real model — it regexes the conversation id LingxiLoop embeds at
// the top of each conversation block in `contextPrompt` (see
// `renderContext()` in server/src/agents/turn.ts: `# <conversationId>  [kind]
// "title"`) and replies with one deterministic `message.send` action back
// into that conversation. Zero dependencies so it runs as a bare `node:20`
// container with nothing installed.
import { createServer } from 'node:http'

const PORT = Number(process.env.PORT || 8124)
const TOKEN = (process.env.LINGXIGRAPH_TOKEN || '').trim()

const REPLY_BODY = 'Hello from the fake LingxiGraph runtime (deterministic MVP smoke — no real model was called).'

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk) => { data += chunk })
    req.on('end', () => {
      if (!data) { resolve({}); return }
      try { resolve(JSON.parse(data)) } catch (e) { reject(e) }
    })
    req.on('error', reject)
  })
}

const server = createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok' }))
    return
  }

  if (req.method === 'POST' && req.url === '/v1/turn') {
    if (TOKEN) {
      const auth = req.headers.authorization || ''
      if (auth !== `Bearer ${TOKEN}`) {
        res.writeHead(401, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'unauthorized' }))
        return
      }
    }

    let body
    try {
      body = await readJson(req)
    } catch (e) {
      res.writeHead(400, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: `invalid JSON body: ${String(e)}` }))
      return
    }

    if (body.version !== 1 || !body.agent || !body.systemPrompt || !body.contextPrompt) {
      res.writeHead(400, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: 'missing required LingxiGraphRunRequest fields' }))
      return
    }

    // Simulate a forced failure for the "LingxiGraph returns invalid
    // response" fault-scenario check: a special marker in contextPrompt
    // (planted by the smoke script) makes this reply with a schema-invalid
    // body instead of a real one.
    if (String(body.contextPrompt).includes('__SMOKE_FORCE_INVALID_RESPONSE__')) {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ version: 1, status: 'not-a-real-status', reason: 'forced invalid', actions: 'not-an-array' }))
      return
    }

    const match = /^# (\S+)\s/m.exec(String(body.contextPrompt))
    const conversationId = match ? match[1] : null

    const result = {
      version: 1,
      status: 'done',
      reason: conversationId
        ? `fake smoke reply into ${conversationId}`
        : 'no unread conversation found in contextPrompt; nothing to reply to',
      actions: conversationId
        ? [{ type: 'message.send', conversationId, body: REPLY_BODY }]
        : [],
      modelCalls: [{ model: body.agent.model || 'fake', usage: null }],
    }
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify(result))
    return
  }

  res.writeHead(404, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ error: 'not found' }))
})

server.listen(PORT, () => {
  console.log(`[fake-lingxigraph-runtime] listening on :${PORT}`)
})
