import assert from 'node:assert/strict'
import test, { mock } from 'node:test'
import type { WsEvent } from '@/api/contracts'
import { useApp } from '@/stores/app'
import { useSurface } from '@/stores/surface'
import type { CanvasSnapshot } from './contracts'

test('Canvas requests ignore old scopes and live updates never open the full view automatically', async () => {
  let projectId = 'project'
  let receive!: (event: WsEvent) => void
  const snapshot: CanvasSnapshot = {
    id: 'canvas', title: '课程画布', companyId: 'company', conversationId: 'room',
    triggerClientMsgNo: null, goal: '', initiatorAgentId: null, status: 'active', origin: 'conversation',
    summary: null, createdBy: 'user', createdAt: '', updatedAt: '', frames: [], assignments: [],
    presence: [], comments: [], activity: [], reports: [],
  }
  let finish!: (snapshot: CanvasSnapshot) => void
  let ensure = () => new Promise<CanvasSnapshot>((resolve) => { finish = resolve })
  mock.module('@/api/core/realtime', { namedExports: { ws: { on: (listener: typeof receive) => { receive = listener } } } })
  mock.module('@/lib/workspaceSession', { namedExports: { getWorkspaceSession: () => ({ companyId: 'company', projectId }) } })
  mock.module('./api', { namedExports: { canvasApi: {
    ensureConversationCanvas: () => ensure(), getCanvases: async () => [], getCanvas: () => ensure(),
  } } })
  const { useCanvas } = await import('./state')
  try {
    useApp.setState({ view: 'conversations', selectedConversationId: 'room' })
    const pending = useCanvas.getState().ensureForConversation('room')
    projectId = 'other'
    finish(snapshot)
    await pending
    assert.equal(useCanvas.getState().snapshot, null)

    const afterReset = useCanvas.getState().ensureForConversation('room')
    useCanvas.getState().reset()
    finish(snapshot)
    await afterReset
    assert.equal(useCanvas.getState().snapshot, null)

    const oldPreview = useCanvas.getState().loadPreview('canvas')
    useCanvas.getState().reset()
    finish(snapshot)
    await oldPreview
    assert.deepEqual(useCanvas.getState().previews, {})

    ensure = async () => snapshot
    await useCanvas.getState().ensureForConversation('room')
    assert.equal(useCanvas.getState().previews.canvas.title, '课程画布')
    useSurface.getState().closeSurface()
    receive({ type: 'canvas.changed', kind: 'workspace.started', canvasId: 'canvas', conversationId: 'room', timestamp: '2026-09-26T10:00:00Z', workspace: snapshot } as WsEvent)
    assert.equal(useSurface.getState().surface, null)
    receive({ type: 'canvas.changed', kind: 'workspace.updated', canvasId: 'canvas', conversationId: 'room', timestamp: '2026-09-26T10:01:00Z', workspace: { title: '实时更新' } } as WsEvent)
    assert.equal(useCanvas.getState().previews.canvas.title, '实时更新')
    receive({ type: 'canvas.changed', kind: 'workspace.updated', canvasId: 'canvas', conversationId: 'another-room', timestamp: '2026-09-26T10:02:00Z', workspace: { title: '其他会话' } } as WsEvent)
    assert.equal(useCanvas.getState().previews.canvas.title, '实时更新')
  } finally { mock.restoreAll() }
})
