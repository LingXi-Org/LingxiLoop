/** Merge caller headers without discarding unrelated auth/tenant defaults. */
export function mergeRequestHeaders(
  defaults: HeadersInit,
  overrides?: HeadersInit,
): Headers {
  const merged = new Headers(defaults)
  new Headers(overrides).forEach((value, key) => {
    merged.set(key, value)
  })
  return merged
}

/** Fetch a LingxiLoop API URL through the single Web/Electron transport. */
export async function lingxiApiFetch(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(url, init)
}

/** Raw Blob PUT used only for presigned object-storage uploads. */
export function putPresignedFile(
  uploadUrl: string,
  file: File,
  mime: string,
  browserFetch: typeof fetch = fetch,
): Promise<Response> {
  return browserFetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': mime },
    body: file,
  })
}
