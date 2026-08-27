import { useEffect, useState } from 'react'
import { http } from '@/api/core/http'
import { trimUrlTrailing } from '@/lib/utils'
import { ResourceSkeleton } from '@/components/ResourceSkeleton'
import { LinkPreview as ToolUiLinkPreview } from './tool-ui/link-preview'

/**
 * Inline OG card rendered under a chat bubble when its body contains a URL.
 *
 * Only the FIRST URL in a message gets a card — Slack / iMessage default,
 * and the right one here too: chat messages with many links almost always
 * mean "here are some references", which doesn't need a card stack.
 *
 * Resolution flow:
 *   1. Module-scope `cache` keyed by URL — mounted/unmounted bubbles share
 *      the same fetched data so scrolling in/out of view never re-fetches.
 *   2. While loading, reserve one bounded card footprint with the shared
 *      resource skeleton so virtualized rows do not jump when metadata lands.
 *   3. On success: card with image (if any) + site name + title +
 *      description, clickable to open the URL in a new tab.
 *   4. On failure / no useful metadata: render nothing so the bubble looks
 *      exactly like before the feature shipped.
 *
 * The server endpoint (/api/og) does its own Redis-backed caching with a
 * 7-day TTL; the in-memory cache here only avoids redundant work during
 * one session.
 */

interface OgData {
  url: string
  title?: string
  description?: string
  image?: string
  siteName?: string
  finalUrl?: string
  empty?: boolean
}

/** Module-scope cache. Plain Map is fine — entries are tiny and the page
 *  lifespan is short. Cleared on full reload. */
const cache = new Map<string, OgData | null>()
/** In-flight de-dupe: if the same URL appears 10 times in a transcript, we
 *  fire one request, not ten. The pending Promise resolves to the result
 *  the same way the cache entry would. */
const inflight = new Map<string, Promise<OgData | null>>()

async function fetchOg(url: string): Promise<OgData | null> {
  if (cache.has(url)) return cache.get(url) ?? null
  const existing = inflight.get(url)
  if (existing) return existing
  const p = (async () => {
    try {
      const data = await http<OgData>(`/og?url=${encodeURIComponent(url)}`)
      const useful = data && !data.empty && (data.title || data.image)
      const result = useful ? data : null
      cache.set(url, result)
      return result
    } catch {
      cache.set(url, null)
      return null
    } finally {
      inflight.delete(url)
    }
  })()
  inflight.set(url, p)
  return p
}

export function LinkPreview({ url }: { url: string }) {
  // Sync initial state from cache to avoid a one-frame flash when the
  // bubble re-mounts (e.g. virtualized list scrolls a row back into view).
  const [data, setData] = useState<OgData | null>(() => cache.get(url) ?? null)
  const [loaded, setLoaded] = useState(() => cache.has(url))

  useEffect(() => {
    if (cache.has(url)) {
      setData(cache.get(url) ?? null)
      setLoaded(true)
      return
    }
    let cancelled = false
    void fetchOg(url).then((d) => {
      if (cancelled) return
      setData(d)
      setLoaded(true)
    })
    return () => { cancelled = true }
  }, [url])

  if (!loaded) return <ResourceSkeleton variant="cards" count={1} className="mt-2 max-w-md" label="正在加载链接预览" />
  if (!data || (!data.title && !data.image)) return null

  // Hostname for the "from foo.com" caption — preferred over og:site_name
  // when the latter is missing, since users recognize hostnames.
  const host = new URL(data.finalUrl ?? data.url).hostname.replace(/^www\./, '')

  return <ToolUiLinkPreview
    id={`link-preview-${encodeURIComponent(data.finalUrl ?? data.url).slice(0, 80)}`}
    role="information"
    href={data.finalUrl ?? data.url}
    title={data.title}
    description={data.description}
    image={data.image}
    domain={data.siteName ?? host}
    fit="cover"
    className="mt-2"
  />
}

/** Pull the first http(s) URL out of a message body. Returns null when the
 *  body has no link; used by the bubble to decide whether to mount a
 *  LinkPreview at all. Mirrors the regex in `parseBody` so what we render
 *  as a link in the inline pass is the same thing we expand into a card. */
export function firstUrlInBody(body: string): string | null {
  const m = body.match(/\bhttps?:\/\/[^\s<>"'`]+/)
  if (!m) return null
  // Use the exact same ASCII + full-width punctuation handling as inline
  // links. This prevents `google.com，` becoming `google.xn--com,-...` when
  // the card request passes through the browser URL parser.
  return trimUrlTrailing(m[0]).url
}
