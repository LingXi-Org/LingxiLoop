import type { ArtifactDocument } from '../../../../shared/artifact-document.js'
import type { NativeDocumentSnapshot } from './native-document.js'

/** Read-only legacy conversion is ephemeral, so retain its data until it has immutable stored page hashes. */
export function projectNativeSnapshot<T extends NativeDocumentSnapshot>(snapshot: T, loadedIds: string[]) {
  const ephemeral = Boolean(snapshot.original) && !Object.keys(snapshot.pageVersions).length
  const loaded = new Set(ephemeral ? snapshot.document.pageOrder : loadedIds)
  const pages: ArtifactDocument['pages'] = {}
  for (const [id, page] of Object.entries(snapshot.document.pages)) pages[id] = loaded.has(id) ? page : { ...page, nodeOrder: [], nodes: {} }
  return { ...snapshot, document: { ...snapshot.document, pages }, loadedPageIds: [...loaded].filter(id => Boolean(pages[id])) }
}
