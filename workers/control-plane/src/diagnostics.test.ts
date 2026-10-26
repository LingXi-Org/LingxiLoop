import { applyD1Migrations, env, fetchMock, SELF } from 'cloudflare:test'
import { beforeAll, expect, it } from 'vitest'

beforeAll(async () => applyD1Migrations(env.DB, env.TEST_MIGRATIONS))

const token = 'diag.tester.abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG'
async function request(path = '', credential = token, method = 'GET') {
  const response = await SELF.fetch(`https://admin.example.com/api/diagnostics${path}`, {
    method, headers: { authorization: `Bearer ${credential}` },
  })
  return { status: response.status, body: await response.json() }
}

it('diagnostics denies invalid credentials, mutations and non-diagnostic resources before origin access', async () => {
  // Failure modes: token reuse as admin, expired/revoked keys, arbitrary paths,
  // mutation forwarding, upstream redirects, oversized/private response data.
  fetchMock.activate(); fetchMock.disableNetConnect()
  try {
    for (const credential of ['', 'invalid', token.replace('tester', 'revoked'), token.replace('tester', 'expired')]) {
      expect((await request('', credential)).status).toBe(401)
    }
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect((await request('?view=runs', token, method)).status).toBe(405)
    }
    for (const path of ['?view=users', '?view=cancel&id=run-1', '?view=run&id=../users', '?view=runs&limit=101', '/agent-runs/run-1/cancel']) {
      expect((await request(path)).status).toBe(400)
    }
    const mcp = await SELF.fetch('https://admin.example.com/api/mcp', { method: 'POST', headers: { authorization: `Bearer ${token}` } })
    expect(mcp.status).toBe(401)
    await mcp.text()
    fetchMock.assertNoPendingInterceptors()
  } finally { fetchMock.deactivate() }
})

it('diagnostics reads bounded run failures with redaction and rejects unavailable administrators and redirects', async () => {
  const now = Date.now()
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt,role,banned) VALUES('mcp-admin','Admin','diag@example.com',1,?,?,'admin',0)`).bind(now, now),
    env.DB.prepare(`INSERT INTO app_user_links(auth_user_id,app_user_id,provisioned_at) VALUES('mcp-admin','app-mcp-admin',?)`).bind(now),
  ])
  fetchMock.activate(); fetchMock.disableNetConnect()
  const origin = fetchMock.get('https://origin.example.com')
  try {
    origin.intercept({ path: '/api/admin/resources/agent-runs?limit=20&status=failed', method: 'GET' })
      .reply(200, { data: [{ id: 'run-1', error: 'provider unavailable', prompt: 'private', token: 'private', nested: { password: 'private' } }] })
    expect(await request('?view=runs&status=failed')).toEqual({ status: 200, body: {
      data: [{ id: 'run-1', error: 'provider unavailable', prompt: '[REDACTED]', token: '[REDACTED]', nested: { password: '[REDACTED]' } }],
    } })
    origin.intercept({ path: '/api/admin/resources/agent-runs/run-1', method: 'GET' }).reply(302, '', { headers: { location: 'https://attacker.example/' } })
    expect((await request('?view=run&id=run-1')).status).toBe(502)
    origin.intercept({ path: '/api/admin/resources/agent-runs/run-2', method: 'GET' }).reply(200, { data: 'x'.repeat(300_000) })
    expect((await request('?view=run&id=run-2')).status).toBe(502)
    await env.DB.prepare(`UPDATE user SET banned=1 WHERE id='mcp-admin'`).run()
    expect((await request('?view=runs')).status).toBe(403)
    fetchMock.assertNoPendingInterceptors()
  } finally { fetchMock.deactivate() }
})
