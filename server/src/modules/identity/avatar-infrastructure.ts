import type { Storage } from '../../storage.js'

const AVATAR_MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

const AVATAR_MAX_BYTES = 2 * 1024 * 1024
const AVATAR_FETCH_TIMEOUT_MS = 5_000

/** Re-host a human identity avatar on the canonical object store. */
export async function mirrorIdentityAvatar(
  storage: Storage,
  userId: string,
  providerUrl: string | null,
): Promise<string | null> {
  if (!providerUrl) return null
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), AVATAR_FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(providerUrl, {
      signal: ctl.signal,
      headers: { 'user-agent': 'lingxiloop' },
    })
    if (!response.ok) throw new Error(`avatar fetch failed: HTTP ${response.status}`)
    const mime = (response.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase()
    const ext = AVATAR_MIME_TO_EXT[mime]
    if (!ext) throw new Error(`unsupported avatar content type: ${mime || 'missing'}`)
    const body = await response.arrayBuffer()
    if (body.byteLength > AVATAR_MAX_BYTES) throw new Error('avatar exceeds 2 MB')
    return storage.put(`avatars/${userId}.${ext}`, Buffer.from(body), mime)
  } finally {
    clearTimeout(timer)
  }
}
