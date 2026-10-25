import { validateManifest } from '../../../shared/release/protocol'

export type ReleaseServiceBinding = { fetch(request: Request): Promise<Response> }
export type ReleaseClientEnv = {
  RELEASE_CONTROLLER_ENABLED?: string
  RELEASE_SERVICE?: ReleaseServiceBinding
  RELEASE_API_URL?: string
  RELEASE_API_TOKEN?: string
  RELEASE_ADMIN_TOKEN?: string
}
export type ReleaseMethod = 'plan' | 'submit' | 'get' | 'watch' | 'resume' | 'recover'
export type ReleaseInput = { manifest?: unknown; releaseId?: string; after?: number }
const releaseId = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,95}$/

async function json(response: Response) {
  const reader = response.body?.getReader()
  let text = ''
  const decoder = new TextDecoder()
  if (reader) {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      text += decoder.decode(value, { stream: true })
      if (text.length > 262144) { await reader.cancel(); throw new Error('RELEASE_RESPONSE_TOO_LARGE') }
    }
    text += decoder.decode()
  }
  let value: { error?: string }
  try { value = JSON.parse(text) as { error?: string } } catch { throw new Error('RELEASE_RESPONSE_INVALID') }
  if (!response.ok) throw new Error(typeof value.error === 'string' && /^[A-Z][A-Z0-9_]{0,95}$/.test(value.error) ? value.error : `RELEASE_HTTP_${response.status}`)
  return value
}

/** Fixed protocol paths; bindings own endpoint and credentials, never tool args. */
export async function callRelease(env: ReleaseClientEnv, method: ReleaseMethod, input: ReleaseInput = {}, fetcher: typeof fetch = fetch): Promise<unknown> {
  if (!['plan', 'submit', 'get', 'watch', 'resume', 'recover'].includes(method)) throw new Error('UNKNOWN_RELEASE_METHOD')
  if (['submit', 'resume', 'recover'].includes(method) && env.RELEASE_CONTROLLER_ENABLED !== 'true') throw new Error('RELEASE_CONTROLLER_NOT_ENABLED')
  const recovery = method === 'resume' || method === 'recover'
  const token = recovery ? env.RELEASE_ADMIN_TOKEN : env.RELEASE_API_TOKEN
  if (!token) throw new Error('RELEASE_CREDENTIAL_MISSING')
  let base: URL
  try { base = new URL(env.RELEASE_API_URL || (env.RELEASE_SERVICE ? 'https://release.internal' : '')) } catch { throw new Error('INVALID_RELEASE_ORIGIN') }
  if (base.protocol !== 'https:' || base.username || base.password || base.pathname !== '/' || base.search || base.hash) throw new Error('INVALID_RELEASE_ORIGIN')
  const takesManifest = method === 'plan' || method === 'submit'
  if (!takesManifest && !releaseId.test(input.releaseId ?? '')) throw new Error('INVALID_RELEASE_ID')
  const after = input.after ?? 0
  if (!Number.isSafeInteger(after) || after < 0) throw new Error('INVALID_EVENT_CURSOR')
  const path = method === 'plan' ? '/v1/plan' : method === 'submit' ? '/v1/releases' :
    `/v1/releases/${input.releaseId}${method === 'watch' ? `/events?after=${after}` : method === 'get' ? '' : `/${method}`}`
  const write = takesManifest || recovery
  const body = takesManifest ? JSON.stringify(validateManifest(input.manifest)) : recovery ? '{}' : undefined
  const request = new Request(new URL(path, base), { method: write ? 'POST' : 'GET', headers: { authorization: `Bearer ${token}`, accept: 'application/json', ...(write ? { 'content-type': 'application/json' } : {}) }, body, redirect: 'manual', signal: AbortSignal.timeout(30000) })
  let response
  try { response = env.RELEASE_SERVICE ? await env.RELEASE_SERVICE.fetch(request) : await fetcher(request) }
  catch { throw new Error('RELEASE_REQUEST_UNCERTAIN') }
  if (response.status >= 300 && response.status < 400) { await response.body?.cancel(); throw new Error('RELEASE_REDIRECT_REJECTED') }
  return json(response)
}
