import { spawnSync } from 'node:child_process'
import { isDeepStrictEqual } from 'node:util'
import { HOSTS, DOMAIN, ProvisionError, deniedInCurrentRevision } from './core.mjs'
const SIGILLO = '/workspace/.lingxi-production/bin/sigillo'
const tokenName = 'lingxiloop-release-controller'
const duration = '2160h'
export function ingressFor(host) { return [{ hostname: host.domain, service: 'http://127.0.0.1:17951' }, { service: 'http_status:404' }] }
export function policyFor(tokenId) { return { name: tokenName, decision: 'non_identity', precedence: 1, include: [{ service_token: { token_id: tokenId } }], exclude: [], require: [] } }
export function policyMatches(policies, tokenId) {
  if (policies.length !== 1) return false
  const policy = policies[0]
  return policy.decision === 'non_identity' && isDeepStrictEqual(policy.include, [{ service_token: { token_id: tokenId } }]) && !(policy.exclude?.length) && !(policy.require?.length)
}
const requireValue = (value, code, target) => { if (!value) throw new ProvisionError(code, target) }
function secretCli(args, input) {
  // No secret appears in argv, inherited logs or returned diagnostics.
  const result = spawnSync(SIGILLO, args, { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 2000000, timeout: 60000, shell: false })
  requireValue(!result.error && result.status === 0, 'SIGILLO_OPERATION_FAILED', args[0])
  return result.stdout
}
function records(text) { return text.split(/\r?\n(?=  - id:)/).slice(1).map(block => Object.fromEntries([...block.matchAll(/^\s+(?:- )?(\w+):\s*("(?:[^"\\]|\\.)*")\s*$/gm)].map(match => [match[1], JSON.parse(match[2])]))) }
export function resolveProject() {
  secretCli(['me', '--json'])
  const projects = records(secretCli(['projects'])).filter(project => project.name === 'LingxiLoop Control Plane')
  requireValue(projects.length === 1, 'SIGILLO_PROJECT_NOT_UNIQUE', 'LingxiLoop Control Plane')
  const projectId = projects[0].id
  requireValue(records(secretCli(['environments', '-p', projectId])).some(environment => environment.slug === 'prod'), 'SIGILLO_PROD_UNAVAILABLE', projectId)
  return projectId
}
function saveSecret(projectId, name, value) { requireValue(typeof value === 'string' && value.length > 0 && !value.includes('\n'), 'ACCESS_CREDENTIAL_MISSING', name); secretCli(['secrets', 'set', name, '-p', projectId, '-c', 'prod'], `${value}\n`) }
export async function all(client, path) {
  const items = []
  for (let page = 1; page <= 100; page++) {
    const data = await client.request(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`)
    requireValue(Array.isArray(data.result), 'CF_LIST_SHAPE_UNEXPECTED', path)
    items.push(...data.result)
    if (data.result_info?.total_pages ? page >= data.result_info.total_pages : data.result.length < 100) return items
  }
  throw new ProvisionError('CF_LIST_INCOMPLETE', path)
}
async function createReconciled(client, path, body, lookup, log, resource) {
  log.record({ action: 'create-intent', resource, status: 'pending' })
  try { return { object: (await client.request(path, 'POST', body)).result, created: true } }
  catch (error) {
    if (error.code !== 'CF_RESPONSE_UNCERTAIN' && error.code !== 'CF_RESPONSE_INVALID') throw error
    const found = await lookup()
    if (found) { log.record({ action: 'create-reconciled', resource, status: 'observed', id: found.id }); return { object: found, created: true, responseLost: true } }
    throw error
  }
}
function unique(items, predicate, target) { const found = items.filter(predicate); requireValue(found.length <= 1, 'DUPLICATE_RESOURCE', target); return found[0] }
async function bucket(client, log) {
  const path = `/accounts/${client.account}/r2/buckets`, name = 'lingxiloop-releases'
  const existing = (await client.request(path)).result.buckets.find(item => item.name === name)
  if (!existing) {
    const result = await createReconciled(client, path, { name }, async () => (await client.request(path)).result.buckets.find(item => item.name === name), log, name)
    requireValue(result.object.name === name, 'R2_IDENTITY_MISMATCH', name)
    log.record({ action: 'bucket-create', resource: name, status: 'created' })
  }
  const managed = (await client.request(`${path}/${name}/domains/managed`)).result
  const custom = (await client.request(`${path}/${name}/domains/custom`)).result
  requireValue(managed.enabled === false && Array.isArray(custom.domains) && custom.domains.length === 0, 'R2_BUCKET_NOT_PRIVATE', name)
  log.record({ action: 'bucket-verify', resource: name, status: 'private', managedPublicEnabled: false, customDomains: [] })
}
async function serviceToken(client, log) {
  const path = `/accounts/${client.account}/access/service_tokens`
  const lookup = async () => unique(await all(client, path), item => item.name === tokenName, tokenName)
  let token = await lookup()
  if (token) {
    requireValue(token.duration === duration && token.enabled !== false, 'ACCESS_TOKEN_POLICY_MISMATCH', tokenName)
    requireValue(process.env.CF_ACCESS_CLIENT_ID === token.client_id && process.env.CF_ACCESS_CLIENT_SECRET, 'ACCESS_EXISTING_SECRET_NOT_AVAILABLE', tokenName)
    log.record({ action: 'access-token-verify', resource: tokenName, status: 'existing', id: token.id, duration, expiresAt: token.expires_at })
    return token.id
  }
  requireValue(!process.env.CF_ACCESS_CLIENT_ID && !process.env.CF_ACCESS_CLIENT_SECRET, 'ACCESS_CREDENTIAL_KEYS_ALREADY_BOUND', tokenName)
  requireValue(!deniedInCurrentRevision(log, step => step.target === `POST ${path}`), 'CF_PRIOR_DENIAL', `POST ${path}`)
  const projectId = resolveProject()
  log.record({ action: 'sigillo-project', resource: 'LingxiLoop Control Plane', status: 'resolved', id: projectId, environment: 'prod' })
  const result = await createReconciled(client, path, { name: tokenName, duration }, lookup, log, tokenName)
  token = result.object
  log.record({ action: 'access-token-create', resource: tokenName, status: 'created', id: token.id, duration, expiresAt: token.expires_at })
  // A response-lost service token cannot be recreated or rotated implicitly.
  requireValue(!result.responseLost && token.client_secret && token.client_id, 'ACCESS_ONE_TIME_SECRET_UNAVAILABLE', tokenName)
  saveSecret(projectId, 'CF_ACCESS_CLIENT_SECRET', token.client_secret)
  log.record({ action: 'sigillo-secret-set', resource: 'CF_ACCESS_CLIENT_SECRET', status: 'saved', projectId, environment: 'prod', accessTokenId: token.id })
  saveSecret(projectId, 'CF_ACCESS_CLIENT_ID', token.client_id)
  log.record({ action: 'sigillo-secret-set', resource: 'CF_ACCESS_CLIENT_ID', status: 'saved', projectId, environment: 'prod', accessTokenId: token.id })
  token.client_secret = undefined; token.client_id = undefined
  return token.id
}
async function endpoint(client, log, host, zoneId, tokenId, dnsAllowed) {
  const base = `/accounts/${client.account}`
  if (tokenId) {
  const appsPath = `${base}/access/apps`
  const findApp = async () => unique(await all(client, appsPath), app => app.domain === host.domain || app.name === host.name, host.domain)
  let app = await findApp(), createdApp = false
  if (!app) { const result = await createReconciled(client, appsPath, { name: host.name, domain: host.domain, type: 'self_hosted', session_duration: '24h', app_launcher_visible: false, auto_redirect_to_identity: false }, findApp, log, host.domain); app = result.object; createdApp = true; log.record({ action: 'access-app-create', resource: host.domain, status: 'created', id: app.id }) }
  requireValue(app.domain === host.domain && app.type === 'self_hosted', 'ACCESS_APP_IDENTITY_MISMATCH', host.domain)
  const policiesPath = `${appsPath}/${app.id}/policies`
  let policies = await all(client, policiesPath)
  const ownedApp = createdApp || log.state.steps.some(step => step.action === 'access-app-create' && step.id === app.id && step.status === 'created')
  if (!policies.length && ownedApp) {
    const result = await createReconciled(client, policiesPath, policyFor(tokenId), async () => unique(await all(client, policiesPath), policy => policy.name === tokenName, host.domain), log, `${host.domain}:policy`)
    log.record({ action: 'access-policy-create', resource: host.domain, status: 'created', id: result.object.id, appId: app.id, serviceTokenId: tokenId })
    policies = await all(client, policiesPath)
  }
  requireValue(policyMatches(policies, tokenId), 'ACCESS_POLICY_NOT_EXACT', host.domain)
  log.record({ action: 'access-app-verify', resource: host.domain, status: 'restricted', id: app.id, policyId: policies[0].id, decision: 'non_identity', serviceTokenId: tokenId, allOtherAccess: 'default-deny' })
  } else log.record({ action: 'access-app', resource: host.domain, status: 'pending-token' })
  const tunnelPath = `${base}/cfd_tunnel`
  const findTunnel = async () => unique(await all(client, `${tunnelPath}?is_deleted=false`), tunnel => tunnel.name === host.name, host.name)
  let tunnel = await findTunnel(), createdTunnel = false
  if (!tunnel) { requireValue(!deniedInCurrentRevision(log, step => step.target === `POST ${tunnelPath}`), 'CF_PRIOR_DENIAL', `POST ${tunnelPath}`); const result = await createReconciled(client, tunnelPath, { name: host.name, config_src: 'cloudflare' }, findTunnel, log, host.name); tunnel = result.object; createdTunnel = true; log.record({ action: 'tunnel-create', resource: host.name, status: 'created', id: tunnel.id }) }
  requireValue(tunnel.config_src === 'cloudflare' || tunnel.remote_config === true, 'TUNNEL_CONFIG_SOURCE_MISMATCH', host.name)
  const configPath = `${tunnelPath}/${tunnel.id}/configurations`, desired = ingressFor(host)
  let config = (await client.request(configPath)).result.config
  const ownedTunnel = createdTunnel || log.state.steps.some(step => step.action === 'tunnel-create' && step.id === tunnel.id && step.status === 'created')
  if (!isDeepStrictEqual(config?.ingress, desired)) {
    requireValue(ownedTunnel && (!config?.ingress?.length || isDeepStrictEqual(config.ingress, [{ service: 'http_status:404' }])), 'EXISTING_TUNNEL_CONFIG_MISMATCH', host.name)
    log.record({ action: 'tunnel-config-intent', resource: host.name, status: 'pending', id: tunnel.id })
    try { await client.request(configPath, 'PUT', { config: { ingress: desired } }) }
    catch (error) { if (!['CF_RESPONSE_UNCERTAIN', 'CF_RESPONSE_INVALID'].includes(error.code)) throw error }
    config = (await client.request(configPath)).result.config
  }
  requireValue(isDeepStrictEqual(config?.ingress, desired), 'TUNNEL_INGRESS_NOT_EXACT', host.name)
  log.record({ action: 'tunnel-verify', resource: host.name, status: 'configured', id: tunnel.id, hostname: host.domain, service: 'http://127.0.0.1:17951', catchAll: 'http_status:404', connectorTokenFetched: false })
  if (!dnsAllowed || !tokenId) { log.record({ action: 'dns', resource: host.domain, status: 'blocked', code: !dnsAllowed ? 'DNS_PERMISSION_DENIED' : 'ACCESS_TOKEN_REQUIRED', tunnelId: tunnel.id }); return false }
  const dnsPath = `/zones/${zoneId}/dns_records`
  const findDns = async () => unique(await all(client, `${dnsPath}?name=${host.domain}`), record => record.name === host.domain, host.domain)
  let dns = await findDns()
  if (!dns) { const result = await createReconciled(client, dnsPath, { type: 'CNAME', name: host.domain, content: `${tunnel.id}.cfargotunnel.com`, proxied: true, ttl: 1 }, findDns, log, host.domain); dns = result.object; log.record({ action: 'dns-create', resource: host.domain, status: 'created', id: dns.id }) }
  requireValue(dns.type === 'CNAME' && dns.content === `${tunnel.id}.cfargotunnel.com` && dns.proxied === true, 'EXISTING_DNS_MISMATCH', host.domain)
  log.record({ action: 'dns-verify', resource: host.domain, status: 'configured', id: dns.id, tunnelId: tunnel.id, zoneId, proxied: true })
  return true
}
export async function execute(client, log, available) {
  const results = []
  if (available.buckets) { try { await bucket(client, log); results.push({ resource: 'lingxiloop-releases', status: 'private' }) } catch (error) { log.record({ action: 'bucket', status: 'blocked', resource: 'lingxiloop-releases', code: error.code, target: error.target, httpStatus: error.status, detail: error.detail }); results.push({ resource: 'lingxiloop-releases', status: 'blocked', code: error.code }) } }
  const unavailable = ['tunnels','apps','serviceTokens','zone'].filter(key => !available[key])
  if (unavailable.length) { results.push(...unavailable.map(resource => ({ resource, status: 'blocked', code: 'READ_PREFLIGHT_UNAVAILABLE' }))); return results }
  const zones = (await client.request(`/zones?name=${DOMAIN}&status=active`)).result
  requireValue(zones.length === 1, 'ZONE_NOT_UNIQUE', DOMAIN)
  const zoneId = zones[0].id
  // A denied DNS action is never retried without materially new permission evidence.
  let dnsAllowed = !deniedInCurrentRevision(log, step => step.target?.includes(`/zones/${zoneId}/dns_records`))
  if (dnsAllowed) {
    try { for (const host of HOSTS) await all(client, `/zones/${zoneId}/dns_records?name=${host.domain}`) }
    catch (error) { log.record({ action: 'dns-read', status: 'blocked', code: error.code, target: error.target, httpStatus: error.status, detail: error.detail }); dnsAllowed = false }
  }
  let tokenId
  try { tokenId = await serviceToken(client, log) }
  catch (error) { log.record({ action: 'access-token', resource: tokenName, status: 'blocked', code: error.code, target: error.target, httpStatus: error.status, detail: error.detail }); results.push({ resource: tokenName, status: 'blocked', code: error.code }) }
  for (const host of HOSTS) {
    try { const complete = await endpoint(client, log, host, zoneId, tokenId, dnsAllowed); results.push({ resource: host.domain, status: complete ? 'configured' : 'blocked', ...(!complete ? { code: !dnsAllowed ? 'DNS_PERMISSION_DENIED' : 'ACCESS_TOKEN_REQUIRED' } : {}) }) }
    catch (error) { log.record({ action: 'endpoint', resource: host.domain, status: 'blocked', code: error.code, target: error.target, httpStatus: error.status, detail: error.detail }); results.push({ resource: host.domain, status: 'blocked', code: error.code }); if (error.status === 403 || error.code === 'CF_PRIOR_DENIAL') break }
  }
  return results
}
