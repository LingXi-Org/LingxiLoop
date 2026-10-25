import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs'
import { dirname } from 'node:path'
import { createHash } from 'node:crypto'

export const METADATA = '/workspace/scratch/handoff-495/cf-495.json'
export const DOMAIN = 'lingxilearn.cn'
export const HOSTS = ['a', 'b'].map(node => ({ node, name: `lingxiloop-release-${node}`, domain: `release-${node}.${DOMAIN}` }))
export class ProvisionError extends Error { constructor(code, target, status, detail) { super(code); Object.assign(this, { code, target, status, detail }) } }
export function journal(path = METADATA) {
  let state
  try { state = JSON.parse(readFileSync(path, 'utf8')) } catch { state = { version: 1, startedAt: new Date().toISOString(), steps: [] } }
  return { state, record(step) { state.steps.push({ at: new Date().toISOString(), ...step }); state.updatedAt = new Date().toISOString(); mkdirSync(dirname(path), { recursive: true, mode: 0o700 }); const temp = `${path}.${process.pid}.tmp`; writeFileSync(temp, JSON.stringify(state, null, 2), { mode: 0o600 }); renameSync(temp, path) } }
}
export function cloudflare(env = process.env, fetcher = fetch) {
  const account = env.CLOUDFLARE_ACCOUNT_ID, token = env.CLOUDFLARE_API_TOKEN
  if (!/^[a-f0-9]{32}$/.test(account ?? '') || !token) throw new ProvisionError('CLOUDFLARE_CREDENTIALS_REQUIRED', 'account')
  return { account, credentialRevision: createHash('sha256').update(token).digest('hex'), async request(path, method = 'GET', body) {
    let response
    try { response = await fetcher(`https://api.cloudflare.com/client/v4${path}`, { method, headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), redirect: 'error', signal: AbortSignal.timeout(25000) }) }
    catch { throw new ProvisionError('CF_RESPONSE_UNCERTAIN', `${method} ${path}`, undefined, 'Reconcile by fixed name/id before retry') }
    let data; try { data = await response.json() } catch { throw new ProvisionError('CF_RESPONSE_INVALID', `${method} ${path}`, response.status) }
    if (!response.ok || data.success === false) throw new ProvisionError(`CF_HTTP_${response.status}`, `${method} ${path}`, response.status, (data.errors ?? []).map(error => error.code).filter(code => Number.isInteger(code)).join(','))
    return data
  } }
}
// Operator-only continuation after an explicitly authorized credential update.
// Preserve all earlier outcomes. The same credentials cannot reopen a denial.
export function resumeDenied(log, credentialRevision) {
  if (!/^[a-f0-9]{64}$/.test(credentialRevision ?? '') || log.state.steps.some(step => step.action === 'credential-revision' && step.revision === credentialRevision)) throw new ProvisionError('CF_CREDENTIAL_REVISION_ALREADY_ATTEMPTED', 'account')
  log.record({ action: 'credential-revision', status: 'authorized-continuation', revision: credentialRevision })
}
export function deniedInCurrentRevision(log, predicate) {
  const epoch = log.state.steps.findLastIndex(step => step.action === 'credential-revision')
  return log.state.steps.slice(epoch + 1).some(step => step.code === 'CF_HTTP_403' && predicate(step))
}
export async function preflight(client, log) {
  const base = `/accounts/${client.account}`
  const paths = { verify: '/user/tokens/verify', tunnels: `${base}/cfd_tunnel?is_deleted=false&per_page=100`, apps: `${base}/access/apps?per_page=100`, serviceTokens: `${base}/access/service_tokens?per_page=100`, zone: `/zones?name=${DOMAIN}&status=active&per_page=50`, buckets: `${base}/r2/buckets` }
  const results = await Promise.allSettled(Object.entries(paths).map(async ([name, path]) => ({ name, data: await client.request(path) })))
  const available = {}
  for (let index = 0; index < results.length; index++) {
    const name = Object.keys(paths)[index], result = results[index]
    if (result.status === 'rejected') { const error = result.reason; available[name] = false; log.record({ action: 'read-preflight', resource: name, status: 'denied', target: error.target, code: error.code, httpStatus: error.status, detail: error.detail }); continue }
    available[name] = true
    const data = result.value.data
    // Metadata deliberately excludes token client IDs, secrets and unrelated resources.
    let resources = []
    if (name === 'tunnels') resources = data.result.filter(item => HOSTS.some(host => host.name === item.name)).map(item => ({ id: item.id, name: item.name, status: item.status }))
    if (name === 'apps') resources = data.result.filter(item => HOSTS.some(host => host.domain === item.domain || host.name === item.name)).map(item => ({ id: item.id, name: item.name, domain: item.domain }))
    if (name === 'serviceTokens') resources = data.result.filter(item => item.name === 'lingxiloop-release-controller').map(item => ({ id: item.id, name: item.name, expiresAt: item.expires_at }))
    if (name === 'zone') resources = data.result.map(item => ({ id: item.id, name: item.name }))
    if (name === 'buckets') resources = data.result.buckets.filter(item => item.name === 'lingxiloop-releases').map(item => ({ name: item.name, location: item.location }))
    log.record({ action: 'read-preflight', resource: name, status: 'available', resources })
  }
  return available
}
