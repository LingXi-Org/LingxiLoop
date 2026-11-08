import assert from 'node:assert/strict'
import { after, mock, test } from 'node:test'
import { once } from 'node:events'
import express from 'express'

const scopes: Array<{ id: string; write: boolean }> = [], calls: Array<{ name: string; input: unknown }> = []
let denied = false
await mock.module('../../db/pool.js', { namedExports: { pool: { query: async () => ({ rows: [{ name: '测试用户' }] }) } } })
await mock.module('../../http/authorization.js', { namedExports: { requireArtifact: async (_req: unknown, id: string, write = false) => { scopes.push({ id, write }); if (denied) throw Object.assign(new Error('forbidden'), { status: 403 }); return { userId: 'user', companyId: 'tenant', kind: 'slides', conversationId: 'conversation' } } } })
await mock.module('../../http/errors.js', { namedExports: { HttpError: class extends Error { constructor(public status: number, message: string) { super(message) } } } })
const names = ['createComment','listComments','replyComment','editComment','deleteComment','setCommentStatus','sendComment']
await mock.module('./facade.js', { namedExports: Object.fromEntries(names.map(name => [name, async (...args: unknown[]) => { const input = args.length === 1 ? args[0] : args; calls.push({ name, input }); return name === 'listComments' ? { doc: { threads: [] } } : { id: 'thread' } }])) })
await mock.module('./repository.js', { namedExports: { availableAgents: async () => [{ id: 'agent' }] } })
await mock.module('./slides-workspace.js', { namedExports: { slideWorkspaceConversation: async () => 'conversation' } })
const { nativeCommentsRouter } = await import('./native-comments-router.js')
const app = express(); app.use(express.json()); app.use('/api', nativeCommentsRouter)
app.use((error: { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => { res.status(error.status ?? 500).json({ error: 'request rejected' }) })
const server = app.listen(0, '127.0.0.1'); await once(server, 'listening')
const address = server.address(); assert.ok(address && typeof address !== 'string')
const base = `http://127.0.0.1:${address.port}/api/artifacts/document/comments`
after(() => { server.close(); mock.restoreAll() })

test('same-origin comments authorize every request and derive tenant/author on the server', async () => {
  const response = await fetch(base)
  assert.equal(response.status, 200)
  assert.deepEqual(scopes.at(-1), { id: 'document', write: false })
  assert.deepEqual(await response.json(), { threads: [], me: { kind: 'user', id: 'user', name: '测试用户' }, agent: { available: true } })
  const created = await fetch(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ anchor: 'test', label: '位置', text: '评论', send: true, companyId: 'attacker', author: { id: 'attacker' } }) })
  assert.equal(created.status, 201)
  assert.deepEqual(scopes.at(-1), { id: 'document', write: true })
  const input = calls.at(-1)!.input as { companyId: string; author: { id: string }; thread: { send: boolean } }
  assert.equal(input.companyId, 'tenant'); assert.equal(input.author.id, 'user'); assert.equal(input.thread.send, true)
})
test('reply, edit, resolve, delete and Agent send reuse the owning service', async () => {
  for (const [path, method, body, name] of [
    ['/thread/messages','POST',{text:'回复'},'replyComment'], ['/thread/messages/message','PATCH',{text:'修改'},'editComment'],
    ['/thread','PATCH',{status:'resolved'},'setCommentStatus'], ['/thread/send','POST',{},'sendComment'], ['/thread','DELETE',undefined,'deleteComment'],
  ] as const) {
    const response = await fetch(base+path,{method,headers:{'content-type':'application/json'},...(body ? {body:JSON.stringify(body)} : {})})
    assert.equal(response.status,200,path); assert.equal(calls.at(-1)!.name,name); assert.equal(scopes.at(-1)!.write,true)
  }
})
test('invalid bodies and denied access cannot reach a comment mutation', async () => {
  let count=calls.length
  const invalid=await fetch(base,{method:'POST',headers:{'content-type':'application/json'},body:'{}'})
  assert.equal(invalid.status,400);assert.equal(calls.length,count)
  denied=true;count=calls.length
  for(const method of ['GET','POST','PATCH','DELETE']) { const response=await fetch(base+'/thread',{method});assert.equal(response.status,403) }
  denied=false;assert.equal(calls.length,count)
})
