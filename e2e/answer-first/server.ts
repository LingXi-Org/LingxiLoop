import type { IncomingMessage, ServerResponse } from 'node:http'
import { AssistantStream, AssistantTransportEncoder, type AssistantStreamChunk } from 'assistant-stream'
import type { Plugin } from 'vite'

type Snapshot = { message: { id: string; metadata: { custom: Record<string, unknown> } } }
type Page = { message: unknown; total: number; nextOffset: number | null }
type Setup = { approval?: Record<string, unknown>; snapshot: Snapshot; pages?: Record<string, Page>; failPages?: number; holdPages?: boolean }

// Synthetic local HTTP service. No proxy, production network, browser routes,
// credentials, private records, or replacement product decoder/store.
export function answerFirstFixture(): Plugin {
  let setup: Setup | undefined
  let pageReads = 0, released = 0, approvalPosts = 0
  const streams = new Set<ReadableStreamDefaultController<AssistantStreamChunk>>()
  const pending: { response: ServerResponse; page: Page }[] = []
  const json = (res: ServerResponse, body: unknown, status = 200) => {
    res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body))
  }
  const body = async (req: IncomingMessage) => {
    let value = ''; for await (const chunk of req) value += chunk
    return JSON.parse(value || '{}')
  }
  const publish = (snapshot: Snapshot) => {
    if (setup) setup.snapshot = snapshot
    for (const stream of streams) stream.enqueue({ type: 'update-state', path: [], operations: [{ type: 'set', path: [], value: snapshot as never }] })
  }
  return { name: 'answer-first-fixture', configureServer(server) {
    server.middlewares.use((req, res, next) => { void (async () => {
      const url = new URL(req.url!, 'http://127.0.0.1')
      if (url.pathname === '/__fixture/reset') {
        setup = await body(req) as Setup; pageReads = 0; released = 0; approvalPosts = 0
        for (const item of pending.splice(0)) json(item.response, { error: 'Fixture reset' }, 409)
        return json(res, { ok: true })
      }
      if (url.pathname === '/__fixture/publish') { publish(await body(req) as Snapshot); return json(res, { ok: true }) }
      if (url.pathname === '/__fixture/seed') return json(res, setup?.snapshot ?? null)
      if (url.pathname === '/__fixture/stats') return json(res, { pageReads, pending: pending.length, released, approvalPosts })
      if (url.pathname === '/__fixture/hold') { if (setup) setup.holdPages = (await body(req)).hold; return json(res, { ok: true }) }
      if (url.pathname === '/__fixture/release') {
        for (const item of pending.splice(0)) { released++; if (!item.response.destroyed) json(item.response, item.page) }
        return json(res, { ok: true })
      }
      if (!url.pathname.startsWith('/api/')) return next()
      if (url.pathname.endsWith('/stream')) {
        const response = AssistantStream.toResponse(new ReadableStream<AssistantStreamChunk>({ start(controller) {
          streams.add(controller)
          if (setup) controller.enqueue({ type: 'update-state', path: [], operations: [{ type: 'set', path: [], value: setup.snapshot as never }] })
          req.on('close', () => streams.delete(controller))
        } }), new AssistantTransportEncoder())
        res.writeHead(200, { 'content-type': response.headers.get('content-type')!, 'cache-control': 'no-cache' }); res.flushHeaders()
        const reader = response.body!.getReader()
        req.on('close', () => { void reader.cancel() })
        try { while (!res.destroyed) { const chunk = await reader.read(); if (chunk.done) break; res.write(chunk.value) } }
        finally { reader.releaseLock(); if (!res.destroyed) res.end() }
        return
      }
      if (url.searchParams.has('activityOffset')) {
        pageReads++
        if (setup?.failPages) { setup.failPages--; return json(res, { error: 'Synthetic retryable history failure' }, 503) }
        const page = setup?.pages?.[url.searchParams.get('activityOffset')!]
        if (!page) return json(res, { error: 'Synthetic page missing' }, 404)
        if (setup?.holdPages) { pending.push({ response: res, page }); return }
        return json(res, page)
      }
      if (url.pathname.includes('/approvals/') && req.method === 'POST') { approvalPosts++; return json(res, { ok: true, approved: true }) }
      if (url.pathname.includes('/approvals/')) return json(res, { id: url.pathname.split('/').at(-1), summary: '批准合成资料导出', status: 'PENDING', action: { action: 'test.export' }, ...setup?.approval })
      if (url.pathname.endsWith('/memory')) {
        const id = url.searchParams.get('ids') === 'memory-process' ? 'memory-process' : 'memory-fixture'
        return json(res, { chips: [{ id, text: id === 'memory-process' ? '过程学习偏好' : '用户请求的记忆摘要', version: 1, change: 'existing' }] })
      }
      if (url.pathname.endsWith('/runs')) return json(res, [])
      if (url.pathname.includes('/runs/')) return json(res, setup?.snapshot ?? {})
      // Ordinary ancillary local UI requests have no private backing service.
      return json(res, { ok: true })
    })().catch(error => { if (!res.headersSent) json(res, { error: String(error) }, 500); else res.end() }) })
  } }
}
