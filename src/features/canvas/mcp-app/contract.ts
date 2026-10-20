import { z } from 'zod'
import type { CanvasFrame } from '../contracts'

// A first-party MCP Apps profile. These are application tools, not Gen UI APIs.
export const CANVAS_APP_URI = 'ui://lingxiloop/canvas-document.html'
export const canvasAppTools = [
  { name: 'read_frame', description: 'Read the bound Canvas document.', inputSchema: { type: 'object' as const, properties: {}, additionalProperties: false } },
  { name: 'commit_frame', description: 'Save text against the revision that was read. Conflicts preserve the draft.', inputSchema: {
    type: 'object' as const, properties: { content: { type: 'string' }, expectedRevision: { type: 'integer', minimum: 1 } }, required: ['content', 'expectedRevision'], additionalProperties: false,
  } },
].map(tool => ({ ...tool, _meta: { ui: { resourceUri: CANVAS_APP_URI, visibility: ['app'] } } }))

export const commitFrameSchema = z.object({
  content: z.string().refine(value => new TextEncoder().encode(value).byteLength <= 1024 * 1024, 'Document exceeds 1 MiB'),
  expectedRevision: z.number().int().positive(),
}).strict()
export const emptyArgumentsSchema = z.object({}).strict()
export const canvasReferenceSchema = z.object({
  frameId: z.string(), revision: z.number().int().positive(),
  text: z.string().min(1).max(2000),
}).strict()
export type CanvasReference = z.infer<typeof canvasReferenceSchema> & { title: string }

export const viewStateRequestSchema = z.object({
  method: z.literal('ui/set-widget-state'),
  params: z.object({ widgetState: z.object({ dirty: z.boolean() }).strict() }).strict(),
})

export function canvasDocument(frame: CanvasFrame) {
  // No user/session credentials, arbitrary frame.data, or author identities enter the App.
  return { id: frame.id, canvasId: frame.canvasId, title: frame.title, type: frame.type, content: frame.content, revision: frame.revision }
}
