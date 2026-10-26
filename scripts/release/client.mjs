import { readFile } from 'node:fs/promises'

const methods = new Set(['plan', 'submit', 'get', 'watch', 'resume', 'recover', 'accepted'])
export async function callRelease(method, { manifest, releaseId, after = 0 } = {}, options = {}) {
  if (!methods.has(method)) throw new Error('UNKNOWN_RELEASE_METHOD')
  const origin = new URL(options.url ?? process.env.RELEASE_API_URL ?? '')
  if (origin.protocol !== 'https:' && !(origin.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(origin.hostname))) throw new Error('HTTPS_REQUIRED')
  if (origin.username || origin.password || origin.pathname !== '/') throw new Error('INVALID_RELEASE_ORIGIN')
  const token = options.token ?? (['resume', 'recover'].includes(method) ? process.env.RELEASE_ADMIN_TOKEN : process.env.RELEASE_API_TOKEN)
  if (!token) throw new Error('RELEASE_CREDENTIAL_MISSING')
  if (releaseId !== undefined && !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,95}$/.test(releaseId)) throw new Error('INVALID_RELEASE_ID')
  const path = method === 'accepted' ? '/v1/accepted' : method === 'plan' ? '/v1/plan' : method === 'submit' ? '/v1/releases' : `/v1/releases/${releaseId}${method === 'watch' ? `/events?after=${Number(after)}` : method === 'get' ? '' : `/${method}`}`
  const write = ['plan', 'submit', 'resume', 'recover'].includes(method)
  const response = await (options.fetch ?? fetch)(new URL(path, origin), {
    method: write ? 'POST' : 'GET', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: write ? JSON.stringify(manifest ?? {}) : undefined, redirect: 'error', signal: AbortSignal.timeout(Math.max(1,Math.min(30_000,options.timeoutMs ?? 30_000))),
  })
  const result = await response.json()
  if (!response.ok) throw Object.assign(new Error(result.error ?? 'RELEASE_REQUEST_FAILED'), { code: result.error, status: response.status })
  return result
}
export async function readManifest(path) { return JSON.parse(await readFile(path, 'utf8')) }
