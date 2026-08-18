/**
 * Local avatar cache.
 *
 * Holds participants' avatars as `URL.createObjectURL(blob)` keyed by
 * participant id. Subscribed React components (via `useCachedAvatarSrc`)
 * re-render automatically when the server broadcasts
 * `participants.avatar` for that id (the participants store calls
 * `invalidateAvatar(id)` from its WS listener).
 *
 * Falls back gracefully on fetch failure: the hook just emits the raw
 * remote URL so the browser's native `<img>` fetch can still try.
 *
 * Revocation discipline: an objectUrl that's currently the `src` of a
 * mounted <img> must NOT be revoked synchronously — the browser will
 * fail to render and React state still pointing at the dead URL would
 * surface as a broken-image fallback. We always schedule revocation
 * with a grace window (REVOKE_GRACE_MS) so subscribers have time to
 * swap to the new objectUrl first.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { isNativePlatform } from './native'

interface Entry {
  /** The remote URL we fetched FROM — used to invalidate when the URL
   *  changes (e.g., participant's `avatar_url` updated to a new key). */
  fetchedFrom: string
  /** `URL.createObjectURL(blob)` ready to drop into <img src=…>. */
  objectUrl: string
  fetchedAt: number
}

const cache = new Map<string, Entry>()
const listeners = new Set<(participantId: string | null) => void>()

/** Grace window before revoking an objectUrl that has been displaced.
 *  Has to outlast React's render cycle so any <img> still pointing at
 *  the old URL gets a chance to swap. A few seconds is plenty. */
const REVOKE_GRACE_MS = 5_000

function scheduleRevoke(objectUrl: string): void {
  setTimeout(() => URL.revokeObjectURL(objectUrl), REVOKE_GRACE_MS)
}

async function fetchAndCache(participantId: string, url: string): Promise<string> {
  const prev = cache.get(participantId)
  if (prev && prev.fetchedFrom === url) return prev.objectUrl
  try {
    const r = await fetch(url)
    if (!r.ok) {
      // Fetch failed — keep prev as-is rather than orphaning the cache.
      // Callers fall back to the raw URL for this render.
      return url
    }
    const b = await r.blob()
    const objectUrl = URL.createObjectURL(b)
    cache.set(participantId, { fetchedFrom: url, objectUrl, fetchedAt: Date.now() })
    // Now that the new entry is in place, retire the old one with a
    // grace window so any mounted <img> can swap first.
    if (prev) scheduleRevoke(prev.objectUrl)
    return objectUrl
  } catch {
    return url
  }
}

function notify(participantId: string | null): void {
  for (const fn of listeners) fn(participantId)
}

/** Drop a single participant's cached avatar — called by the
 *  participants store when a `participants.avatar` WS event lands.
 *  Subscribed hooks pick up the change and re-fetch with the new URL. */
export function invalidateAvatar(participantId: string): void {
  const e = cache.get(participantId)
  if (e) {
    cache.delete(participantId)
    scheduleRevoke(e.objectUrl)
  }
  notify(participantId)
}

/** Drop the entire cache. Used by workspace switch (the participants
 *  store's load() / reset path). Old objectUrls are scheduled for
 *  revoke, not revoked synchronously — see REVOKE_GRACE_MS. */
export function clearAvatarCache(): void {
  for (const e of cache.values()) scheduleRevoke(e.objectUrl)
  cache.clear()
  notify(null)
}

/**
 * Hook: returns the cached object-URL for a participant's avatar, or
 * the raw URL while the first fetch is in flight (so the browser still
 * paints something instead of blanking). Refetches whenever:
 *   - the participant id or URL prop changes, OR
 *   - invalidateAvatar(participantId) is called, OR
 *   - clearAvatarCache() fires.
 *
 * Returns null when the participant has no avatar URL configured.
 */
const AVATAR_MAX_RETRIES = 3

/** Bounded-but-revivable retry for an avatar `<img>` load.
 *
 *  On native the raw CDN URL is handed straight to `<img>` (see
 *  `useCachedAvatarSrc` below). iOS makes one-shot loading hopeless:
 *  the WebView resumes before the radio on cold start, and WKWebView
 *  kills in-flight image loads when the app backgrounds. A single
 *  `onError` used to latch the initial-letter fallback PERMANENTLY —
 *  the URL rarely changes, so the reset-on-src-change never fired and
 *  every avatar in the session stayed a letter. That's the "iOS never
 *  fetches the real avatar" bug.
 *
 *  Strategy: retry the SAME url a few times with a short backoff by
 *  remounting the `<img>` (key bump). If all attempts fail, give up —
 *  but re-open a fresh retry epoch whenever the app returns to the
 *  foreground or the network comes back, instead of staying broken
 *  for the rest of the session. Resets cleanly whenever the resolved
 *  src changes (regenerated avatar / workspace switch). */
export function useAvatarImg(cachedSrc: string | null): {
  showImg: boolean
  imgKey: string
  onError: () => void
} {
  const [key, setKey] = useState(0)
  const [broke, setBroke] = useState(false)
  const attemptsRef = useRef(0)
  useEffect(() => {
    attemptsRef.current = 0
    setBroke(false)
    setKey(0)
  }, [cachedSrc])
  const reopen = useCallback(() => {
    attemptsRef.current = 0
    setBroke(false)
    setKey((k) => k + 1)
  }, [])
  // Only latched-broken avatars listen for a wake signal, so a long
  // virtualized list doesn't pay for listeners it doesn't need.
  useEffect(() => {
    if (!broke) return
    const onVisible = () => { if (document.visibilityState === 'visible') reopen() }
    window.addEventListener('online', reopen)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('online', reopen)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [broke, reopen])
  const onError = useCallback(() => {
    if (attemptsRef.current >= AVATAR_MAX_RETRIES) { setBroke(true); return }
    attemptsRef.current += 1
    // Backoff (500ms, 1s, 1.5s) gives a cold-start radio a beat to come
    // up before we remount the <img> and re-request the same URL.
    window.setTimeout(() => setKey((k) => k + 1), 500 * attemptsRef.current)
  }, [])
  return { showImg: Boolean(cachedSrc) && !broke, imgKey: `${cachedSrc ?? ''}#${key}`, onError }
}

/** `loading` attribute for avatar <img>s. WKWebView's lazy loader can
 *  silently never fire inside transformed/virtualized scroll containers
 *  (the row count is already bounded by virtualization, so eager is
 *  cheap there); browsers keep the lazy win. */
export const AVATAR_IMG_LOADING: 'eager' | 'lazy' = isNativePlatform() ? 'eager' : 'lazy'

export function useCachedAvatarSrc(
  participantId: string,
  url: string | null | undefined,
): string | null {
  // On native (iOS/Android) skip the fetch→blob cache entirely and hand the
  // raw CDN URL straight to <img>. Two reasons: (1) with CapacitorHttp enabled
  // every `fetch()` is proxied through the slow JS↔native bridge (and stampedes
  // when many avatars mount at once), whereas <img> loads go through the
  // WebView's native image pipeline — fast and HTTP-cached; (2) it sidesteps
  // the cache-stampede of N components fetching the same URL before it's cached.
  // Invalidation still works: a regenerated avatar gets a new URL, so the prop
  // changes and <img> reloads.
  const native = isNativePlatform()

  const initial = (() => {
    if (!url) return null
    if (native) return url
    const e = cache.get(participantId)
    if (e && e.fetchedFrom === url) return e.objectUrl
    return url
  })()
  const [src, setSrc] = useState<string | null>(initial)

  useEffect(() => {
    if (!url) { setSrc(null); return }
    if (native) { setSrc(url); return }
    let cancelled = false
    const refresh = () => {
      void fetchAndCache(participantId, url).then((s) => {
        if (!cancelled) setSrc(s)
      })
    }
    refresh()
    const onChange = (id: string | null) => {
      if (id === null || id === participantId) refresh()
    }
    listeners.add(onChange)
    return () => {
      cancelled = true
      listeners.delete(onChange)
    }
  }, [participantId, url, native])

  return src
}
