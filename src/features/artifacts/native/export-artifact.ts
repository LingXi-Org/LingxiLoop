import type { ArtifactAsset, ArtifactDocument } from '../../../../shared/artifact-document'

export type ArtifactExportFormat = 'html' | 'pdf' | 'pptx'
export interface ArtifactExportOptions {
  format: ArtifactExportFormat
  resolveAsset?: (asset: ArtifactAsset, signal?: AbortSignal) => Promise<Blob>
  signal?: AbortSignal
  onProgress?: (completed: number, total: number) => void
}
export interface ArtifactExportResult { blob: Blob; filename: string; warnings: string[] }

type ExportAdapter = typeof import('./export/html')
const loadedAdapters = new Map<ArtifactExportFormat, ExportAdapter>()
const failedChunks = new Map<ArtifactExportFormat, { url: string; attempts: number }>()
async function loadExportAdapter(format: ArtifactExportFormat): Promise<ExportAdapter> {
  const loaded = loadedAdapters.get(format)
  if (loaded) return loaded
  const failed = failedChunks.get(format)
  try {
    let adapter: ExportAdapter
    if (failed) {
      if (failed.attempts >= 2) throw new Error('导出组件仍未载入，请在文档保存后刷新再试。')
      const retry = new URL(failed.url)
      retry.searchParams.set('lingxi-export-retry', String(++failed.attempts))
      // Browsers retain rejected module-map entries for the lifetime of the page.
      // A bounded fresh URL retries the same immutable, same-origin format chunk.
      adapter = await import(/* @vite-ignore */ retry.href) as ExportAdapter
    } else {
      adapter = format === 'html' ? await import('./export/html')
        : format === 'pdf' ? await import('./export/pdf') : await import('./export/pptx')
    }
    failedChunks.delete(format)
    loadedAdapters.set(format, adapter)
    return adapter
  } catch (error) {
    if (!failed && typeof window !== 'undefined' && error instanceof Error) {
      const candidate = error.message.match(/https?:\/\/[^\s'"<>]+/)?.[0]
      if (candidate) {
        const url = new URL(candidate)
        // Never turn arbitrary error text into an executable import or retry a
        // dependency with a different contract as though it were a format adapter.
        if (url.origin === window.location.origin && new RegExp(`/${format}-[a-zA-Z0-9_-]+\\.js$`).test(url.pathname)) failedChunks.set(format, { url: url.href, attempts: 0 })
      }
    }
    throw error
  }
}

/** Each adapter is a separate lazy chunk and sees a frozen copy, never the editor store. */
export async function exportArtifact(document: ArtifactDocument, options: ArtifactExportOptions): Promise<ArtifactExportResult> {
  options.signal?.throwIfAborted()
  const snapshot = structuredClone(document)
  const adapter = await loadExportAdapter(options.format)
  options.signal?.throwIfAborted()
  return adapter.exportDocument(snapshot, options)
}

export function downloadArtifactExport(result: ArtifactExportResult) {
  const url = URL.createObjectURL(result.blob)
  const anchor = document.createElement('a')
  anchor.href = url; anchor.download = result.filename
  document.body.append(anchor); anchor.click(); anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
