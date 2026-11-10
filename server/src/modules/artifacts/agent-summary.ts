import type { NativeDocumentSnapshot, readNativePageSnapshot } from './native-document.js'

/** Keep the overview bounded: page content and its CAS tokens are read at a fixed sequence separately. */
export function agentDocumentSummary(snapshot: NativeDocumentSnapshot) {
  const { pages, themes, assets, versions, ...metadata } = snapshot.document
  return {
    history: snapshot.history, pageVersions: snapshot.pageVersions,
    ...(snapshot.original && !Object.keys(snapshot.pageVersions).length ? { sourceVersion: snapshot.original.version } : {}),
    document: {
      ...metadata,
      themes: Object.fromEntries(Object.entries(themes).map(([id, theme]) => [id, {
        id, name: theme.name, source: theme.source, tokenCount: Object.keys(theme.tokens).length,
        tokenPreview: Object.fromEntries(Object.entries(theme.tokens).filter(([key]) => !key.includes('.') || key.startsWith('font.')).slice(0, 16)),
      }])),
      assets: Object.fromEntries(Object.entries(assets).map(([id, asset]) => [id, {
        id, contentType: asset.contentType, sha256: asset.sha256, width: asset.width, height: asset.height,
      }])),
      versions: Object.fromEntries(Object.entries(versions).filter(([key]) => /^(document|theme|asset|canvasPage)\//.test(key))),
      pages: Object.fromEntries(Object.entries(pages).map(([id, page]) => [id, {
        id, title: page.title, width: page.width, height: page.height, x: page.x, y: page.y, ...(page.canvasPageId?{canvasPageId:page.canvasPageId}:{}), nodeCount: page.nodeOrder.length,
      }])),
    },
  }
}

/** Pinned identity precedes page content; operation preparation owns CAS counters. */
export function agentPageSummary(snapshot: NonNullable<Awaited<ReturnType<typeof readNativePageSnapshot>>>) {
  return { seq: snapshot.seq, version: snapshot.version, versions: snapshot.versions, page: snapshot.page }
}
