import { applyD1Migrations, env, fetchMock, SELF } from 'cloudflare:test'
import { hashPassword } from 'better-auth/crypto'
import { beforeAll, describe, expect, it } from 'vitest'

declare module 'cloudflare:test' {
  interface ProvidedEnv extends Env {
    TEST_MIGRATIONS: import('@cloudflare/vitest-pool-workers/config').D1Migration[]
  }
}

beforeAll(async () => applyD1Migrations(env.DB, env.TEST_MIGRATIONS))

describe('control-plane trust boundaries', () => {
  it('applies auth/control schema and rejects unauthenticated administration', async () => {
    const tables = await env.DB.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all<{ name: string }>()
    expect(tables.results.map((row) => row.name)).toEqual(expect.arrayContaining(['user', 'session', 'app_user_links', 'registration_claims', 'release_requests', 'control_audit']))
    const accountColumns = await env.DB.prepare(`PRAGMA table_info(account)`).all<{ name: string; notnull: number }>()
    expect(accountColumns.results).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'issuer', notnull: 1 })]))
    const response = await SELF.fetch('https://lingxiloop-control-plane.yangyangli0426.workers.dev/api/control/releases')
    expect(response.status).toBe(401)
  })

  it('keeps bootstrap locked behind its secret', async () => {
    const response = await SELF.fetch('https://lingxiloop-control-plane.yangyangli0426.workers.dev/api/internal/bootstrap-admin', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: 'wrong', email: 'admin@example.com' }),
    })
    expect(response.status).toBe(401)
  })

  it('rejects cross-site authentication writes and invitation-free registration', async () => {
    const crossSite = await SELF.fetch('https://lingxiloop-control-plane.yangyangli0426.workers.dev/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://attacker.example' },
      body: JSON.stringify({ email: 'user@example.com', password: 'password123' }),
    })
    expect(crossSite.status).toBe(403)

    const noInvite = await SELF.fetch('https://lingxiloop-control-plane.yangyangli0426.workers.dev/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://lingxiloop-control-plane.yangyangli0426.workers.dev' },
      body: JSON.stringify({ email: 'user@example.com', name: 'User', password: 'password123' }),
    })
    expect(noInvite.status).toBe(400)
  })

  it('accepts a signed admin session on control-plane routes', async () => {
    const now = Math.floor(Date.now() / 1000)
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt,role) VALUES(?,?,?,1,?,?,'admin')`)
        .bind('admin-user', 'Admin', 'admin@example.com', now, now),
      env.DB.prepare(`INSERT INTO account(id,accountId,providerId,issuer,userId,password,createdAt,updatedAt) VALUES(?,?,'credential','local:credential',?,?,?,?)`)
        .bind('admin-account', 'admin-user', 'admin-user', await hashPassword('password123'), now, now),
      env.DB.prepare(`INSERT INTO app_user_links(auth_user_id,app_user_id,provisioned_at) VALUES(?,?,?)`)
        .bind('admin-user', 'app-admin', now),
    ])
    const signIn = await SELF.fetch('https://admin.example.com/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://admin.example.com' },
      body: JSON.stringify({ email: 'admin@example.com', password: 'password123' }),
    })
    expect(signIn.status).toBe(200)
    const cookie = signIn.headers.get('set-cookie')
    expect(cookie).toContain('__Secure-better-auth.session_token=')

    const session = await SELF.fetch('https://admin.example.com/api/auth/get-session', { headers: { cookie: cookie ?? '' } })
    expect((await session.json<{ user?: { role?: string } }>()).user?.role).toBe('admin')
    const releases = await SELF.fetch('https://admin.example.com/api/control/releases', { headers: { cookie: cookie ?? '' } })
    expect(releases.status).toBe(200)

    fetchMock.activate()
    fetchMock.disableNetConnect()
    fetchMock.get('https://origin.example.com').intercept({ path: '/api/admin/dashboard' }).reply(401, { error: 'valid gateway assertion required' })
    const dashboard = await SELF.fetch('https://admin.example.com/api/control/platform/dashboard', { headers: { cookie: cookie ?? '' } })
    expect(dashboard.status).toBe(502)
    expect(await dashboard.json()).toEqual({ error: 'business API rejected the control-plane gateway identity' })

    fetchMock.get('https://uptime.example.com')
      .intercept({ path: '/api/status-page/lingxiloop' })
      .reply(200, { config: { title: 'LingxiLoop 服务状态' }, incident: null, publicGroupList: [{ id: 1, name: '公共入口', monitorList: [{ id: 11, name: 'Web' }] }], maintenanceList: [] })
    fetchMock.get('https://uptime.example.com')
      .intercept({ path: '/api/status-page/heartbeat/lingxiloop' })
      .reply(200, { heartbeatList: { 11: [{ status: 0 }, { status: 1, ping: 26 }] }, uptimeList: { '11_24': 1 } })
    const statusPage = await SELF.fetch('https://admin.example.com/api/control/status-page', { headers: { cookie: cookie ?? '' } })
    expect(await statusPage.json()).toEqual({
      config: { title: 'LingxiLoop 服务状态' },
      incident: null,
      groups: [{ id: 1, name: '公共入口', monitorList: [{ id: 11, name: 'Web' }] }],
      maintenanceList: [],
      latest: { 11: { status: 1, ping: 26 } },
      uptime: { '11_24': 1 },
    })
    fetchMock.assertNoPendingInterceptors()
    fetchMock.deactivate()
  })
})
