import type { HttpOptions, HttpResponse } from '@capacitor/core'
import { isCapacitorNative } from '@/lib/runtime'

type NativeRequest = (options: HttpOptions) => Promise<HttpResponse>

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

async function defaultNativeRequest(options: HttpOptions): Promise<HttpResponse> {
  const { CapacitorHttp } = await import('@capacitor/core')
  return CapacitorHttp.request(options)
}

function responseBody(data: unknown, status: number): BodyInit | null {
  if (status === 204 || status === 205 || status === 304) return null
  if (data == null) return null
  if (typeof data === 'string') return data
  return JSON.stringify(data)
}

/**
 * Fetch a LingxiLoop API URL. Native shells call CapacitorHttp explicitly so
 * ordinary JSON traffic bypasses CORS without globally patching window.fetch.
 * Presigned Blob uploads intentionally do not use this transport.
 */
export async function lingxiApiFetch(
  url: string,
  init: RequestInit = {},
  runtime: { native?: boolean; nativeRequest?: NativeRequest } = {},
): Promise<Response> {
  const native = runtime.native ?? isCapacitorNative
  if (!native) return fetch(url, init)
  if (init.signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError')
  if (init.body != null && typeof init.body !== 'string') {
    throw new TypeError('Native LingxiLoop API requests require a serialized string body')
  }

  const headers = Object.fromEntries(new Headers(init.headers).entries())
  const request = runtime.nativeRequest ?? defaultNativeRequest
  const result = await request({
    url,
    method: init.method ?? 'GET',
    headers,
    data: init.body ?? undefined,
    responseType: 'text',
  })
  return new Response(responseBody(result.data, result.status), {
    status: result.status,
    headers: result.headers,
  })
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
