import type { ArtifactDocument } from '../../../../../shared/artifact-document'
import type { ArtifactExportOptions, ArtifactExportResult } from '../export-artifact'
import { ExportResources, exportFilename } from './common'
import { mountExportPage } from './render'

export async function exportDocument(document: ArtifactDocument, options: ArtifactExportOptions): Promise<ArtifactExportResult> {
  const resources = new ExportResources(document, options)
  try {
    const page = document.pages[document.pageOrder[0]!]
    if (!page) throw new Error('没有可导出的页面')
    const mounted = await mountExportPage(page, resources)
    try {
      const { toPng, toJpeg, toSvg } = await import('html-to-image')
      resources.check()
      const render = options.format === 'svg' ? toSvg : options.format === 'jpeg' ? toJpeg : toPng
      const url = await render(mounted.element, { pixelRatio: options.pixelRatio ?? 2, skipAutoScale: true, backgroundColor: page.background })
      resources.check()
      const blob = await fetch(url, { signal: options.signal }).then(response => response.blob())
      resources.progress(1)
      return { blob, filename: exportFilename(page.title, options.format), warnings: [...resources.warnings] }
    } finally { mounted.dispose() }
  } finally { resources.dispose() }
}
