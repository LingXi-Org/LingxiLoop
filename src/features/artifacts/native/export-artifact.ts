import { runArtifactRealm } from './artifact-realm'
import { exportPages } from './export-pages'
import type { ArtifactAsset, ArtifactDocument } from '../../../../shared/artifact-document'

export type ArtifactExportFormat = 'html' | 'pdf' | 'pptx' | 'png' | 'jpeg' | 'svg'
export interface ArtifactExportOptions {
  format: ArtifactExportFormat
  pixelRatio?: 1 | 2
  htmlArchive?: boolean
  resolveAsset?: (asset: ArtifactAsset, signal?: AbortSignal) => Promise<Blob>
  signal?: AbortSignal
  onProgress?: (completed: number, total: number) => void
}
export interface ArtifactExportResult { blob: Blob; filename: string; warnings: string[] }

/** A new trusted realm per attempt also resets failed shared/inner ES-module loads. */
export async function exportArtifact(document: ArtifactDocument, options: ArtifactExportOptions): Promise<ArtifactExportResult> {
  options.signal?.throwIfAborted()
  const snapshot = structuredClone(exportPages(document, options.format))
  return runArtifactRealm({type:'start',document:snapshot,format:options.format,pixelRatio:options.pixelRatio,htmlArchive:options.htmlArchive},options)
}

export function downloadArtifactExport(result: ArtifactExportResult) {
  const url = URL.createObjectURL(result.blob)
  const anchor = document.createElement('a')
  anchor.href = url; anchor.download = result.filename
  document.body.append(anchor); anchor.click(); anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
