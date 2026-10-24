import assert from 'node:assert/strict'
import { mock, test } from 'node:test'

test('a current session rejection stops automatic recovery but a stale rejection cannot clear a new sign-in', async () => {
  let user: {id:string}|null={id:'a'}
  let company='company'
  const clears:unknown[]=[]
  let respond!:(response:Response)=>void
  mock.module('@/lib/workspaceSession',{namedExports:{getWorkspaceSession:()=>null}})
  mock.module('@/stores/auth',{namedExports:{getActiveCompanyId:()=>company,
    useAuth:{getState:()=>({user,clear:(reason:unknown)=>{clears.push(reason)}})}}})
  mock.module('@/api/transport',{namedExports:{mergeRequestHeaders:(headers:unknown)=>headers,
    lingxiApiFetch:()=>new Promise<Response>(resolve=>{respond=resolve})}})
  const {http}=await import('./http')
  const current=http('/conversations/room/typing')
  respond(new Response('{}',{status:401}))
  await assert.rejects(current)
  assert.deepEqual(clears,['session-rejected'])
  for(const nextUser of [{id:'b'},{id:'a'}]) {
    user={id:'a'}
    const stale=http('/conversations/room/typing')
    user=nextUser
    respond(new Response('{}',{status:401}))
    await assert.rejects(stale)
    assert.equal(clears.length,1,'A response from an earlier auth object must not clear a newer sign-in')
  }
  const controller = new AbortController()
  const cancelled = http('/session', { signal: controller.signal })
  controller.abort()
  respond(new Response('{}', { status: 401 }))
  await assert.rejects(cancelled)
  assert.equal(clears.length, 1, 'cancelled session checks cannot log out the current identity')
  const forbidden = http('/courses/synthetic', { method: 'PATCH' })
  respond(new Response('{}', { status: 403 }))
  await assert.rejects(forbidden)
  assert.equal(clears.length, 1, 'ordinary permission denial is not global logout')
  const productSession = http('/session', undefined, { sessionRejection: 'caller' })
  respond(new Response('{}', { status: 401 }))
  await assert.rejects(productSession)
  assert.equal(clears.length, 1, 'product-session verification owns its failure instead of recursively requesting itself')
  const ordinarySession = http('/session')
  respond(new Response('{}', { status: 401 }))
  await assert.rejects(ordinarySession)
  assert.equal(clears.length, 2, 'invitation/fallback session reads retain ordinary authentication rejection')
  const oldCompany=http('/conversations/room/typing')
  company='other'
  respond(new Response('{}',{status:401}))
  await assert.rejects(oldCompany)
  assert.equal(clears.length,2)
})
