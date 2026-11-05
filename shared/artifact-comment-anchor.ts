import { z } from 'zod'
import { artifactIdSchema, type ArtifactPage } from './artifact-document.js'

const schema = z.object({ pageId: artifactIdSchema, nodeId: artifactIdSchema.optional(), x: z.number().finite().min(0).max(1), y: z.number().finite().min(0).max(1) }).strict()
export type NativeCommentAnchor = z.infer<typeof schema>
export function encodeCommentAnchor(value: NativeCommentAnchor): string { return `native:${encodeURIComponent(JSON.stringify(schema.parse(value)))}` }
export function decodeCommentAnchor(value: string): NativeCommentAnchor | null {
  if (!value.startsWith('native:') || value.length > 2048) return null
  try { const parsed = schema.safeParse(JSON.parse(decodeURIComponent(value.slice(7)))); return parsed.success ? parsed.data : null } catch { return null }
}
export function commentAnchorAtPoint(page: ArtifactPage, nodeId: string | undefined, point: { x: number; y: number }): NativeCommentAnchor {
  const node=nodeId ? page.nodes[nodeId] : undefined, chain=[]
  let current=node
  while(current) { chain.unshift(current);current=current.parentId ? page.nodes[current.parentId] : undefined }
  let {x,y}=point
  for(const n of chain) {
    const angle=-n.rotation*Math.PI/180,px=x-n.x-n.width/2,py=y-n.y-n.height/2
    const rx=Math.cos(angle)*px-Math.sin(angle)*py,ry=Math.sin(angle)*px+Math.cos(angle)*py
    x=(n.flipX?-rx:rx)+n.width/2;y=(n.flipY?-ry:ry)+n.height/2
  }
  return {pageId:page.id,...(node?{nodeId:node.id}:{}),x:Math.max(0,Math.min(1,x/(node?.width??page.width))),y:Math.max(0,Math.min(1,y/(node?.height??page.height)))}
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
