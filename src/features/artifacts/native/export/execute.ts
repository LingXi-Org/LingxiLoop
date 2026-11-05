import type { ArtifactDocument } from '../../../../../shared/artifact-document'
import type { ArtifactExportOptions, ArtifactExportResult } from '../export-artifact'

/** Only a fresh trusted export realm (or the DOM-free unit runner) calls adapters. */
export async function executeExport(document: ArtifactDocument, options: ArtifactExportOptions): Promise<ArtifactExportResult> {
  options.signal?.throwIfAborted()
  const adapter = options.format === 'html' ? await import('./html')
    : options.format === 'pdf' ? await import('./pdf') : await import('./pptx')
  options.signal?.throwIfAborted()
  return adapter.exportDocument(document, options)
}
