export function normalizeOpenlitUrl(value: string | undefined): string | undefined {
  const raw = value?.trim()
  if (!raw) return undefined
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined
    return url.toString()
  } catch {
    return undefined
  }
}
