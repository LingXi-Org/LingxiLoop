import type { ArtifactDocument } from '../../../../../shared/artifact-document'
import { artifactPageBackground } from '../../../../../shared/artifact-themes'
import type { ArtifactExportOptions, ArtifactExportResult } from '../export-artifact'
import { exportFilename, ExportResources } from './common'
import { mountExportPage, pageText } from './render'
import type { PdfPageImage } from './pdf-writer'

function packPdf(pages: PdfPageImage[], title: string, signal?: AbortSignal): Promise<ArrayBuffer> {
  signal?.throwIfAborted()
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./pdf.worker.ts', import.meta.url), { type: 'module' })
    const cleanup = () => { worker.terminate(); signal?.removeEventListener('abort', aborted) }
    const aborted = () => { cleanup(); reject(signal?.reason ?? new DOMException('Export cancelled', 'AbortError')) }
    signal?.addEventListener('abort', aborted, { once: true })
    worker.onmessage = (event: MessageEvent<{ bytes?: ArrayBuffer; error?: string }>) => {
      cleanup()
      if (event.data.bytes) resolve(event.data.bytes)
      else reject(new Error(event.data.error ?? 'PDF 打包失败'))
    }
    worker.onerror = event => { cleanup(); reject(new Error(event.message)) }
    worker.postMessage({ pages, title }, pages.map(page => page.jpeg.buffer))
  })
}

export async function exportDocument(document: ArtifactDocument, options: ArtifactExportOptions): Promise<ArtifactExportResult> {
  const resources = new ExportResources(document, options)
  const pages: PdfPageImage[] = []
  try {
    const { toJpeg } = await import('html-to-image')
    for (const [index, id] of document.pageOrder.entries()) {
      resources.check()
      const page = document.pages[id]!, mounted = await mountExportPage(page, resources)
      const background = artifactPageBackground(page, document)
      try {
        const bounds = mounted.element.getBoundingClientRect()
        const links = [...mounted.element.querySelectorAll('a[href]')].map(anchor => {
          const rect = anchor.getBoundingClientRect()
          return { href: anchor.getAttribute('href')!, x: rect.x - bounds.x, y: rect.y - bounds.y, width: rect.width, height: rect.height }
        })
        const flow = page.sizing === 'flow'
        const sheetHeight = flow ? page.paper === 'A4' ? page.width * 1123 / 794 : page.paper === 'Letter' ? page.width * 1056 / 816 : page.height : page.height
        const contentHeight = flow ? Math.max(page.height, mounted.element.scrollHeight) : page.height
        mounted.viewport.style.cssText = `position:relative;overflow:hidden;width:${page.width}px;height:${sheetHeight}px;background:${background}`
        if (flow) { mounted.element.style.height = `${contentHeight}px`; mounted.element.style.overflow = 'visible' }
        for (let offset = 0; offset < contentHeight; offset += sheetHeight) {
          mounted.element.style.transform = `translateY(${-offset}px)`
          const data = await toJpeg(mounted.viewport, { quality: .94, pixelRatio: 1, width: page.width, height: sheetHeight, backgroundColor: background, skipAutoScale: true })
          resources.check()
          const binary = atob(data.slice(data.indexOf(',') + 1)), jpeg = Uint8Array.from(binary, character => character.charCodeAt(0))
          pages.push({ width: page.width, height: sheetHeight, jpeg, text: offset === 0 ? pageText(page) : '',
            links: links.filter(link => link.y >= offset && link.y < offset + sheetHeight).map(link => ({ ...link, y: link.y - offset })) })
        }
      } finally { mounted.dispose() }
      resources.progress(index + 1)
    }
    resources.check()
    const bytes = await packPdf(pages, document.title, options.signal)
    return { blob: new Blob([bytes], { type: 'application/pdf' }), filename: exportFilename(document.title, 'pdf'), warnings: [...resources.warnings] }
  } finally { resources.dispose(); pages.length = 0 }
}
