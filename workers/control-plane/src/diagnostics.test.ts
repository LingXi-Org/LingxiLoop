import { applyD1Migrations, env, fetchMock, SELF } from 'cloudflare:test'
import { beforeAll, expect, it } from 'vitest'

beforeAll(async () => applyD1Migrations(env.DB, env.TEST_MIGRATIONS))

const token = 'diag.tester.abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG'
async function request(method: string, params: Record<string, unknown> = {}, credential = token) {
  const response = await SELF.fetch('https://admin.example.com/api/mcp', {
    method: 'POST', headers: { authorization: `Bearer ${credential}`, 'content-type': 'application/json',
      accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-11-25' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  return { status: response.status, body: await response.json() as {
    error?: unknown; result?: { tools?: { name: string }[]; isError?: boolean; content: { text: string }[] }
  } }
}
const read = (args: Record<string, unknown>) => request('tools/call', { name: 'lingxiloop_diagnostics', arguments: args })
async function administrator() {
  const now = Date.now()
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt,role,banned) VALUES('mcp-admin','Admin','diag@example.com',1,?,?,'admin',0)`).bind(now, now),
    env.DB.prepare(`INSERT INTO app_user_links(auth_user_id,app_user_id,provisioned_at) VALUES('mcp-admin','app-mcp-admin',?)`).bind(now),
  ])
}

it('diagnostic MCP denies invalid credentials and never registers or executes administrator tools', async () => {
  // Failure modes: expired/revoked keys, admin-tool escalation, arbitrary reads,
  // mutation forwarding, redirects, oversized/private responses and missing pages.
  await administrator()
  fetchMock.activate(); fetchMock.disableNetConnect()
  try {
    for (const credential of ['', 'invalid', token.replace('tester', 'revoked'), token.replace('tester', 'expired')]) {
      expect((await request('tools/list', {}, credential)).status).toBe(401)
    }
    expect((await request('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'tester', version: '1' } })).status).toBe(200)
    expect((await request('tools/list')).body.result?.tools?.map(tool => tool.name)).toEqual(['lingxiloop_diagnostics'])
    for (const name of ['lingxiloop_user_lifecycle', 'lingxiloop_agent_run_cancel', 'lingxiloop_release_submit', 'lingxiloop_release_resume', 'lingxiloop_komodo_stack_action', 'lingxiloop_auth_settings_update', 'lingxiloop_admin_resource_get']) {
      const { body } = await request('tools/call', { name, arguments: {} })
      expect(body.result?.isError ?? Boolean(body.error)).toBe(true)
    }
    for (const args of [{ view: 'users' }, { view: 'cancel', id: 'run-1' }, { view: 'run', id: '../users' }, { view: 'runs', limit: 101 }, { view: 'run', id: 'run-1', afterSeq: 1 }]) {
      expect((await read(args)).body.result?.isError).toBe(true)
    }
    fetchMock.assertNoPendingInterceptors()
  } finally { fetchMock.deactivate() }
})

it('diagnostic MCP reads redacted paginated failures and rejects unavailable administrators and redirects', async () => {
  await administrator()
  fetchMock.activate(); fetchMock.disableNetConnect()
  const origin = fetchMock.get('https://origin.example.com')
  try {
    origin.intercept({ path: '/api/admin/resources/agent-runs?limit=20&status=failed', method: 'GET' })
      .reply(200, { data: [{ id: 'run-1', error: 'provider unavailable', prompt: 'private', token: 'private', nested: { password: 'private' } }] })
    expect(JSON.parse((await read({ view: 'runs', status: 'failed' })).body.result!.content[0]!.text)).toEqual({
      data: [{ id: 'run-1', error: 'provider unavailable', prompt: '[REDACTED]', token: '[REDACTED]', nested: { password: '[REDACTED]' } }],
    })
    origin.intercept({ path: '/api/admin/resources/agent-runs/run%3Atenant%3A1', method: 'GET' })
      .reply(200, { data: { id: 'run:tenant:1', error: 'provider unavailable' } })
    expect(JSON.parse((await read({ view: 'run', id: 'run:tenant:1' })).body.result!.content[0]!.text))
      .toEqual({ data: { id: 'run:tenant:1', error: 'provider unavailable' } })
    origin.intercept({ path: '/api/admin/agent-runs/run%3Atenant%3A1/operations?afterSeq=100', method: 'GET' })
      .reply(200, { events: [{ seq: 101, error: 'late failure' }], nextSeq: 101 })
    expect(JSON.parse((await read({ view: 'operations', id: 'run:tenant:1', afterSeq: 100 })).body.result!.content[0]!.text))
      .toEqual({ events: [{ seq: 101, error: 'late failure' }], nextSeq: 101 })
    origin.intercept({ path: '/api/admin/resources/agent-runs/run-1', method: 'GET' }).reply(302, '', { headers: { location: 'https://attacker.example/' } })
    expect((await read({ view: 'run', id: 'run-1' })).body.result?.isError).toBe(true)
    origin.intercept({ path: '/api/admin/resources/agent-runs/run-2', method: 'GET' }).reply(200, { data: 'x'.repeat(300_000) })
    expect((await read({ view: 'run', id: 'run-2' })).body.result?.isError).toBe(true)
    await env.DB.prepare(`UPDATE user SET banned=1 WHERE id='mcp-admin'`).run()
    expect((await read({ view: 'runs' })).status).toBe(403)
    fetchMock.assertNoPendingInterceptors()
  } finally { fetchMock.deactivate() }
})
