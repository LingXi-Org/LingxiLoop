import type { ArtifactPage, ArtifactRichText } from '../../../../shared/artifact-document'
function heading(value: ArtifactRichText | undefined): boolean {
  return (
    !!value &&
    ((value.type === 'heading' && (value.attrs?.level ?? 1) <= 3) || !!value.content?.some(heading))
  )
}
/** The reference captions slides using their first heading, then first text. */
export function slideTitleSnippet(page: ArtifactPage, maximum = 60): string {
  const texts = page.nodeOrder
    .map((id) => page.nodes[id])
    .filter((node) => node?.type === 'text' && node.text?.trim())
  const value = ((texts.find((node) => heading(node.richText)) ?? texts[0])?.text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  if (value.length <= maximum) return value
  let end = maximum - 1
  if (/[\uD800-\uDBFF]/.test(value[end - 1] ?? '') && /[\uDC00-\uDFFF]/.test(value[end] ?? ''))
    end--
  return value.slice(0, end).trimEnd() + '…'
}

/** Speaker previews use an existing static snapshot and never mount executable code. */
export function speakerPreviewPage(
  page: ArtifactPage,
  assets: Record<string, unknown>,
): ArtifactPage {
  return {
    ...page,
    nodes: Object.fromEntries(
      Object.entries(page.nodes).map(([id, node]) => {
        if (node.type !== 'embed') return [id, node]
        const preview = node.embed?.previewAssetId
        return [
          id,
          preview && assets[preview]
            ? { ...node, type: 'image' as const, assetId: preview, embed: undefined }
            : { ...node, hidden: true },
        ]
      }),
    ),
  }
}
