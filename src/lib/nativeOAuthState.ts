const AUTH_NONCE_TTL_MS = 10 * 60 * 1000
const AUTH_CALLBACK_PATTERN = /^lingxiloop:\/\/auth(?:[/?#]|$)/i

interface ArmedAuth {
  nonce: string
  expiresAt: number
}

export interface NativeOAuthCallback {
  /** Fragment to plant on the renderer URL, including the leading #. */
  hash: string
}

let armedAuth: ArmedAuth | null = null

function randomNonce(): string {
  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** Arm one mobile login attempt. A later attempt supersedes the old one. */
export function armNativeOAuth(now = Date.now()): string {
  const nonce = randomNonce()
  armedAuth = { nonce, expiresAt: now + AUTH_NONCE_TTL_MS }
  return nonce
}

function equalNonce(actual: string, expected: string): boolean {
  if (actual.length !== expected.length) return false
  let difference = 0
  for (let i = 0; i < actual.length; i++) {
    difference |= actual.charCodeAt(i) ^ expected.charCodeAt(i)
  }
  return difference === 0
}

/**
 * Validate and consume an OAuth callback against the in-memory login attempt.
 * Missing/mismatched callbacks do not consume a valid pending attempt; a match
 * does, making replay impossible. Expired state is cleared eagerly.
 */
export function consumeNativeOAuthCallback(
  rawUrl: string,
  now = Date.now(),
): NativeOAuthCallback | null {
  if (!AUTH_CALLBACK_PATTERN.test(rawUrl)) return null
  const pending = armedAuth
  if (!pending) return null
  if (now > pending.expiresAt) {
    armedAuth = null
    return null
  }

  const hashIndex = rawUrl.indexOf('#')
  const queryIndex = rawUrl.indexOf('?')
  const queryEnd = hashIndex >= 0 ? hashIndex : rawUrl.length
  const query = queryIndex >= 0 && queryIndex < queryEnd
    ? rawUrl.slice(queryIndex + 1, queryEnd)
    : ''
  const nonce = new URLSearchParams(query).get('n')
  if (!nonce || !equalNonce(nonce, pending.nonce)) return null

  // The server always appends the OAuth result as a fragment after the
  // nonce-bearing return URL. Do not burn the pending attempt on an empty URL.
  if (hashIndex < 0 || hashIndex === rawUrl.length - 1) return null
  const hash = rawUrl.slice(hashIndex)

  armedAuth = null
  return { hash }
}

export function clearNativeOAuthForTest(): void {
  armedAuth = null
}
