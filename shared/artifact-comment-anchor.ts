import { z } from 'zod'
import { artifactIdSchema, type ArtifactPage } from './artifact-document.js'

const schema = z.object({ pageId: artifactIdSchema, nodeId: artifactIdSchema.optional(), x: z.number().finite().min(0).max(1), y: z.number().finite().min(0).max(1) }).strict()
export type NativeCommentAnchor = z.infer<typeof schema>
export function encodeCommentAnchor(value: NativeCommentAnchor): string { return `native:${encodeURIComponent(JSON.stringify(schema.parse(value)))}` }
export function decodeCommentAnchor(value: string): NativeCommentAnchor | null {
  if (!value.startsWith('native:') || value.length > 2048) return null
  try { const parsed = schema.safeParse(JSON.parse(decodeURIComponent(value.slice(7)))); return parsed.success ? parsed.data : null } catch { return null }
}
/** Point follows the stable node identity; no viewport pixels are persisted. */
export function commentPoint(anchor: NativeCommentAnchor, page: ArtifactPage) {
  const node = anchor.nodeId ? page.nodes[anchor.nodeId] : undefined
  if (anchor.nodeId && !node) return null
  let x = anchor.x * (node?.width ?? page.width), y = anchor.y * (node?.height ?? page.height)
  let current = node
  while (current) {
    const a = current.rotation * Math.PI / 180, px = x - current.width / 2, py = y - current.height / 2
    const fx = current.flipX ? -px : px, fy = current.flipY ? -py : py
    x = current.x + current.width / 2 + Math.cos(a) * fx - Math.sin(a) * fy
    y = current.y + current.height / 2 + Math.sin(a) * fx + Math.cos(a) * fy
    current = current.parentId ? page.nodes[current.parentId] : undefined
  }
  return { x, y }
}
