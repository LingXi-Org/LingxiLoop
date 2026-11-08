import assert from 'node:assert/strict'
import test, { mock } from 'node:test'

let userId = 'user', companyId = 'company', projectId = 'project', conversationId = 'room'
let resolve!: (value: { id: string; title: string }) => void
let reject!: (reason: Error) => void
let surface: { kind: 'design'; artifactId: string; title: string } | null = null
const opened: string[] = []
mock.module('@/stores/auth', { namedExports: { useAuth: { getState: () => ({ user: { id: userId }, activeCompanyId: companyId }) } } })
mock.module('@/stores/app', { namedExports: { useApp: { getState: () => ({ selectedConversationId: conversationId }) } } })
mock.module('@/features/knowledge/workspace', { namedExports: { useWorkspace: { getState: () => ({ selectedId: projectId }) } } })
mock.module('@/stores/surface', { namedExports: { useSurface: { getState: () => ({
  surface,
  openDesign: (artifactId: string, title: string) => { opened.push(artifactId); surface = { kind: 'design', artifactId, title } },
  closeDesign: () => { surface = null },
}) } } })
let existing: { id: string;title?:string } | null = null
let deferRead=false,resolveRead!:(value:{id:string;title:string}|null)=>void
mock.module('@/features/artifacts/api', { namedExports: { artifactsApi: {
  ensureConversationDesign: () => new Promise<{ id: string; title: string }>((done, fail) => { resolve = done; reject = fail }),
  getConversationDesign: async () => { return deferRead?new Promise(done=>{resolveRead=done}):existing },
} } })
let warmed = 0
mock.module('@/features/artifacts/editor-preload', { namedExports: { prefetchEditor: () => { warmed++ } } })
const { openConversationDesign, restoreLinkedConversationDesign } = await import('./open-design')
const { PENDING_DESIGN_ID } = await import('./pending')
const reset = () => { userId = 'user'; companyId = 'company'; projectId = 'project'; conversationId = 'room'; surface = null; opened.length = 0; warmed = 0 }

test('late Canvas requests cannot open a private board after scope changes', async () => {
  for (const change of [() => { userId = 'other-user' }, () => { companyId = 'other-company' }, () => { projectId = 'other-project' }, () => { conversationId = 'other-room' }]) {
    reset()
    const pending = openConversationDesign('room')
    change()
    resolve({ id: 'private-board', title: '私有画板' })
    await pending
    assert.deepEqual(opened, [PENDING_DESIGN_ID])
    assert.equal(surface, null)
    assert.equal(warmed, 0, '跨作用域响应不能触发编辑器打开')
  }
})

test('the canvas expands on the click, then shows the ensured board once', async () => {
  reset()
  const pending = openConversationDesign('room')
  assert.deepEqual(surface, { kind: 'design', artifactId: PENDING_DESIGN_ID, title: '设计' })
  resolve({ id: 'current-board', title: '当前画板' })
  await pending
  assert.deepEqual(opened, [PENDING_DESIGN_ID, 'current-board'])
  assert.deepEqual(surface, { kind: 'design', artifactId: 'current-board', title: '当前画板' })
  assert.equal(warmed, 1, '在显示稿件前预热共享原生模块')
})

test('closing the placeholder or a failed ensure leaves the canvas closed', async () => {
  reset()
  const closed = openConversationDesign('room')
  surface = null
  resolve({ id: 'late-board', title: '迟到的画板' })
  await closed
  assert.equal(surface, null)

  reset()
  const failed = openConversationDesign('room')
  reject(new Error('offline'))
  await assert.rejects(failed, /offline/)
  assert.equal(surface, null)
})

test('an old scope response cannot close a newer canvas placeholder', async () => {
  for (const fails of [false, true]) {
    reset()
    const old = openConversationDesign('room')
    const oldResolve = resolve, oldReject = reject
    conversationId = 'next-room'
    surface = null
    const current = openConversationDesign('next-room')
    const currentResolve = resolve
    if (fails) { oldReject(new Error('old offline')); await assert.rejects(old) }
    else { oldResolve({ id: 'old-board', title: '旧画板' }); await old }
    assert.deepEqual(surface, { kind: 'design', artifactId: PENDING_DESIGN_ID, title: '设计' })
    currentResolve({ id: 'new-board', title: '新画板' })
    await current
    assert.deepEqual(surface, { kind: 'design', artifactId: 'new-board', title: '新画板' })
  }
})

 test('private linked pages only open the existing matching conversation design without creation',async()=>{
  reset();existing={id:'linked',title:'链接中的设计'}
  await restoreLinkedConversationDesign('room','linked',new AbortController().signal)
  assert.deepEqual(opened,['linked']);assert.equal(warmed,1)
  reset();existing=null
  await assert.rejects(restoreLinkedConversationDesign('room','linked',new AbortController().signal),/不存在或无权访问/)
  assert.deepEqual(opened,[])
  reset();existing={id:'another-board',title:'另一个设计'}
  await assert.rejects(restoreLinkedConversationDesign('room','linked',new AbortController().signal),/不存在或无权访问/)
  assert.equal(warmed,0)
})
 test('pending private links cannot reopen a closed surface or cross an account/workspace/conversation change',async()=>{
  deferRead=true
  try{for(const change of [()=>{companyId='other'},()=>{projectId='other'},()=>{conversationId='other'},()=>{userId='other'},()=>{surface={kind:'design',artifactId:'another',title:'其他设计'}}]){
    reset();const controller=new AbortController(),pending=restoreLinkedConversationDesign('room','linked',controller.signal)
    change();resolveRead({id:'linked',title:'原来的私有设计'});await pending;assert.deepEqual(opened,[]);assert.equal(warmed,0)
  }
  reset();const controller=new AbortController(),pending=restoreLinkedConversationDesign('room','linked',controller.signal);controller.abort();resolveRead({id:'linked',title:'已取消的设计'});await pending;assert.deepEqual(opened,[])
  }finally{deferRead=false}
})
