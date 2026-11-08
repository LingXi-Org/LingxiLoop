import {artifactFontFamilyCensus} from '../../../../shared/artifact-font-families.js'
import {artifactPageIds,canvasPages,canvasPageOf} from '../../../../shared/artifact-canvas-pages.js'
import type { ArtifactDocument } from '../../../../shared/artifact-document.js'
import type { NativeDocumentSnapshot } from './native-document.js'
import { artifactPreviews } from '../../../../shared/artifact-previews.js'
import {artifactTypographyCensus} from '../../../../shared/artifact-typography.js'

/** Return the first editing surface in the bootstrap response, without loading other canvases. */
export function initialNativePageIds(document:ArtifactDocument):string[]{
  if(document.kind!=='design')return document.pageOrder.slice(0,1)
  const first=canvasPages(document)[0]
  const board=document.pageOrder.find(id=>canvasPageOf(document.pages[id])===first.id)
  return [first.contentId,board].filter((id):id is string=>!!id&&!!document.pages[id])
}

/** Read-only legacy conversion is ephemeral, so retain its data until it has immutable stored page hashes. */
export function projectNativeSnapshot<T extends NativeDocumentSnapshot>(snapshot: T, loadedIds: string[]) {
  const ephemeral = Boolean(snapshot.original) && !Object.keys(snapshot.pageVersions).length
  const loaded = new Set(ephemeral ? artifactPageIds(snapshot.document) : loadedIds)
  const pages: ArtifactDocument['pages'] = {}
  for (const [id, page] of Object.entries(snapshot.document.pages)) pages[id] = loaded.has(id) ? page : { ...page, nodeOrder: [], nodes: {} }
  return { ...snapshot, ...(snapshot.document.kind==='design'?{typography:artifactTypographyCensus(snapshot.document),fontFamilies:artifactFontFamilyCensus(snapshot.document)}:{}), previews: artifactPreviews(snapshot.document), document: { ...snapshot.document, pages }, loadedPageIds: [...loaded].filter(id => Boolean(pages[id])) }
}
