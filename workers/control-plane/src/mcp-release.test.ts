import { applyD1Migrations, env, fetchMock, SELF } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import { komodoTargetNames, inspectKomodoTarget, runKomodoStackAction } from './komodo'
import { handleMcpRequest, type McpEnvironment, type McpOperations } from './mcp'
import { callRelease, type ReleaseClientEnv } from './release-client'

beforeAll(async () => applyD1Migrations(env.DB, env.TEST_MIGRATIONS))
const base = () => env as unknown as McpEnvironment
const configured = (extra: ReleaseClientEnv = {}): McpEnvironment => ({ ...base(), RELEASE_CONTROLLER_ENABLED: 'true', RELEASE_API_TOKEN: 'release-api-private-token', RELEASE_ADMIN_TOKEN: 'release-admin-private-token', ...extra })
const operations = (platform: McpOperations['platform'] = async () => Response.json({ user: { id: 'platform-admin' } })): McpOperations => ({ platform, health: async () => ({}), authSettings: async () => ({}), updateAuthSettings: async () => ({}), userLifecycle: async () => ({}) })
async function invoke(environment: McpEnvironment, method: string, params: Record<string, unknown>, ops = operations()) {
  const response = await handleMcpRequest(new Request('https://admin.example.com/api/mcp', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-11-25' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }), environment, { authUserId: 'mcp-admin', appUserId: 'app-admin' }, ops, [])
  return response.json() as Promise<{ result: { tools?: { name: string; inputSchema: unknown }[]; isError?: boolean; content: { text: string }[] } }>
}
function manifest() {
  return { version: 1, releaseId: 'release-1', appSha: 'a'.repeat(40), opsSha: 'b'.repeat(40), sourceReleaseId: 'baseline', sequence: 2, createdAt: '2026-10-25T00:00:00.000Z', checks: { commit: 'a'.repeat(40), conclusion: 'success', runId: '123' }, policy: { drainSeconds: 30, retryLimit: 1 }, targets: {
    'main-frontend': { adapter: 'web-static', resources: ['main-frontend'], dependsOn: [], fromReleaseId: 'baseline', hosts: [], artifact: { kind: 'worker', workerName: 'lingxiloop-web', versionId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', hash: `sha256:${'a'.repeat(64)}` }, contract: { nativeSchema: 14, productSchema: 57, api: 'v1', worker: 'v1', checkpoint: 'v1', control: 'v1', capabilities: [] }, configuration: { version: 'v1', secretRefs: [], volumes: {} }, verification: { readiness: ['ready'], businessProbe: 'login' } },
  } }
}
describe('controller ownership of MCP deployment tools', () => {
  it('keeps legacy behavior by default and preserves uptime and readonly inspection after cutover', async () => {
    fetchMock.activate(); fetchMock.disableNetConnect()
    const pool = fetchMock.get('https://ops.example.com')
    pool.intercept({ path: '/execute/DeployStack', method: 'POST' }).reply(200, { accepted: true })
    pool.intercept({ path: '/execute/RestartStack', method: 'POST' }).reply(200, { restarted: 'uptime' })
    for (const path of ['/read/GetStack', '/read/ListStackServices', '/read/GetStackActionState']) pool.intercept({ path, method: 'POST' }).reply(200, { read: true })
    try {
      expect(await runKomodoStackAction(base(), 'lingxiloop-app-a', 'deploy')).toEqual({ accepted: true })
      expect(await runKomodoStackAction(configured(), 'uptime', 'restart')).toEqual({ restarted: 'uptime' })
      expect(await inspectKomodoTarget(configured(), 'lingxiloop-app-a')).toMatchObject({ name: 'lingxiloop-app-a' })
      fetchMock.assertNoPendingInterceptors()
    } finally { fetchMock.deactivate() }
  })
  it('rejects all four LingxiLoop mutators before any Komodo request when enabled', async () => {
    for (const target of komodoTargetNames.filter(name => name !== 'uptime')) for (const action of ['deploy', 'start', 'stop', 'restart'] as const) await expect(runKomodoStackAction(configured(), target, action)).rejects.toThrow('RELEASE_CONTROLLER_OWNS_TARGET')
  })
  it('retains the existing MCP token, auth administrator and active-link entry checks', async () => {
    const endpoint = 'https://admin.example.com/api/mcp'
    const input = { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer test-mcp-service-token' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'lingxiloop_release_get', arguments: { releaseId: 'release-1' } } }) }
    const missing = await SELF.fetch(endpoint, { method: 'POST' }); expect(missing.status).toBe(401); await missing.arrayBuffer()
    const now = Date.now()
    await env.DB.prepare(`INSERT OR REPLACE INTO user(id,name,email,emailVerified,createdAt,updatedAt,role,banned) VALUES('mcp-admin','MCP','mcp@test.local',1,?,?,'user',0)`).bind(now, now).run()
    const denied = await SELF.fetch(endpoint, input); expect(denied.status).toBe(403); await denied.arrayBuffer()
    await env.DB.prepare(`UPDATE user SET role='admin',banned=1 WHERE id='mcp-admin'`).run()
    const banned = await SELF.fetch(endpoint, input); expect(banned.status).toBe(403); await banned.arrayBuffer()
  })
  it('checks real product platform-admin authority before any release binding call', async () => {
    let called = false
    const result = await invoke(configured({ RELEASE_SERVICE: { fetch: async () => { called = true; return Response.json({}) } } }), 'tools/call', { name: 'lingxiloop_release_get', arguments: { releaseId: 'release-1' } }, operations(async path => { expect(path).toBe('/api/admin/session'); return Response.json({ error: 'forbidden' }, { status: 403 }) }))
    expect(result.result.isError).toBe(true); expect(result.result.content[0].text).toContain('PLATFORM_ADMIN_REQUIRED'); expect(called).toBe(false)
  })
  it('exposes six structured release tools without credential, endpoint or shell parameters', async () => {
    const listed = await invoke(configured(), 'tools/list', {})
    const tools = listed.result.tools!.filter(tool => tool.name.startsWith('lingxiloop_release_'))
    expect(tools.map(tool => tool.name)).toEqual(['plan', 'submit', 'get', 'watch', 'resume', 'recover'].map(method => `lingxiloop_release_${method}`))
    const schema = JSON.stringify(tools)
    for (const forbidden of ['RELEASE_ADMIN_TOKEN', 'RELEASE_API_TOKEN', 'release-api-private-token', 'release-admin-private-token', 'baseUrl', 'shell']) expect(schema).not.toContain(forbidden)
  })
  it('routes every release operation to the fixed controller protocol with the correct credential and cursor', async () => {
    const calls: { path: string; method: string; token: string | null; body?: unknown }[] = []
    const environment = configured({ RELEASE_SERVICE: { fetch: async request => { calls.push({ path: new URL(request.url).pathname + new URL(request.url).search, method: request.method, token: request.headers.get('authorization'), ...(request.method === 'POST' ? { body: await request.json() } : {}) }); return Response.json({ releaseId: 'release-1', phase: 'queued', accidental: 'release-admin-private-token' }) } } })
    const commands = [
      ['plan', { manifest: manifest() }], ['submit', { manifest: manifest(), requestId: crypto.randomUUID(), reason: 'qualified candidate' }],
      ['get', { releaseId: 'release-1' }], ['watch', { releaseId: 'release-1', after: 42 }],
      ['resume', { releaseId: 'release-1', requestId: crypto.randomUUID(), reason: 'reconcile' }], ['recover', { releaseId: 'release-1', requestId: crypto.randomUUID(), reason: 'restore explicit compatible version' }],
    ] as const
    for (const [method, input] of commands) {
      const result = await invoke(environment, 'tools/call', { name: `lingxiloop_release_${method}`, arguments: input })
      expect(result.result.isError, result.result.content[0]?.text).not.toBe(true)
      expect(result.result.content[0].text).not.toContain('release-admin-private-token')
    }
    expect(calls.map(call => call.path)).toEqual(['/v1/plan', '/v1/releases', '/v1/releases/release-1', '/v1/releases/release-1/events?after=42', '/v1/releases/release-1/resume', '/v1/releases/release-1/recover'])
    expect(calls.map(call => call.method)).toEqual(['POST', 'POST', 'GET', 'GET', 'POST', 'POST'])
    expect(calls.slice(0, 4).every(call => call.token === 'Bearer release-api-private-token')).toBe(true)
    expect(calls.slice(4).every(call => call.token === 'Bearer release-admin-private-token')).toBe(true)
  })
  it('requires cutover for controller mutations and refuses arbitrary URLs, IDs or methods', async () => {
    const environment = configured({ RELEASE_CONTROLLER_ENABLED: 'false', RELEASE_API_URL: 'https://release.example.com' })
    await expect(callRelease(environment, 'submit', { manifest: manifest() })).rejects.toThrow('RELEASE_CONTROLLER_NOT_ENABLED')
    await expect(callRelease({ ...environment, RELEASE_API_URL: 'https://user:password@release.example.com' }, 'get', { releaseId: 'release-1' })).rejects.toThrow('INVALID_RELEASE_ORIGIN')
    await expect(callRelease(environment, 'get', { releaseId: '../admin' })).rejects.toThrow('INVALID_RELEASE_ID')
    await expect(callRelease(environment, 'watch', { releaseId: 'release-1', after: -1 })).rejects.toThrow('INVALID_EVENT_CURSOR')
    await expect(callRelease(environment, 'arbitrary' as 'get', { releaseId: 'release-1' })).rejects.toThrow('UNKNOWN_RELEASE_METHOD')
  })
})

it('uses only the configured HTTPS release origin and refuses redirects without forwarding credentials', async () => {
  const environment = configured({ RELEASE_API_URL: 'https://release.example.com' })
  let calls = 0
  expect(await callRelease(environment, 'get', { releaseId: 'release-1' }, async (request: RequestInfo | URL) => {
    calls++; expect(request).toBeInstanceOf(Request)
    const actual = request as Request
    expect(actual.url).toBe('https://release.example.com/v1/releases/release-1')
    expect(actual.redirect).toBe('manual')
    expect(actual.headers.get('authorization')).toBe('Bearer release-api-private-token')
    return Response.json({ releaseId: 'release-1', status: 'active' })
  })).toMatchObject({ status: 'active' })
  await expect(callRelease(environment, 'get', { releaseId: 'release-1' }, async () => { calls++; return new Response(null, { status: 307, headers: { location: 'https://unrelated.example' } }) })).rejects.toThrow('RELEASE_REDIRECT_REJECTED')
  expect(calls).toBe(2)
})
