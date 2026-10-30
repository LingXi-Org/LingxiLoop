import type { ViewerSource } from './viewer-source'

export function scopePreviewSource(source: ViewerSource): ViewerSource {
  return { ...source, identityKey: crypto.randomUUID() }
}
