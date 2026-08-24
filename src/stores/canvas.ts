import { create } from 'zustand'
import { api, ws, type WsEvent } from '@/api/client'
import type {
  CanvasFrame,
  CanvasFrameType,
  CanvasSnapshot,
  CanvasWorkspaceSummary,
} from '@/types'
import { useApp } from '@/stores/app'
import { acceptsCanvasEventTimestamp, upsertCanvasFrame } from '@/lib/canvasRealtime'

interface CanvasState {
  snapshot: CanvasSnapshot | null
  workspaces: CanvasWorkspaceSummary[]
  activeCanvasId: string | null
  eventClocks: Record<string, string>
  liveCards: Record<string, { status?: CanvasSnapshot['status']; frameIds: string[]; assignments: CanvasSnapshot['assignments'] }>
  loading: boolean
  error: string | null
  selectedFrameId: string | null
  load: (canvasId?: string) => Promise<void>
  loadWorkspaces: (conversationId?: string) => Promise<void>
  reset: () => void
  selectFrame: (id: string | null) => void
  patchLocalFrame: (id: string, patch: Partial<CanvasFrame>) => void
  createFrame: (type: CanvasFrameType, at?: { x: number; y: number }) => Promise<CanvasFrame>
  updateFrame: (id: string, patch: Partial<Pick<CanvasFrame,
    'type' | 'title' | 'x' | 'y' | 'width' | 'height' | 'content' | 'data'
  >>, optimistic?: boolean) => Promise<CanvasFrame>
  deleteFrame: (id: string) => Promise<void>
  addComment: (body: string, frameId?: string | null) => Promise<void>
  setStatus: (status: string, frameId?: string | null, cursor?: { x: number; y: number }) => Promise<void>
  steerAgent: (agentId: string, text: string) => Promise<void>
  stopAgent: (agentId: string) => Promise<void>
  stopWorkspace: () => Promise<void>
  applyEvent: (event: Extract<WsEvent, { type: 'canvas.changed' }>) => void
}

const defaults: Record<CanvasFrameType, { title: string; content: string; width: number; height: number }> = {
  markdown: { title: 'Markdown note', content: '# New idea\n\nStart writing together…', width: 420, height: 320 },
  html: { title: 'HTML preview', content: '<main><h1>Hello Canvas</h1><p>Safe, sandboxed HTML preview.</p></main>', width: 520, height: 360 },
  document: { title: 'Document', content: '', width: 420, height: 260 },
  image: { title: 'Image', content: '', width: 420, height: 320 },
  artifact: { title: 'Artifact', content: '', width: 420, height: 280 },
}

export const useCanvas = create<CanvasState>((set, get) => ({
  snapshot: null,
  workspaces: [],
  activeCanvasId: null,
  eventClocks: {},
  liveCards: {},
  loading: false,
  error: null,
  selectedFrameId: null,

  load: async (canvasId) => {
    set({ loading: true, error: null })
    try {
      const snapshot = await api.getCanvas(canvasId ?? get().activeCanvasId ?? undefined)
      set((state) => ({
        snapshot,
        activeCanvasId: snapshot.id,
        eventClocks: {
          ...state.eventClocks,
          [`${snapshot.id}:workspace`]: snapshot.updatedAt,
          ...Object.fromEntries(snapshot.frames.map((frame) => [`${snapshot.id}:frame:${frame.id}`, frame.updatedAt])),
          ...Object.fromEntries(snapshot.assignments.map((assignment) => [`${snapshot.id}:assignment:${assignment.agentId}`, assignment.updatedAt])),
          ...Object.fromEntries(snapshot.presence.map((presence) => [`${snapshot.id}:presence:${presence.participantId}`, presence.lastSeenAt])),
        },
        selectedFrameId: state.selectedFrameId && snapshot.frames.some((f) => f.id === state.selectedFrameId)
          ? state.selectedFrameId
          : null,
      }))
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) })
    } finally {
      set({ loading: false })
    }
  },

  loadWorkspaces: async (conversationId) => {
    try { set({ workspaces: await api.getCanvases(conversationId) }) }
    catch (error) { set({ error: error instanceof Error ? error.message : String(error) }) }
  },

  reset: () => set({ snapshot: null, workspaces: [], activeCanvasId: null, eventClocks: {}, liveCards: {}, loading: false, error: null, selectedFrameId: null }),
  selectFrame: (id) => set({ selectedFrameId: id }),
  patchLocalFrame: (id, patch) => set((state) => state.snapshot ? {
    snapshot: {
      ...state.snapshot,
      frames: state.snapshot.frames.map((frame) => frame.id === id ? { ...frame, ...patch } : frame),
    },
  } : {}),

  createFrame: async (type, at = { x: 80, y: 80 }) => {
    const preset = defaults[type]
    const frame = await api.createCanvasFrame({ canvasId: get().activeCanvasId ?? undefined, type, x: at.x, y: at.y, ...preset })
    set((state) => ({
      selectedFrameId: frame.id,
      snapshot: state.snapshot
        ? { ...state.snapshot, frames: upsertCanvasFrame(state.snapshot.frames, frame) }
        : state.snapshot,
    }))
    return frame
  },

  updateFrame: async (id, patch, optimistic = false) => {
    const before = get().snapshot?.frames.find((frame) => frame.id === id)
    if (optimistic && before) {
      set((state) => state.snapshot ? {
        snapshot: {
          ...state.snapshot,
          frames: state.snapshot.frames.map((frame) => frame.id === id ? { ...frame, ...patch } : frame),
        },
      } : {})
    }
    try {
      const contentChange = patch.type !== undefined || patch.title !== undefined || patch.content !== undefined || patch.data !== undefined
      const frame = await api.updateCanvasFrame(id, { ...patch, ...(contentChange && before ? { baseRevision: before.revision } : {}) })
      set((state) => state.snapshot ? {
        snapshot: { ...state.snapshot, frames: upsertCanvasFrame(state.snapshot.frames, frame) },
      } : {})
      return frame
    } catch (error) {
      if (optimistic && before) {
        set((state) => state.snapshot ? {
          snapshot: { ...state.snapshot, frames: upsertCanvasFrame(state.snapshot.frames, before) },
        } : {})
      }
      throw error
    }
  },

  deleteFrame: async (id) => {
    await api.deleteCanvasFrame(id)
    set((state) => state.snapshot ? {
      selectedFrameId: state.selectedFrameId === id ? null : state.selectedFrameId,
      snapshot: { ...state.snapshot, frames: state.snapshot.frames.filter((frame) => frame.id !== id) },
    } : {})
  },

  addComment: async (body, frameId = null) => {
    const comment = await api.addCanvasComment(body, frameId, get().activeCanvasId ?? undefined)
    set((state) => state.snapshot ? {
      snapshot: { ...state.snapshot, comments: [comment, ...state.snapshot.comments.filter((item) => item.id !== comment.id)] },
    } : {})
  },

  setStatus: async (status, frameId = null, cursor) => {
    const presence = await api.setCanvasStatus(status, frameId, get().activeCanvasId ?? undefined, cursor)
    set((state) => {
      if (!state.snapshot) return {}
      const without = state.snapshot.presence.filter((item) => item.participantId !== presence?.participantId)
      return { snapshot: { ...state.snapshot, presence: presence ? [presence, ...without] : without } }
    })
  },

  steerAgent: async (agentId, text) => {
    const canvasId = get().activeCanvasId; if (!canvasId) return
    await api.steerCanvasAssignment(canvasId, agentId, text)
  },
  stopAgent: async (agentId) => {
    const canvasId = get().activeCanvasId; if (!canvasId) return
    await api.stopCanvasAssignment(canvasId, agentId); await get().load(canvasId)
  },
  stopWorkspace: async () => {
    const canvasId = get().activeCanvasId; if (!canvasId) return
    await api.stopCanvas(canvasId); await get().load(canvasId)
  },

  applyEvent: (event) => {
    const entityId = event.frame?.id ?? event.frameId ?? event.assignment?.agentId
      ?? event.presence?.participantId ?? event.participantId
    const clockScope = event.kind.startsWith('workspace.')
      ? 'workspace'
      : event.kind.startsWith('frame.') && entityId
        ? `frame:${entityId}`
        : (event.kind.startsWith('presence.') || event.kind === 'cursor.moved') && entityId
          ? `presence:${entityId}`
          : event.kind === 'assignment.updated' && entityId
            ? `assignment:${entityId}`
            : null
    if (clockScope) {
      const key = `${event.canvasId}:${clockScope}`
      if (!acceptsCanvasEventTimestamp(get().eventClocks[key], event.timestamp)) return
      set((state) => ({ eventClocks: { ...state.eventClocks, [key]: event.timestamp } }))
    }
    set((state) => {
      const current = state.liveCards[event.canvasId] ?? { frameIds: [], assignments: [] }
      let next = current
      if ((event.kind === 'frame.created' || event.kind === 'frame.updated') && event.frame) {
        next = { ...current, frameIds: current.frameIds.includes(event.frame.id) ? current.frameIds : [...current.frameIds, event.frame.id] }
      } else if (event.kind === 'frame.deleted' && event.frameId) {
        next = { ...current, frameIds: current.frameIds.filter((id) => id !== event.frameId) }
      } else if (event.kind === 'assignment.updated' && event.assignment) {
        const prior = current.assignments.find((item) => item.agentId === event.assignment!.agentId)
        next = prior && new Date(prior.updatedAt).getTime() > new Date(event.assignment.updatedAt).getTime() ? current : {
          ...current, assignments: [...current.assignments.filter((item) => item.agentId !== event.assignment!.agentId), event.assignment],
        }
      } else if ((event.kind === 'workspace.started' || event.kind === 'workspace.updated') && event.workspace?.status) {
        next = { ...current, status: event.workspace.status }
      }
      return next === current ? {} : { liveCards: { ...state.liveCards, [event.canvasId]: next } }
    })
    set((state) => {
      const snapshot = state.snapshot
      if (!snapshot || snapshot.id !== event.canvasId) return {}
      if ((event.kind === 'frame.created' || event.kind === 'frame.updated') && event.frame) {
        return { snapshot: { ...snapshot, frames: upsertCanvasFrame(snapshot.frames, event.frame), assignments: snapshot.assignments.map((assignment) =>
          assignment.agentId === event.frame!.updatedBy ? { ...assignment, activeFrameId: event.frame!.id,
            cursor: { x: event.frame!.x + event.frame!.width / 2, y: event.frame!.y + 28 } } : assignment) } }
      }
      if (event.kind === 'frame.deleted' && event.frameId) {
        return {
          selectedFrameId: state.selectedFrameId === event.frameId ? null : state.selectedFrameId,
          snapshot: { ...snapshot, frames: snapshot.frames.filter((frame) => frame.id !== event.frameId) },
        }
      }
      if (event.kind === 'presence.updated' && event.presence) {
        return {
          snapshot: {
            ...snapshot,
            presence: [event.presence, ...snapshot.presence.filter((item) => item.participantId !== event.presence!.participantId)],
            assignments: snapshot.assignments.map((assignment) => assignment.agentId === event.presence!.participantId && event.presence!.cursorX != null && event.presence!.cursorY != null
              ? { ...assignment, activeFrameId: event.presence!.frameId, cursor: { x: event.presence!.cursorX!, y: event.presence!.cursorY! } }
              : assignment),
          },
        }
      }
      if (event.kind === 'presence.removed' && event.participantId) {
        return { snapshot: { ...snapshot, presence: snapshot.presence.filter((item) => item.participantId !== event.participantId) } }
      }
      if (event.kind === 'comment.created' && event.comment) {
        return { snapshot: { ...snapshot, comments: [event.comment, ...snapshot.comments.filter((item) => item.id !== event.comment!.id)].slice(0, 100) } }
      }
      if (event.kind === 'activity.created' && event.activity) {
        return { snapshot: { ...snapshot, activity: [event.activity, ...snapshot.activity.filter((item) => item.id !== event.activity!.id)].slice(0, 100) } }
      }
      if (event.kind === 'assignment.updated' && event.assignment) {
        const prior = snapshot.assignments.find((item) => item.agentId === event.assignment!.agentId)
        if (prior && new Date(prior.updatedAt).getTime() > new Date(event.assignment.updatedAt).getTime()) return {}
        return { snapshot: { ...snapshot, assignments: [
          ...snapshot.assignments.filter((item) => item.agentId !== event.assignment!.agentId), event.assignment,
        ] } }
      }
      if (event.kind === 'workspace.updated' && event.workspace) {
        return { snapshot: { ...snapshot, ...event.workspace } as CanvasSnapshot }
      }
      return {}
    })
  },
}))

ws.on((event) => {
  if (event.type === 'canvas.changed') {
    useCanvas.getState().applyEvent(event)
    if (event.kind === 'workspace.started') {
      void useCanvas.getState().loadWorkspaces()
      const app = useApp.getState()
      if (window.innerWidth >= 768 && app.view === 'conversations' && app.selectedConversationId === event.conversationId) {
        app.openCanvasPeek(event.canvasId)
        void useCanvas.getState().load(event.canvasId)
      }
    }
  }
  if (event.type === 'hello' && useCanvas.getState().snapshot) void useCanvas.getState().load(useCanvas.getState().activeCanvasId ?? undefined)
})
