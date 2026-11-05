import { createNode, type ArtifactNode, type ArtifactPage } from './artifact-document.js'

/** v2.8.0 insertion geometry: 900px wide, 128px inset, vertically centred. */
export function createTableNode(id: string, page: ArtifactPage): ArtifactNode {
  const fontSize = 32, lineHeight = 1.4, border = 2
  const height = border + 3 * (fontSize * (lineHeight + .7) + border)
  const node = createNode('table', id)
  return { ...node, x: 128, y: (page.height - height) / 2, width: 900, height,
    tableHeader: true, cells: [['列标题', '列标题', '列标题'], ['', '', ''], ['', '', '']],
    style: { ...node.style, fontSize, fontWeight: 400, lineHeight,
      themeColorFallback: '#141413', themeFontFallback: 'system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif' } }
}
