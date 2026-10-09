import { applyD1Migrations, env, fetchMock, SELF } from 'cloudflare:test'
import { hashPassword } from 'better-auth/crypto'
import { beforeAll, describe, expect, it } from 'vitest'

declare module 'cloudflare:test' {
  interface ProvidedEnv extends Env {
    BETTER_AUTH_SECRET: string
    TEST_MIGRATIONS: import('@cloudflare/vitest-pool-workers/config').D1Migration[]
  }
}

// Storage snapshots require every response body to be consumed before teardown.
// https://developers.cloudflare.com/workers/testing/vitest-integration/known-issues/#storage-isolation
async function fetchComplete(url: string, init?: RequestInit): Promise<Response> {
  const response = await SELF.fetch(url, init)
  const body = response.body === null ? null : await response.arrayBuffer()
  return new Response(body, response)
}

beforeAll(async () => applyD1Migrations(env.DB, env.TEST_MIGRATIONS))

describe('control-plane trust boundaries', () => {
  it('keeps user lifecycle authority and D1 state aligned with the product result', async () => {
    // Failures: missing admin/session claims, rejected or unavailable origin, premature
    // login revocation, deleting the actor session, and unbanning a failed restore.
    const now = Math.floor(Date.now() / 1000)
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt,role,banned) VALUES('lifecycle-admin','Admin','lifecycle-admin@test.local',1,?,?,'admin',0),('lifecycle-target','Target','lifecycle-target@test.local',1,?,?,'user',0)`).bind(now, now, now, now),
      env.DB.prepare(`INSERT INTO account(id,accountId,providerId,issuer,userId,password,createdAt,updatedAt) VALUES('lifecycle-account','lifecycle-admin','credential','local:credential','lifecycle-admin',?,?,?)`).bind(await hashPassword('password123'), now, now),
      env.DB.prepare(`INSERT INTO app_user_links(auth_user_id,app_user_id,provisioned_at) VALUES('lifecycle-admin','pg-lifecycle-admin',?),('lifecycle-target','pg-lifecycle-target',?)`).bind(now, now),
      env.DB.prepare(`INSERT INTO session(id,expiresAt,token,createdAt,updatedAt,userId) VALUES('target-session',?,'target-session-token',?,?,'lifecycle-target')`).bind(now + 3600, now, now),
    ])
    fetchMock.activate(); fetchMock.disableNetConnect()
    fetchMock.get('https://challenges.cloudflare.com').intercept({ path: '/turnstile/v0/siteverify', method: 'POST' }).reply(200, { success: true })
    try {
      const signIn = await fetchComplete('https://admin.example.com/api/auth/sign-in/email', {
        method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://admin.example.com', 'x-captcha-response': 'XXXX.DUMMY.TOKEN.XXXX' },
        body: JSON.stringify({ email: 'lifecycle-admin@test.local', password: 'password123' }),
      })
      expect(signIn.status).toBe(200)
      const headers = { 'content-type': 'application/json', cookie: signIn.headers.get('set-cookie') ?? '' }
      const state = async () => ({
        user: await env.DB.prepare(`SELECT banned FROM user WHERE id='lifecycle-target'`).first(),
        link: await env.DB.prepare(`SELECT suspended_at IS NOT NULL AS suspended FROM app_user_links WHERE auth_user_id='lifecycle-target'`).first(),
        sessions: (await env.DB.prepare(`SELECT userId FROM session ORDER BY userId`).all()).results,
      })
      const active = { user: { banned: 0 }, link: { suspended: 0 }, sessions: [{ userId: 'lifecycle-admin' }, { userId: 'lifecycle-target' }] }
      const suspended = { user: { banned: 1 }, link: { suspended: 1 }, sessions: [{ userId: 'lifecycle-admin' }] }
      for (const [action, status, expected] of [
        ['suspend', 409, active], ['suspend', 503, active], ['suspend', 200, suspended],
        ['restore', 503, suspended], ['restore', 200, { ...active, sessions: [{ userId: 'lifecycle-admin' }] }],
      ] as const) {
        let payload: Record<string, unknown> | undefined
        fetchMock.get('https://origin.example.com').intercept({ path: `/api/admin/users/pg-lifecycle-target/${action}`, method: 'POST' }).reply(options => {
          const assertion = new Headers(options.headers as HeadersInit).get('x-lingxiloop-gateway')!
          payload = JSON.parse(atob(assertion.split('.')[0].replaceAll('-', '+').replaceAll('_', '/')))
          return { statusCode: status, data: JSON.stringify(status === 200 ? { ok: true } : { error: 'origin rejected operation' }) }
        })
        const response = await fetchComplete(`https://admin.example.com/api/control/platform/users/pg-lifecycle-target/${action}`, {
          method: 'POST', headers, body: JSON.stringify({ reason: '生命周期一致性回归' }),
        })
        expect(payload).toMatchObject({ appUserId: 'pg-lifecycle-admin', authUserId: 'lifecycle-admin', platformAdmin: true, authSessionIssuedAt: expect.any(Number) })
        expect(payload!.authSessionIssuedAt).toBeGreaterThan(now * 1000 - 1000)
        expect(response.status).toBe(status)
        expect(await state()).toEqual(expected)
      }
      fetchMock.assertNoPendingInterceptors()
    } finally { fetchMock.deactivate() }
  })
  it('company management forwards a signed user identity without promoting the global role', async () => {
    const now = Math.floor(Date.now() / 1000)
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES('company-admin','Teacher','company-admin@test.local',1,?,?)`).bind(now, now),
      env.DB.prepare(`INSERT INTO account(id,accountId,providerId,issuer,userId,password,createdAt,updatedAt) VALUES('company-admin-account','company-admin','credential','local:credential','company-admin',?,?,?)`).bind(await hashPassword('password123'), now, now),
      env.DB.prepare(`INSERT INTO app_user_links(auth_user_id,app_user_id,provisioned_at) VALUES('company-admin','pg-company-admin',?)`).bind(now),
    ])
    fetchMock.activate(); fetchMock.disableNetConnect()
    fetchMock.get('https://challenges.cloudflare.com').intercept({ path: '/turnstile/v0/siteverify', method: 'POST' }).reply(200, { success: true })
    try {
      const signIn = await fetchComplete('https://admin.example.com/api/auth/sign-in/email', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://admin.example.com', 'x-captcha-response': 'XXXX.DUMMY.TOKEN.XXXX' }, body: JSON.stringify({ email: 'company-admin@test.local', password: 'password123' }) })
      const headers = { cookie: signIn.headers.get('set-cookie') ?? '' }
      for (const [path, originPath] of [['management-session', '/api/admin-management/session'], ['company/resources/projects', '/api/admin-company/resources/projects']]) {
        fetchMock.get('https://origin.example.com').intercept({ path: originPath, method: 'GET' }).reply(options => {
          const assertion = new Headers(options.headers as HeadersInit).get('x-lingxiloop-gateway')!
          const payload = JSON.parse(atob(assertion.split('.')[0].replaceAll('-', '+').replaceAll('_', '/')))
          expect(payload.appUserId).toBe('pg-company-admin')
          expect(payload.platformAdmin).not.toBe(true)
          return { statusCode: 200, data: JSON.stringify({ ok: true }) }
        })
        expect((await fetchComplete(`https://admin.example.com/api/control/${path}`, { headers })).status).toBe(200)
      }
      fetchMock.get('https://origin.example.com').intercept({ path: '/api/im/companies/company/channels/channel/agents/agent/runs/run/stream', method: 'GET' })
        .reply(200, 'event: preview\ndata: {}\n\n', { headers: { 'content-type': 'text/event-stream; charset=utf-8' } })
      const stream = await fetchComplete('https://admin.example.com/api/im/companies/company/channels/channel/agents/agent/runs/run/stream', { headers })
      expect({ encoding: stream.headers.get('content-encoding'), body: await stream.text() })
        .toEqual({ encoding: 'identity', body: 'event: preview\ndata: {}\n\n' })
      expect((await fetchComplete('https://admin.example.com/api/control/platform/dashboard', { headers })).status).toBe(403)
      expect((await fetchComplete('https://admin.example.com/api/admin-company/resources/users', { headers })).status).toBe(403)
      await env.DB.prepare(`UPDATE app_user_links SET suspended_at=1 WHERE auth_user_id='company-admin'`).run()
      expect((await fetchComplete('https://admin.example.com/api/control/company/dashboard', { headers })).status).toBe(403)
      fetchMock.assertNoPendingInterceptors()
    } finally { fetchMock.deactivate() }
  })
  async function mcp(method: string, params?: Record<string, unknown>, id = 1) {
    return fetchComplete('https://admin.example.com/api/mcp', {
      method: 'POST',
      headers: {
        authorization: 'Bearer test-mcp-service-token',
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'mcp-protocol-version': '2025-11-25',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) }),
    })
  }

  it('proxies public health without initializing auth', async () => {
    await env.DB.prepare(`DELETE FROM auth_settings WHERE id=1`).run()
    fetchMock.activate()
    fetchMock.disableNetConnect()
    fetchMock.get('https://origin.example.com').intercept({ path: '/api/health' }).reply(200, { ok: true })
    try {
      const response = await fetchComplete('https://admin.example.com/api/health')
      expect({ status: response.status, body: await response.json() }).toEqual({ status: 200, body: { ok: true } })
      fetchMock.assertNoPendingInterceptors()
    } finally {
      fetchMock.deactivate()
      await env.DB.prepare(`INSERT INTO auth_settings(id,session_expires_in,otp_expires_in,rate_limit_window,rate_limit_max,updated_at) VALUES(1,604800,300,60,60,0)`).run()
    }
  })

  it('applies auth/control schema and rejects unauthenticated administration', async () => {
    const tables = await env.DB.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all<{ name: string }>()
    expect(tables.results.map((row) => row.name)).toEqual(expect.arrayContaining(['user', 'session', 'app_user_links', 'registration_claims', 'control_audit', 'auth_settings']))
    expect(tables.results.map((row) => row.name)).not.toContain('release_requests')
    const accountColumns = await env.DB.prepare(`PRAGMA table_info(account)`).all<{ name: string; notnull: number }>()
    expect(accountColumns.results).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'issuer', notnull: 1 })]))
    const authSettings = await env.DB.prepare(`SELECT session_expires_in,otp_expires_in,rate_limit_window,rate_limit_max FROM auth_settings WHERE id=1`).first()
    expect(authSettings).toEqual({ session_expires_in: 604800, otp_expires_in: 300, rate_limit_window: 60, rate_limit_max: 60 })
    expect((await fetchComplete('https://admin.example.com/api/control/eval/jobs', { method: 'POST' })).status).toBe(403)
    const authSettingsResponse = await fetchComplete('https://lingxiloop-control-plane.yangyangli0426.workers.dev/api/control/auth-settings')
    expect(authSettingsResponse.status).toBe(401)
  })

  it('keeps bootstrap locked behind its secret', async () => {
    const response = await fetchComplete('https://lingxiloop-control-plane.yangyangli0426.workers.dev/api/internal/bootstrap-admin', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: 'wrong', email: 'admin@example.com' }),
    })
    expect(response.status).toBe(401)
  })

  it('initializes concurrent platform reads and preserves administrator identity restrictions', async () => {
    const now = Math.floor(Date.now() / 1000)
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt,role) VALUES(?,?,?,1,?,?,'admin')`)
        .bind('bootstrap-admin', 'Bootstrap Admin', 'bootstrap-admin@example.com', now, now),
      env.DB.prepare(`INSERT INTO account(id,accountId,providerId,issuer,userId,password,createdAt,updatedAt) VALUES(?,?,'credential','local:credential',?,?,?,?)`)
        .bind('bootstrap-admin-account', 'bootstrap-admin', 'bootstrap-admin', await hashPassword('password123'), now, now),
      env.DB.prepare(`UPDATE bootstrap_state SET completed_at=?,admin_user_id=? WHERE id=1`).bind(now, 'bootstrap-admin'),
    ])
    fetchMock.activate()
    fetchMock.disableNetConnect()
    fetchMock.get('https://challenges.cloudflare.com').intercept({ path: '/turnstile/v0/siteverify', method: 'POST' }).reply(200, { success: true })
    const bootstrapRequests: unknown[] = []
    fetchMock.get('https://origin.example.com').intercept({ path: '/api/internal/bootstrap/platform-user', method: 'POST' }).reply(options => {
      bootstrapRequests.push(JSON.parse(String(options.body)))
      return { statusCode: 200, data: JSON.stringify({ appUserId: 'bootstrap-app-user' }) }
    }).delay(200).persist()
    try {
      const signIn = await fetchComplete('https://admin.example.com/api/auth/sign-in/email', {
        method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://admin.example.com', 'x-captcha-response': 'XXXX.DUMMY.TOKEN.XXXX' },
        body: JSON.stringify({ email: 'bootstrap-admin@example.com', password: 'password123' }),
      })
      const headers = { cookie: signIn.headers.get('set-cookie') ?? '' }
      for (const view of ['dashboard', 'observability']) {
        fetchMock.get('https://origin.example.com').intercept({ path: `/api/admin/${view}`, method: 'GET' })
          .reply(200, { view })
      }
      const responses = await Promise.all(['dashboard', 'observability'].map((view) =>
        fetchComplete(`https://admin.example.com/api/control/platform/${view}`, { headers })))
      expect(await Promise.all(responses.map(async (response) => ({ status: response.status, body: await response.json() })))).toEqual([
        { status: 200, body: { view: 'dashboard' } }, { status: 200, body: { view: 'observability' } },
      ])
      // A concurrent read can see the link committed by the other request.
      expect([1, 2]).toContain(bootstrapRequests.length)
      expect(bootstrapRequests).toEqual(Array.from({ length: bootstrapRequests.length }, () => ({
        authUserId: 'bootstrap-admin', email: 'bootstrap-admin@example.com', name: 'Bootstrap Admin',
      })))
      expect(await env.DB.prepare(`SELECT app_user_id FROM app_user_links WHERE auth_user_id='bootstrap-admin'`).first()).toEqual({ app_user_id: 'bootstrap-app-user' })
      const response = await fetchComplete('https://admin.example.com/api/control/bootstrap-business-identity', { method: 'POST', headers })
      expect(await response.json()).toEqual({ ok: true, appUserId: 'bootstrap-app-user' })
      await env.DB.prepare(`UPDATE app_user_links SET suspended_at=1 WHERE auth_user_id='bootstrap-admin'`).run()
      expect((await fetchComplete('https://admin.example.com/api/control/platform/dashboard', { headers })).status).toBe(403)
      await env.DB.prepare(`DELETE FROM app_user_links WHERE auth_user_id='bootstrap-admin'`).run()
      await env.DB.prepare(`UPDATE bootstrap_state SET admin_user_id=NULL WHERE id=1`).run()
      expect((await fetchComplete('https://admin.example.com/api/control/platform/dashboard', { headers })).status).toBe(403)
      fetchMock.assertNoPendingInterceptors()
    } finally { fetchMock.deactivate() }
  })

  it('signs in after an OTP verifies a password account', async () => {
    const email = 'otp-signup@example.com'
    const now = Math.floor(Date.now() / 1000)
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,0,?,?)`)
        .bind('otp-signup-user', 'OTP Signup', email, now, now),
      env.DB.prepare(`INSERT INTO account(id,accountId,providerId,issuer,userId,password,createdAt,updatedAt) VALUES(?,?,'credential','local:credential',?,?,?,?)`)
        .bind('otp-signup-account', 'otp-signup-user', 'otp-signup-user', await hashPassword('password123'), now, now),
      env.DB.prepare(`INSERT INTO verification(id,identifier,value,expiresAt,createdAt,updatedAt) VALUES(?,?,?,?,?,?)`)
        .bind('otp-signup-verification', `email-verification-otp-${email}`, '123456:0', now + 300, now, now),
    ])
    const encoder = new TextEncoder()
    const material = await crypto.subtle.digest('SHA-256', encoder.encode(`registration-claim:${env.BETTER_AUTH_SECRET}`))
    const key = await crypto.subtle.importKey('raw', material, 'AES-GCM', false, ['encrypt'])
    const nonce = crypto.getRandomValues(new Uint8Array(12))
    const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, encoder.encode('otp-invite')))
    const sealed = btoa(String.fromCharCode(...nonce, ...ciphertext)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
    await env.DB.prepare(`INSERT INTO registration_claims(auth_user_id,token_hash,invite_token,invite_kind,email,status,created_at,updated_at) VALUES('otp-signup-user','hash',?,'company',?,'pending',?,?)`).bind(sealed,email,now,now).run()
    fetchMock.activate()
    fetchMock.disableNetConnect()
    fetchMock.get('https://challenges.cloudflare.com').intercept({ path: '/turnstile/v0/siteverify', method: 'POST' }).reply(200, { success: true })
    fetchMock.get('https://origin.example.com').intercept({ path: '/api/internal/registration/provision', method: 'POST' }).reply(200, { appUserId: 'otp-app-user' })
    try {
      const verified = await fetchComplete('https://admin.example.com/api/auth/email-otp/verify-email', {
        method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://admin.example.com' }, body: JSON.stringify({ email, otp: '123456' }),
      })
      expect(verified.status).toBe(200)
      const signIn = await fetchComplete('https://admin.example.com/api/auth/sign-in/email', {
        method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://admin.example.com', 'x-captcha-response': 'XXXX.DUMMY.TOKEN.XXXX' }, body: JSON.stringify({ email, password: 'password123' }),
      })
      expect(signIn.status).toBe(200)
      fetchMock.assertNoPendingInterceptors()
    } finally { fetchMock.deactivate() }
  })

  it('issues a one-time Sigillo SSO code only for the approved provider', async () => {
    const now = Math.floor(Date.now() / 1000)
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,1,?,?)`)
        .bind('sigillo-user', 'Sigillo User', 'sigillo@example.com', now, now),
      env.DB.prepare(`INSERT INTO account(id,accountId,providerId,issuer,userId,password,createdAt,updatedAt) VALUES(?,?,'credential','local:credential',?,?,?,?)`)
        .bind('sigillo-account', 'sigillo-user', 'sigillo-user', await hashPassword('password123'), now, now),
    ])
    fetchMock.activate()
    fetchMock.disableNetConnect()
    fetchMock.get('https://challenges.cloudflare.com').intercept({ path: '/turnstile/v0/siteverify', method: 'POST' }).reply(200, { success: true })
    try {
      const signIn = await fetchComplete('https://admin.example.com/api/auth/sign-in/email', {
        method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://admin.example.com', 'x-captcha-response': 'XXXX.DUMMY.TOKEN.XXXX' },
        body: JSON.stringify({ email: 'sigillo@example.com', password: 'password123' }),
      })
      const returnTo = 'https://sigillo-provider.example/sign-in/sso?return_to=https%3A%2F%2Fsigillo-provider.example%2Fsign-in'
      const issued = await fetchComplete(`https://admin.example.com/api/auth/sso/sigillo?return_to=${encodeURIComponent(returnTo)}`, {
        headers: { cookie: signIn.headers.get('set-cookie') ?? '' }, redirect: 'manual',
      })
      expect(issued.status).toBe(302)
      const code = new URL(issued.headers.get('location')!).searchParams.get('code')
      expect(code).toBeTruthy()
      const exchanged = await fetchComplete('https://admin.example.com/api/auth/sso/sigillo/exchange', {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-sigillo-sso-secret': 'test-sigillo-sso-secret' }, body: JSON.stringify({ code }),
      })
      expect(await exchanged.json()).toEqual({ userId: 'sigillo-user', email: 'sigillo@example.com', name: 'Sigillo User', returnTo })
      const replay = await fetchComplete('https://admin.example.com/api/auth/sso/sigillo/exchange', {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-sigillo-sso-secret': 'test-sigillo-sso-secret' }, body: JSON.stringify({ code }),
      })
      expect(replay.status).toBe(401)
      fetchMock.assertNoPendingInterceptors()
    } finally { fetchMock.deactivate() }
  })

  it('proxies websocket tickets instead of sending them to Better Auth', async () => {
    const now = Math.floor(Date.now() / 1000)
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,1,?,?)`)
        .bind('ws-user', 'WebSocket User', 'ws@example.com', now, now),
      env.DB.prepare(`INSERT INTO account(id,accountId,providerId,issuer,userId,password,createdAt,updatedAt) VALUES(?,?,'credential','local:credential',?,?,?,?)`)
        .bind('ws-account', 'ws-user', 'ws-user', await hashPassword('password123'), now, now),
    ])
    fetchMock.activate()
    fetchMock.disableNetConnect()
    fetchMock.get('https://challenges.cloudflare.com').intercept({ path: '/turnstile/v0/siteverify', method: 'POST' }).reply(200, { success: true })
    fetchMock.get('https://origin.example.com').intercept({ path: '/api/auth/ws-ticket', method: 'POST' }).reply(200, { ticket: 'ticket-1' })
    await env.DB.prepare(`INSERT INTO app_user_links(auth_user_id,app_user_id,provisioned_at) VALUES('ws-user','app-ws-user',?)`).bind(now).run()
    try {
      const signIn = await fetchComplete('https://admin.example.com/api/auth/sign-in/email', {
        method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://admin.example.com', 'x-captcha-response': 'XXXX.DUMMY.TOKEN.XXXX' },
        body: JSON.stringify({ email: 'ws@example.com', password: 'password123' }),
      })
      const response = await fetchComplete('https://admin.example.com/api/auth/ws-ticket', {
        method: 'POST', headers: { cookie: signIn.headers.get('set-cookie') ?? '' },
      })
      expect({ status: response.status, body: await response.json() }).toEqual({ status: 200, body: { ticket: 'ticket-1' } })
      for (const path of ['/api/internal/registration/provision', '/api/internal/registration/invitation']) {
        const denied = await fetchComplete(`https://admin.example.com${path}`, {
          method: 'POST', headers: { cookie: signIn.headers.get('set-cookie') ?? '' },
        })
        expect(denied.status).toBe(403)
      }
      fetchMock.assertNoPendingInterceptors()
    } finally { fetchMock.deactivate() }
  })

  it('rejects cross-site authentication writes and registration without CAPTCHA', async () => {
    fetchMock.activate()
    fetchMock.disableNetConnect()
    fetchMock.get('https://challenges.cloudflare.com').intercept({ path: '/turnstile/v0/siteverify', method: 'POST' }).reply(200, { success: true })
    try {
    const crossSite = await fetchComplete('https://lingxiloop-control-plane.yangyangli0426.workers.dev/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://attacker.example', 'x-captcha-response': 'XXXX.DUMMY.TOKEN.XXXX' },
      body: JSON.stringify({ email: 'user@example.com', password: 'password123' }),
    })
    expect(crossSite.status).toBe(403)

    const noInvite = await fetchComplete('https://lingxiloop-control-plane.yangyangli0426.workers.dev/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://lingxiloop-control-plane.yangyangli0426.workers.dev' },
      body: JSON.stringify({ email: 'user@example.com', name: 'User', password: 'password123' }),
    })
    expect(noInvite.status).toBe(403)
    fetchMock.assertNoPendingInterceptors()
    } finally { fetchMock.deactivate() }
  })

  it('proxies Kuma status for an authenticated administrator', async () => {
    const now = Math.floor(Date.now() / 1000)
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt,role) VALUES(?,?,?,1,?,?,'admin')`)
        .bind('status-admin', 'Admin', 'status-admin@example.com', now, now),
      env.DB.prepare(`INSERT INTO account(id,accountId,providerId,issuer,userId,password,createdAt,updatedAt) VALUES(?,?,'credential','local:credential',?,?,?,?)`)
        .bind('status-admin-account', 'status-admin', 'status-admin', await hashPassword('password123'), now, now),
    ])
    fetchMock.activate()
    fetchMock.disableNetConnect()
    fetchMock.get('https://challenges.cloudflare.com')
      .intercept({ path: '/turnstile/v0/siteverify', method: 'POST' })
      .reply(200, { success: true })
    const upstream = fetchMock.get('https://uptime.example.com')
    upstream.intercept({ path: '/api/status-page/lingxiloop' })
      .reply(200, { config: { title: 'LingxiLoop 服务状态' }, incident: null, publicGroupList: [{ id: 1, name: '公共入口', monitorList: [{ id: 11, name: 'Web' }] }], maintenanceList: [] })
    upstream.intercept({ path: '/api/status-page/heartbeat/lingxiloop' })
      .reply(200, { heartbeatList: { 11: [{ status: 0 }, { status: 1, ping: 26 }] }, uptimeList: { '11_24': 1 } })
    try {
      const signIn = await fetchComplete('https://admin.example.com/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://admin.example.com', 'x-captcha-response': 'XXXX.DUMMY.TOKEN.XXXX' },
        body: JSON.stringify({ email: 'status-admin@example.com', password: 'password123' }),
      })
      expect(signIn.status).toBe(200)
      const response = await fetchComplete('https://admin.example.com/api/control/status-page', { headers: { cookie: signIn.headers.get('set-cookie') ?? '' } })
      expect(await response.json()).toEqual({
        config: { title: 'LingxiLoop 服务状态' },
        incident: null,
        groups: [{ id: 1, name: '公共入口', monitorList: [{ id: 11, name: 'Web' }] }],
        maintenanceList: [],
        history: { 11: [{ status: 0 }, { status: 1, ping: 26 }] },
        latest: { 11: { status: 1, ping: 26 } },
        uptime: { '11_24': 1 },
      })
      // A stalled provider must produce the existing retryable error, rather
      // than holding the authenticated monitoring page open indefinitely.
      upstream.intercept({ path: '/api/status-page/lingxiloop' })
        .reply(200, { config: {}, incident: null, publicGroupList: [], maintenanceList: [] }).delay(15_000)
      upstream.intercept({ path: '/api/status-page/heartbeat/lingxiloop' })
        .reply(200, { heartbeatList: {}, uptimeList: {} }).delay(15_000)
      const unavailable = await fetchComplete('https://admin.example.com/api/control/status-page', { headers: { cookie: signIn.headers.get('set-cookie') ?? '' } })
      expect({ status: unavailable.status, body: await unavailable.json() }).toEqual({ status: 502, body: { error: 'status provider unavailable' } })
      fetchMock.assertNoPendingInterceptors()
    } finally { fetchMock.deactivate() }
  }, 30_000) // The stalled upstream fixture deliberately waits beyond the default 5s test timeout.

  it('authenticates MCP, exposes operations, and replays commands idempotently', async () => {
    const now = Date.now()
    await env.DB.batch([
      env.DB.prepare(`INSERT OR REPLACE INTO user(id,name,email,emailVerified,createdAt,updatedAt,role,banned) VALUES('mcp-admin','MCP Admin','mcp@example.com',1,?,?, 'admin',0)`).bind(now, now),
      env.DB.prepare(`INSERT OR REPLACE INTO app_user_links(auth_user_id,app_user_id,provisioned_at,suspended_at) VALUES('mcp-admin','app-mcp-admin',?,NULL)`).bind(now),
    ])
    expect((await fetchComplete('https://admin.example.com/api/mcp', { method: 'POST' })).status).toBe(401)
    expect((await fetchComplete('https://admin.example.com/api/mcp', {
      method: 'POST', headers: { authorization: 'Bearer test-mcp-service-token', origin: 'https://attacker.example' },
    })).status).toBe(403)

    const initialized = await mcp('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '1' } })
    expect((await initialized.json() as { result: { serverInfo: { name: string } } }).result.serverInfo.name).toBe('lingxiloop-production-operations')
    const listed = await mcp('tools/list')
    const toolNames = ((await listed.json() as { result: { tools: Array<{ name: string }> } }).result.tools).map((tool) => tool.name)
    expect(toolNames).toEqual(expect.arrayContaining(['lingxiloop_admin_resource_list', 'lingxiloop_agent_run_cancel', 'lingxiloop_komodo_logs']))
    const targets = await mcp('tools/call', { name: 'lingxiloop_komodo_targets', arguments: {} }, 2)
    const targetsBody = await targets.json() as { result: { content: Array<{ text: string }> } }
    expect(Object.keys(JSON.parse(targetsBody.result.content[0]!.text))).toEqual([
      'lingxiloop-core-state', 'lingxiloop-app-a', 'server-b-ingress', 'lingxiloop-app-b', 'lingxiloop-knowledge-agent', 'uptime',
    ])

    fetchMock.activate()
    fetchMock.disableNetConnect()
    fetchMock.get('https://origin.example.com').intercept({ path: '/api/admin/resources/users/user-1', method: 'GET' })
      .reply(options => {
        const assertion = new Headers(options.headers as HeadersInit).get('x-lingxiloop-gateway')!
        const payload = JSON.parse(atob(assertion.split('.')[0].replaceAll('-', '+').replaceAll('_', '/')))
        expect(payload.platformAdmin).toBe(true)
        return { statusCode: 200, data: JSON.stringify({ name: 'visible', token: 'upstream-token', nested: { prompt: 'private prompt', environment: ['PASSWORD=private'] } }) }
      })
    fetchMock.get('https://origin.example.com').intercept({ path: '/api/admin/agent-runs/run-1/cancel', method: 'POST' }).reply(200, { cancelled: true })
    fetchMock.get('https://ops.example.com').intercept({ path: '/read/GetStack', method: 'POST' })
      .reply(200, { _id: { $oid: 'stack-b' }, name: 'lingxiloop-app-b' })
    fetchMock.get('https://ops.example.com').intercept({ path: '/read/ListUpdates', method: 'POST' })
      .reply(200, { updates: [{ target: { type: 'Stack', id: 'stack-b' }, operation: 'DeployStack' }] })
    try {
      const record = await mcp('tools/call', { name: 'lingxiloop_admin_resource_get', arguments: { resource: 'users', id: 'user-1' } }, 3)
      const recordBody = await record.json() as { result: { content: Array<{ text: string }> } }
      expect(JSON.parse(recordBody.result.content[0]!.text)).toEqual({ name: 'visible', token: '[REDACTED]', nested: { prompt: '[REDACTED]', environment: '[REDACTED]' } })
      const events = await mcp('tools/call', { name: 'lingxiloop_komodo_updates', arguments: { target: 'lingxiloop-app-b', limit: 10 } }, 6)
      const eventsBody = await events.json() as { result: { content: Array<{ text: string }> } }
      expect(JSON.parse(eventsBody.result.content[0]!.text)).toEqual({ updates: [{ target: { type: 'Stack', id: 'stack-b' }, operation: 'DeployStack' }] })
      const args = { requestId: '11111111-1111-4111-8111-111111111111', reason: 'test recovery', runId: 'run-1' }
      const first = await mcp('tools/call', { name: 'lingxiloop_agent_run_cancel', arguments: args }, 4)
      const firstBody = await first.json() as { result: { content: Array<{ text: string }> } }
      expect(JSON.parse(firstBody.result.content[0]!.text)).toEqual({ cancelled: true })
      const replay = await mcp('tools/call', { name: 'lingxiloop_agent_run_cancel', arguments: args }, 5)
      const replayBody = await replay.json() as { result: { content: Array<{ text: string }> } }
      expect(JSON.parse(replayBody.result.content[0]!.text)).toEqual({ replayed: true, status: 'succeeded' })
      fetchMock.assertNoPendingInterceptors()
    } finally { fetchMock.deactivate() }
  })
})
