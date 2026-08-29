
import { http } from '@/api/core/http'
import type {
  CanvasComment,
  CanvasFrame,
  CanvasFrameType,
  CanvasPresence,
  CanvasSnapshot,
  CanvasWorkspaceSummary,
} from './contracts'

export const canvasApi = {
  getCanvas: (canvasId?: string) => http<CanvasSnapshot>(canvasId ? `/canvases/${encodeURIComponent(canvasId)}` : '/canvas'),
  getCanvases: (conversationId?: string) => http<CanvasWorkspaceSummary[]>(`/canvases${conversationId ? `?conversationId=${encodeURIComponent(conversationId)}` : ''}`),
  getConversationCanvas: (conversationId: string) => http<CanvasSnapshot | null>(`/conversations/${encodeURIComponent(conversationId)}/canvas`),
  createConversationCanvas: (conversationId: string) => http<CanvasSnapshot>(`/conversations/${encodeURIComponent(conversationId)}/canvas`, { method: 'POST' }),
  createCanvasFrame: (input: {
    type: CanvasFrameType; title?: string; x?: number; y?: number; width?: number
    canvasId: string; height?: number; content?: string; data?: Record<string, unknown>
  }) => http<CanvasFrame>('/canvas/frames', { method: 'POST', body: JSON.stringify(input) }),
  updateCanvasFrame: (frameId: string, patch: Partial<Pick<CanvasFrame,
    'type' | 'title' | 'x' | 'y' | 'width' | 'height' | 'content' | 'data'
  >> & { baseRevision?: number }) => http<CanvasFrame>(`/canvas/frames/${encodeURIComponent(frameId)}`, {
    method: 'PATCH', body: JSON.stringify(patch),
  }),
  appendCanvasContent: (frameId: string, content: string) =>
    http<CanvasFrame>(`/canvas/frames/${encodeURIComponent(frameId)}/append`, {
      method: 'POST', body: JSON.stringify({ content }),
    }),
  deleteCanvasFrame: (frameId: string) =>
    http<{ id: string; canvasId: string }>(`/canvas/frames/${encodeURIComponent(frameId)}`, { method: 'DELETE' }),
  setCanvasStatus: (status: string, frameId: string | null, canvasId: string, cursor?: { x: number; y: number }) =>
    http<CanvasPresence | null>('/canvas/status', { method: 'POST', body: JSON.stringify({ status, frameId, canvasId, cursorX: cursor?.x, cursorY: cursor?.y }) }),
  addCanvasComment: (body: string, frameId: string | null, canvasId: string) =>
    http<CanvasComment>('/canvas/comments', { method: 'POST', body: JSON.stringify({ body, frameId, canvasId }) }),
  assignCanvasWork: (canvasId: string, agentId: string, assignment: string) =>
    http<CanvasSnapshot>(`/canvases/${encodeURIComponent(canvasId)}/assignments`, {
      method: 'POST', body: JSON.stringify({ agentId, assignment }),
    }),
  steerCanvasAssignment: (canvasId: string, agentId: string, text: string) =>
    http<{ ok: boolean }>(`/canvases/${encodeURIComponent(canvasId)}/assignments/${encodeURIComponent(agentId)}/steer`, { method: 'POST', body: JSON.stringify({ text }) }),
  stopCanvasAssignment: (canvasId: string, agentId: string) =>
    http<{ ok: boolean }>(`/canvases/${encodeURIComponent(canvasId)}/assignments/${encodeURIComponent(agentId)}/stop`, { method: 'POST' }),
  stopCanvas: (canvasId: string) => http<{ ok: boolean }>(`/canvases/${encodeURIComponent(canvasId)}/stop`, { method: 'POST' })
}
