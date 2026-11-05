import type { ArtifactAsset, ArtifactDocument } from '../../../../shared/artifact-document'

export type ArtifactExportFormat = 'html' | 'pdf' | 'pptx'
export interface ArtifactExportOptions {
  format: ArtifactExportFormat
  resolveAsset?: (asset: ArtifactAsset, signal?: AbortSignal) => Promise<Blob>
  signal?: AbortSignal
  onProgress?: (completed: number, total: number) => void
}
export interface ArtifactExportResult { blob: Blob; filename: string; warnings: string[] }

/** Each adapter is a separate lazy chunk and sees a frozen copy, never the editor store. */
export async function exportArtifact(document: ArtifactDocument, options: ArtifactExportOptions): Promise<ArtifactExportResult> {
  options.signal?.throwIfAborted()
  const snapshot = structuredClone(document)
  const adapter = options.format === 'html' ? await import('./export/html')
    : options.format === 'pdf' ? await import('./export/pdf') : await import('./export/pptx')
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
