import type { ArtifactDocument, ArtifactNode } from '../../../../shared/artifact-document'

/** Node IDs are page-local. Each capture receives its own asset identity. */
export async function withEmbedPreviews(document: ArtifactDocument, capture: (entry: { pageId: string; nodeId: string; node: ArtifactNode }) => Promise<string>): Promise<ArtifactDocument> {
  const entries = document.pageOrder.flatMap(pageId => document.pages[pageId].nodeOrder.flatMap(nodeId => {
    const node = document.pages[pageId].nodes[nodeId]
    return node.type === 'embed' && node.embed ? [{ pageId, nodeId, node }] : []
  }))
  if (!entries.length) return document
  const result = { ...document, pages: { ...document.pages }, assets: { ...document.assets } }
  for (const entry of entries) {
    const { pageId, nodeId, node } = entry
    const dataUrl = await capture(entry)
    const assetId = `export-${crypto.randomUUID()}`
    result.assets[assetId] = { id: assetId, url: dataUrl, contentType: 'image/png', width: node.width, height: node.height }
    result.pages[pageId] = { ...result.pages[pageId], nodes: { ...result.pages[pageId].nodes, [nodeId]: { ...node, embed: { ...node.embed!, previewAssetId: assetId } } } }
  }
  return result
}
