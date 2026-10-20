import { z } from 'zod'

const text = z.string().trim().min(1)
const id = z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/)
export const sequenceDiagramSchema = z.object({
  kind: z.literal('sequence'), title: text.max(200),
  nodes: z.array(z.object({ id, label: text.max(160), detail: text.max(1600).optional() }).strict()).min(2).max(12),
  edges: z.array(z.object({ from: id, to: id, label: text.max(160).optional() }).strict()).min(1).max(11).optional(),
}).strict()
export class DiagramInputError extends Error {}
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)

/** A deliberately narrow sequence, with no independent box/connector coordinates.
 * Natural block height and wrapping preserve text; this is not an arbitrary graph layout. */
export function renderSequenceDiagram(input: unknown, signal?: AbortSignal) {
  signal?.throwIfAborted()
  const diagram = sequenceDiagramSchema.parse(input)
  if (new Set(diagram.nodes.map(node => node.id)).size !== diagram.nodes.length) throw new DiagramInputError('Sequence node IDs must be unique.')
  const adjacent = diagram.nodes.slice(1).map((node, i) => ({ from: diagram.nodes[i]!.id, to: node.id }))
  const edges: Array<{ from: string; to: string; label?: string }> = diagram.edges ?? adjacent
  if (edges.length !== adjacent.length || edges.some((edge, i) => edge.from !== adjacent[i]!.from || edge.to !== adjacent[i]!.to)) {
    throw new DiagramInputError('Sequence edges must be the complete adjacent forward chain in node order.')
  }
  const html = '<style>.lx-sequence{font:14px/1.5 system-ui;color:inherit;box-sizing:border-box;width:100%}.lx-sequence ol{display:grid;grid-template-columns:minmax(0,1fr);list-style:none;padding:0;margin:0 auto;max-width:44rem}.lx-sequence li{min-width:0}.lx-sequence-node{box-sizing:border-box;border:1px solid currentColor;border-radius:.6rem;padding:1rem;min-width:0;overflow-wrap:anywhere;white-space:pre-wrap}.lx-sequence h3,.lx-sequence h4,.lx-sequence p{overflow-wrap:anywhere;white-space:pre-wrap}.lx-sequence h4{margin:0}.lx-sequence p{margin:.5rem 0 0}.lx-sequence-connector{display:grid;justify-items:center;min-width:0;padding:.4rem 1rem;overflow-wrap:anywhere;white-space:pre-wrap;text-align:center}</style>'
    + `<section class="lx-sequence"><h3>${escapeHtml(diagram.title)}</h3><ol>`
    + diagram.nodes.map((node, i) => `<li><div class="lx-sequence-node"><h4>${i + 1}. ${escapeHtml(node.label)}</h4>${node.detail ? `<p>${escapeHtml(node.detail)}</p>` : ''}</div>`
      + (i < edges.length ? `<div class="lx-sequence-connector"><span aria-hidden="true">↓</span>${edges[i]!.label !== undefined ? `<span>${escapeHtml(edges[i]!.label!)}</span>` : ''}</div>` : '') + '</li>').join('') + '</ol></section>'
  signal?.throwIfAborted()
  return { html, summary: { kind: 'sequence' as const, nodeIds: diagram.nodes.map(node => node.id), edges, layout: 'vertical-document-flow' as const } }
}
