import type { ArtifactDocument } from '../../../../shared/artifact-document'
import type { ArtifactExportFormat } from './export-artifact'

/** Whole-deck exports use the same presentable pages as playback. Image export
 * still targets the selected slide, including a skipped slide. Never mutate it. */
export function exportPages(document: ArtifactDocument, format: ArtifactExportFormat): ArtifactDocument {
  if (document.kind !== 'slides' || !['html', 'pdf', 'pptx'].includes(format)) return document
  const pageOrder = document.pageOrder.filter(id => !document.pages[id].skip)
  if (!pageOrder.length) throw new Error('所有页面均已跳过，请先恢复至少一页。')
  if (pageOrder.length === document.pageOrder.length) return document
  return { ...document, pageOrder, pages: Object.fromEntries(pageOrder.map(id => [id, document.pages[id]])) }
}
