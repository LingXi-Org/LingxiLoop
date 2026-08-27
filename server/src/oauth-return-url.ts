/**
 * Compare an OAuth return URL with one configured allow-list entry using URL
 * semantics. Query parameters are intentionally not part of the boundary:
 * clients use them for per-login state such as the Desktop nonce.
 */
export function matchesAllowedReturnUrl(candidateRaw: string, allowedRaw: string): boolean {
  let candidate: URL
  let allowed: URL
  try {
    candidate = new URL(candidateRaw)
    allowed = new URL(allowedRaw)
  } catch {
    return false
  }

  if (candidate.username || candidate.password || allowed.username || allowed.password) return false
  if (candidate.hash || allowed.hash) return false
  if (candidate.protocol !== allowed.protocol) return false
  if (candidate.hostname !== allowed.hostname) return false
  // URL.port normalizes explicit default ports (for example :443) to an
  // empty string, so this compares effective ports rather than formatting.
  if (candidate.port !== allowed.port) return false

  const allowedPath = allowed.pathname
  const candidatePath = candidate.pathname
  const pathAllowed = allowedPath.endsWith('/')
    ? candidatePath.startsWith(allowedPath)
    : candidatePath === allowedPath || candidatePath.startsWith(`${allowedPath}/`)
  if (!pathAllowed) return false

  // If an operator deliberately configured a query, require those exact
  // parameters. Entries without a query allow client-generated state params.
  if (allowed.search && candidate.search !== allowed.search) return false
  return true
}

export function isAllowedReturnUrl(candidate: string, allowlist: readonly string[]): boolean {
  if (!candidate) return false
  return allowlist.some((allowed) => matchesAllowedReturnUrl(candidate, allowed))
}
