import { useAuth } from '@/stores/auth'
import { artifactsApi } from '@/features/artifacts/api'
import type { ArtifactEditorGrant, ArtifactKind } from './contracts'

// Each grant has its own editor origin, but every editor's code, styles and
// fonts are on shared, immutable public URLs of this same site: fetched once
// here, they are in the HTTP cache every editor frame reads from.
let preloads: Promise<Record<ArtifactKind, string[]>> | undefined
const warmed = new Map<string, Promise<void>>()
const idle = new Set<ArtifactKind>()

/** Fetches an editor's blocking code, styles and first-view fonts into the HTTP cache. */
export function warmEditor(kind: ArtifactKind, priority: RequestPriority = 'high'): Promise<void> {
  preloads ??= fetch('/artifact-editor/preload.json', { credentials: 'omit', priority })
    .then(response => response.ok ? response.json() as Promise<Record<ArtifactKind, string[]>> : Promise.reject(new Error(`preload ${response.status}`)))
  const list = preloads
  list.catch(() => { if (preloads === list) preloads = undefined })
  const result = list.then(urls => Promise.all(urls[kind].map((url) => {
    let pending = warmed.get(url)
    if (!pending) {
      // Same request mode as the editor's module, stylesheet and font loads.
      pending = fetch(url, { mode: 'cors', credentials: 'omit', priority }).then(response => {
        if (!response.ok || !response.body) throw new Error(`preload ${response.status}`)
        return response.body.pipeTo(new WritableStream())
      })
      const settled = pending
      settled.catch(() => { if (warmed.get(url) === settled) warmed.delete(url) })
      warmed.set(url, pending)
    }
    return pending
  }))).then(() => undefined)
  return result
}

/** Warms an editor once the page is idle, unless the connection asks to save data. */
export function warmEditorWhenIdle(kind: ArtifactKind) {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection
  if (idle.has(kind) || connection?.saveData || /2g$/.test(connection?.effectiveType ?? '')) return
  idle.add(kind)
  const start = () => { void warmEditor(kind, 'low').catch(() => idle.delete(kind)) }
  setTimeout(() => typeof requestIdleCallback === 'function' ? requestIdleCallback(start, { timeout: 10_000 }) : start(), 2_000)
}

// A grant is reused briefly (an intent followed by the open, or a quick
// reopen) so the frame keeps its origin and connection. Reuse stays short so a
// changed access mode is picked up; every editor request re-checks access.
const GRANT_REUSE_MS = 10 * 60_000
const grants = new Map<string, { grant: Promise<ArtifactEditorGrant>; issuedAt: number }>()
const connected = new Set<string>()

export function editorGrant(artifactId: string, fresh = false): Promise<ArtifactEditorGrant> {
  const { user, activeCompanyId } = useAuth.getState()
  const key = JSON.stringify([user?.id ?? null, activeCompanyId ?? null, artifactId])
  const cached = grants.get(key)
  if (!fresh && cached && Date.now() - cached.issuedAt < GRANT_REUSE_MS) return cached.grant
  const entry = { grant: artifactsApi.editorGrant(artifactId, AbortSignal.timeout(30_000)), issuedAt: Date.now() }
  grants.set(key, entry)
  entry.grant.catch(() => { if (grants.get(key) === entry) grants.delete(key) })
  return entry.grant
}

/** Intent to open: start the grant and the editor's assets, and connect to its origin. */
export function prefetchEditor(kind: ArtifactKind, artifactId?: string) {
  void warmEditor(kind).catch(() => {})
  if (!artifactId) return
  void editorGrant(artifactId).then(({ url, isolatedUrl }) => {
    const origin = new URL(isolatedUrl ?? url, location.href).origin
    if (origin === location.origin || connected.has(origin)) return
    connected.add(origin)
    const link = document.createElement('link')
    link.rel = 'preconnect'
    link.href = origin
    document.head.append(link)
  }, () => {})
}
