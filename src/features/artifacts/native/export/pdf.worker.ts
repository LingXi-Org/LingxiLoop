import { encodeArtifactPdf, type PdfPageImage } from './pdf-writer'

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<{ pages: PdfPageImage[]; title: string }>) => void) | null
  postMessage: (message: unknown, transfer?: Transferable[]) => void
}
scope.onmessage = event => {
  try {
    const bytes = encodeArtifactPdf(event.data.pages, event.data.title)
    scope.postMessage({ bytes: bytes.buffer }, [bytes.buffer])
  } catch (error) { scope.postMessage({ error: error instanceof Error ? error.message : '便携文档导出失败。' }) }
}
