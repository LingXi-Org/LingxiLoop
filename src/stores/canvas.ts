import { create } from 'zustand'
import { api, ws, type WsEvent } from '@/api/client'
import type {
  CanvasFrame,
  CanvasFrameType,
  CanvasSnapshot,
} from '@/types'

interface CanvasState {
  snapshot: CanvasSnapshot | null
  loading: boolean
  error: string | null
  selectedFrameId: string | null
  load: () => Promise<void>
  reset: () => void
  selectFrame: (id: string | null) => void
  patchLocalFrame: (id: string, patch: Partial<CanvasFrame>) => void
  createFrame: (type: CanvasFrameType, at?: { x: number; y: number }) => Promise<CanvasFrame>
  updateFrame: (id: string, patch: Partial<Pick<CanvasFrame,
    'type' | 'title' | 'x' | 'y' | 'width' | 'height' | 'content' | 'data'
  >>, optimistic?: boolean) => Promise<CanvasFrame>
  deleteFrame: (id: string) => Promise<void>
  addComment: (body: string, frameId?: string | null) => Promise<void>
  setStatus: (status: string, frameId?: string | null) => Promise<void>
  applyEvent: (event: Extract<WsEvent, { type: 'canvas.changed' }>) => void
}

function upsertFrame(frames: CanvasFrame[], frame: CanvasFrame): CanvasFrame[] {
  const index = frames.findIndex((item) => item.id === frame.id)
  if (index < 0) return [...frames, frame]
  const next = frames.slice()
  next[index] = frame
  return next
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
  loading: false,
  error: null,
  selectedFrameId: null,

  load: async () => {
    set({ loading: true, error: null })
    try {
      const snapshot = await api.getCanvas()
      set((state) => ({
        snapshot,
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

  reset: () => set({ snapshot: null, loading: false, error: null, selectedFrameId: null }),
  selectFrame: (id) => set({ selectedFrameId: id }),
  patchLocalFrame: (id, patch) => set((state) => state.snapshot ? {
    snapshot: {
      ...state.snapshot,
      frames: state.snapshot.frames.map((frame) => frame.id === id ? { ...frame, ...patch } : frame),
    },
  } : {}),

  createFrame: async (type, at = { x: 80, y: 80 }) => {
    const preset = defaults[type]
    const frame = await api.createCanvasFrame({ type, x: at.x, y: at.y, ...preset })
    set((state) => ({
      selectedFrameId: frame.id,
      snapshot: state.snapshot
        ? { ...state.snapshot, frames: upsertFrame(state.snapshot.frames, frame) }
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
      const frame = await api.updateCanvasFrame(id, patch)
      set((state) => state.snapshot ? {
        snapshot: { ...state.snapshot, frames: upsertFrame(state.snapshot.frames, frame) },
      } : {})
      return frame
    } catch (error) {
      if (optimistic && before) {
        set((state) => state.snapshot ? {
          snapshot: { ...state.snapshot, frames: upsertFrame(state.snapshot.frames, before) },
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
    const comment = await api.addCanvasComment(body, frameId)
    set((state) => state.snapshot ? {
      snapshot: { ...state.snapshot, comments: [comment, ...state.snapshot.comments.filter((item) => item.id !== comment.id)] },
    } : {})
  },

  setStatus: async (status, frameId = null) => {
    const presence = await api.setCanvasStatus(status, frameId)
    set((state) => {
      if (!state.snapshot) return {}
      const without = state.snapshot.presence.filter((item) => item.participantId !== presence?.participantId)
      return { snapshot: { ...state.snapshot, presence: presence ? [presence, ...without] : without } }
    })
  },

  applyEvent: (event) => {
    set((state) => {
      const snapshot = state.snapshot
      if (!snapshot || snapshot.id !== event.canvasId) return {}
      if ((event.kind === 'frame.created' || event.kind === 'frame.updated') && event.frame) {
        return { snapshot: { ...snapshot, frames: upsertFrame(snapshot.frames, event.frame) } }
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
      return {}
    })
  },
}))

ws.on((event) => {
  if (event.type === 'canvas.changed') useCanvas.getState().applyEvent(event)
  if (event.type === 'hello' && useCanvas.getState().snapshot) void useCanvas.getState().load()
})
