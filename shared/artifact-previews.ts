import {artifactLinkPreview} from './artifact-link-preview.js'
import type { ArtifactDocument, ArtifactPage } from './artifact-document.js'

/** Bounded summaries for navigation; never used as editable page payloads. */
export function artifactPreviews(document: ArtifactDocument, maximumBytes = 256 * 1024): Record<string, ArtifactPage> {
  const previews: Record<string, ArtifactPage> = {}
  let bytes = 0
  for (const id of document.pageOrder) {
    const page = document.pages[id]!, selected = new Set<string>()
    for (const nodeId of page.nodeOrder) {
      const node = page.nodes[nodeId]!
      if (node.hidden || node.attributes?.hidden!==undefined || node.scope === 'canvas' || selected.size >= 96) continue
      selected.add(nodeId)
      let parentId = node.parentId
      while (parentId && !selected.has(parentId)) { selected.add(parentId); parentId = page.nodes[parentId]?.parentId ?? null }
    }
    const nodes = Object.fromEntries(page.nodeOrder.filter(id => selected.has(id)).map(id => {
      const { source: _source, richText: _richText, embed, text, cells, points, ...node } = page.nodes[id]!
      const decoration=artifactLinkPreview(_richText)
      return [id, { ...node, ...(decoration?{richText:decoration.richText}:{}), ...(text ? { text: text.slice(0,512) } : {}), ...(cells ? {cells:cells.slice(0,12).map(row => row.slice(0,8).map(cell => cell.slice(0,48)))} : {}), ...(points ? {points:points.slice(0,256)} : {}), ...(embed?.previewAssetId ? {embed:{source:'',format:'html' as const,previewAssetId:embed.previewAssetId}} : {}) }]
    }))
    const preview = { ...page, notes: '', nodeOrder: page.nodeOrder.filter(id => selected.has(id)), nodes }
    const size = new TextEncoder().encode(JSON.stringify(preview)).byteLength
    if (bytes + size > maximumBytes) break
    previews[id] = preview; bytes += size
  }
  return previews
}
