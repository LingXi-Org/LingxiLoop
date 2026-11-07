import type { ArtifactDocument } from '../../../../../shared/artifact-document'
import type { ArtifactExportOptions, ArtifactExportResult } from '../export-artifact'

/** Only a fresh trusted export realm (or the DOM-free unit runner) calls adapters. */
export async function executeExport(document: ArtifactDocument, options: ArtifactExportOptions): Promise<ArtifactExportResult> {
  options.signal?.throwIfAborted()
  const adapter = options.format === 'html' ? await import('./html')
    : options.format === 'pdf' ? await import('./pdf') : options.format === 'pptx' ? await import('./pptx') : await import('./image')
  options.signal?.throwIfAborted()
  const result = await adapter.exportDocument(document, options)
  if (options.format !== 'html' || !options.htmlArchive) return result
  options.signal?.throwIfAborted()
  const { default: JSZip } = await import('jszip')
  const archive = new JSZip().file(result.filename, await result.blob.arrayBuffer())
  const bytes = await archive.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' })
  options.signal?.throwIfAborted()
  return { ...result, blob: new Blob([bytes], { type: 'application/zip' }), filename: result.filename.replace(/\.html$/i, '-html.zip') }
}
