import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { test } from 'node:test'
import { OpenNotebookClient, OpenNotebookError } from '../modules/knowledge/provider.js'

// Failure cases: stalled headers/body, swallowed parent cancellation, and a short
// automatic-search budget accidentally applied to explicit searches.
test('knowledge HTTP searches bound headers and body, preserve cancellation and keep the explicit budget', { timeout: 15000 }, async t => {
  const parent = new AbortController(), reason = new Error('fixture parent cancelled')
  const closed = new Set<string>()
  const server = createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk
    const { query } = JSON.parse(raw)
    res.once('close', () => closed.add(query))
    if (query === 'headers') return
    res.writeHead(200, { 'content-type': 'application/json' })
    res.write('{"results":[')
    if (query === 'body') return
    if (query === 'cancel') { parent.abort(reason); return }
    const timer = setTimeout(() => res.end('{"id":"chunk","parent_id":"source","content":"evidence"}]}'), 1250)
    res.once('close', () => clearTimeout(timer))
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address(); assert.ok(address && typeof address !== 'string')
  const client = new OpenNotebookClient({ baseUrl: `http://127.0.0.1:${address.port}`, password: '' })
  const input = { notebookId: 'notebook', sourceIds: ['source'], companyId: 'company' }
  try {
    for (const query of ['headers', 'body']) {
      const began = performance.now()
      await assert.rejects(client.search({ ...input, query, timeoutMs: 1000 }), OpenNotebookError)
      assert.ok(performance.now() - began < 5000, `${query} must not wait for the default 90s budget`)
    }
    await assert.rejects(client.search({ ...input, query: 'cancel', signal: parent.signal }), error => error === reason)
    assert.deepEqual(await client.search({ ...input, query: 'explicit' }), [{ id: 'chunk', parent_id: 'source', content: 'evidence' }])
    assert.ok(closed.has('headers') && closed.has('body'), 'timed-out requests must release their sockets')
    t.diagnostic(JSON.stringify({ headersCancelled: true, bodyCancelled: true, parentReasonPreserved: true, explicitSearchCompleted: true }))
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
})
