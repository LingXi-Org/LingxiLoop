import { applyD1Migrations, createExecutionContext, env, fetchMock, SELF, waitOnExecutionContext } from 'cloudflare:test'
import { beforeAll, expect, it, vi } from 'vitest'

import app from './index'
vi.mock('./smtp', () => ({ sendSmtpEmail: vi.fn(async () => {}) }))

beforeAll(async () => applyD1Migrations(env.DB, env.TEST_MIGRATIONS))
const headers = { 'content-type': 'application/json', origin: 'https://admin.example.com', 'x-captcha-response': 'XXXX.DUMMY.TOKEN.XXXX' }
async function request(path: string, body: unknown, extra: Record<string, string> = {}, useSelf = !path.endsWith('/sign-up/email')) {
  const ctx = createExecutionContext()
  const raw = new Request(`https://admin.example.com${path}`, { method: 'POST', headers: { ...headers, ...extra }, body: JSON.stringify(body) })
  const response = useSelf ? await SELF.fetch(raw) : await app.fetch(raw, env as Parameters<typeof app.fetch>[1], ctx)
  await waitOnExecutionContext(ctx)
  return new Response(await response.arrayBuffer(), response)
}
function mocks(signups = 1, captchas = 2) {
  fetchMock.activate(); fetchMock.disableNetConnect()
  fetchMock.get('https://challenges.cloudflare.com').intercept({ path: '/turnstile/v0/siteverify', method: 'POST' }).reply(200, { success: true }).times(captchas)
  fetchMock.get('https://origin.example.com').intercept({ path: '/api/internal/registration/invitation', method: 'POST' }).reply(200, { valid: true }).times(signups)
}
const signup = (email: string, inviteToken = 'synthetic-invite', useSelf = false) => request('/api/auth/sign-up/email', { email, name: 'Synthetic', password: 'password123', inviteToken, inviteKind: 'company' }, {}, useSelf)
it('registers only real identities and never replaces their invitation on duplicate signup', async () => {
  mocks(3, 3)
  try {
    const first = await signup('duplicate@example.com')
    expect(first.status).toBe(200)
    const claim = await env.DB.prepare(`SELECT c.auth_user_id,c.token_hash FROM registration_claims c JOIN user u ON u.id=c.auth_user_id WHERE u.email=?`).bind('duplicate@example.com').first()
    expect(claim).not.toBeNull()
    const account = await env.DB.prepare(`SELECT password FROM account`).first()
    for (const verified of [0, 1]) {
      await env.DB.prepare(`UPDATE user SET emailVerified=? WHERE email=?`).bind(verified, 'duplicate@example.com').run()
      const duplicate = await request('/api/auth/sign-up/email', { email: 'duplicate@example.com', name: 'Changed Name', password: 'different-password', inviteToken: 'different-invite', inviteKind: 'company' })
      expect(duplicate.status).toBe(200)
      expect(await duplicate.json()).toEqual(await first.clone().json())
      expect(await env.DB.prepare(`SELECT auth_user_id,token_hash FROM registration_claims`).first()).toEqual(claim)
      expect(await env.DB.prepare(`SELECT password FROM account`).first()).toEqual(account)
      expect(await env.DB.prepare(`SELECT name FROM user`).first()).toEqual({ name: 'Synthetic' })
    }
  } finally { fetchMock.deactivate() }
})
it('recovers a failed claim insert from durable identity intent without another signup or OTP', async () => {
  mocks()
  try {
    await env.DB.exec(`CREATE TRIGGER reject_claim BEFORE INSERT ON registration_claims BEGIN SELECT RAISE(FAIL,'synthetic claim failure'); END`)
    expect((await signup('claim-fault@example.com')).status).toBe(200)
    await env.DB.exec(`DROP TRIGGER reject_claim`)
    await env.DB.prepare(`UPDATE user SET emailVerified=1 WHERE email='claim-fault@example.com'`).run()
    const signedIn = await request('/api/auth/sign-in/email', { email: 'claim-fault@example.com', password: 'password123' })
    expect(signedIn.status).toBe(200)
    fetchMock.get('https://origin.example.com').intercept({ path: '/api/internal/registration/provision', method: 'POST' }).reply(200, { appUserId: 'synthetic-app-user' })
    const recovered = await request('/api/registration/recover', {}, { cookie: signedIn.headers.get('set-cookie')! })
    expect(recovered.status).toBe(200)
    expect(await env.DB.prepare(`SELECT status FROM registration_claims`).first()).toEqual({ status: 'provisioned' })
  } finally { fetchMock.deactivate() }
})

async function verify(email: string) {
  const otp = await env.DB.prepare(`SELECT value FROM verification WHERE identifier=?`).bind(`email-verification-otp-${email}`).first<{ value: string }>()
  expect(otp).not.toBeNull()
  return request('/api/auth/email-otp/verify-email', { email, otp: otp!.value.split(':')[0] })
}
async function login(email: string) {
  const signedIn = await request('/api/auth/sign-in/email', { email, password: 'password123' })
  expect(signedIn.status).toBe(200)
  return { cookie: signedIn.headers.get('set-cookie')! }
}

for (const fault of ['503', 'network', 'receipt', 'decrypt', 'link'] as const) {
  it(`keeps verified identity recoverable after ${fault} failure, then converges once`, async () => {
    mocks()
    const email = `fault-${fault}@example.com`
    try {
      expect((await signup(email)).status).toBe(200)
      const claim = await env.DB.prepare(`SELECT invite_token FROM registration_claims`).first<{ invite_token: string }>()
      const origin = fetchMock.get('https://origin.example.com')
      if (fault === '503') origin.intercept({ path: '/api/internal/registration/provision', method: 'POST' }).reply(503, { error: 'private upstream SQL and token' })
      const transport = globalThis.fetch
      const outage = fault === 'network' ? vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
        if (String(input).endsWith('/api/internal/registration/provision')) return Promise.reject(new Error('synthetic disconnect'))
        return transport(input, init)
      }) : undefined
      if (fault === 'receipt') origin.intercept({ path: '/api/internal/registration/provision', method: 'POST' }).reply(200, '<html>private provider failure</html>')
      if (fault === 'decrypt') await env.DB.exec(`UPDATE registration_claims SET invite_token='corrupt'`)
      if (fault === 'link') {
        origin.intercept({ path: '/api/internal/registration/provision', method: 'POST' }).reply(200, { appUserId: 'recovered-user' })
        await env.DB.exec(`CREATE TRIGGER reject_link BEFORE INSERT ON app_user_links BEGIN SELECT RAISE(FAIL,'synthetic link failure'); END`)
      }
      const verified = await verify(email)
      outage?.mockRestore()
      expect(verified.status).toBe(200)
      expect(await env.DB.prepare(`SELECT emailVerified FROM user`).first()).toEqual({ emailVerified: 1 })
      const failed = await env.DB.prepare(`SELECT status,error FROM registration_claims`).first<{ status: string; error: string }>()
      expect(failed?.status).toBe('failed')
      expect(JSON.parse(failed!.error)).toMatchObject({ requestId: verified.headers.get('x-request-id'), code: fault === '503' || fault === 'decrypt' ? 'REGISTRATION_UNAVAILABLE' : 'REGISTRATION_RESULT_UNKNOWN' })
      expect(failed!.error).not.toContain('private')
      const authenticated = await login(email)
      if (fault === 'decrypt') await env.DB.prepare(`UPDATE registration_claims SET invite_token=?`).bind(claim!.invite_token).run()
      if (fault === 'link') await env.DB.exec(`DROP TRIGGER reject_link`)
      origin.intercept({ path: '/api/internal/registration/provision', method: 'POST' }).reply(options => {
        expect(new Headers(options.headers as HeadersInit).get('x-registration-request-id')).toMatch(/^[a-f0-9-]{36}$/)
        return { statusCode: 200, data: JSON.stringify({ appUserId: 'recovered-user' }) }
      }).times(2)
      expect((await request('/api/registration/recover', {}, authenticated)).status).toBe(200)
      expect((await request('/api/registration/recover', {}, authenticated)).status).toBe(200)
      expect(await env.DB.prepare(`SELECT status,error FROM registration_claims`).first()).toEqual({ status: 'provisioned', error: null })
      expect((await env.DB.prepare(`SELECT * FROM app_user_links`).all()).results).toHaveLength(1)
      fetchMock.assertNoPendingInterceptors()
    } finally { fetchMock.deactivate() }
  })
}
it('classifies unavailable invitations separately from permission denials', async () => {
  fetchMock.activate(); fetchMock.disableNetConnect()
  try {
    for (const [upstream, status, code] of [[503, 503, 'REGISTRATION_UNAVAILABLE'], [500, 503, 'REGISTRATION_UNAVAILABLE'], [404, 404, 'INVITATION_REJECTED'], [410, 410, 'INVITATION_REJECTED'], [403, 403, 'INVITATION_REJECTED'], [429, 429, 'RATE_LIMITED']] as const) {
      fetchMock.get('https://origin.example.com').intercept({ path: '/api/internal/registration/invitation', method: 'POST' }).reply(upstream, '<html>private SQL</html>')
      const response = await signup('classify@example.com', 'synthetic-invite', true)
      expect(response.status).toBe(status)
      expect(await response.json()).toMatchObject({ code, requestId: response.headers.get('x-request-id') })
    }
    const transport = globalThis.fetch
    const outage = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      if (String(input).endsWith('/api/internal/registration/invitation')) return Promise.reject(new Error('synthetic disconnect'))
      return transport(input, init)
    })
    const response = await signup('classify@example.com')
    outage.mockRestore()
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ code: 'REGISTRATION_UNAVAILABLE' })
  } finally { fetchMock.deactivate() }
})
it('refuses anonymous, unverified, mismatched and suspended recovery', async () => {
  mocks(1, 2)
  try {
    expect((await request('/api/registration/recover', {})).status).toBe(401)
    expect((await signup('boundary@example.com')).status).toBe(200)
    await env.DB.exec(`UPDATE user SET emailVerified=1`)
    const authenticated = await login('boundary@example.com')
    expect((await request('/api/registration/accept', { inviteToken: 'other', inviteKind: 'project' }, authenticated)).status).toBe(409)
    await env.DB.exec(`INSERT INTO app_user_links(auth_user_id,app_user_id,provisioned_at,suspended_at) SELECT id,'suspended-user',1,1 FROM user`)
    expect((await request('/api/registration/recover', {}, authenticated)).status).toBe(403)
  } finally { fetchMock.deactivate() }
})
it('handles simultaneous first signups and recoveries without replacing identity or claim', async () => {
  mocks(2, 3)
  try {
    const responses = await Promise.all([signup('race@example.com'), signup('race@example.com')])
    expect(responses.map(response => response.status)).toEqual([200, 200])
    expect((await env.DB.prepare(`SELECT id FROM user`).all()).results).toHaveLength(1)
    expect((await env.DB.prepare(`SELECT id FROM account`).all()).results).toHaveLength(1)
    expect((await env.DB.prepare(`SELECT auth_user_id FROM registration_claims`).all()).results).toHaveLength(1)
    await env.DB.exec(`UPDATE user SET emailVerified=1`)
    const authenticated = await login('race@example.com')
    fetchMock.get('https://origin.example.com').intercept({ path: '/api/internal/registration/provision', method: 'POST' }).reply(200, { appUserId: 'race-user' }).persist()
    expect((await Promise.all([request('/api/registration/recover', {}, authenticated), request('/api/registration/recover', {}, authenticated)])).map(response => response.status)).toEqual([200, 200])
    expect((await env.DB.prepare(`SELECT * FROM app_user_links`).all()).results).toHaveLength(1)
  } finally { fetchMock.deactivate() }
})
it('limits explicit recovery per authenticated identity using the existing rate policy', async () => {
  mocks()
  try {
    expect((await signup('limited@example.com')).status).toBe(200)
    await env.DB.exec(`UPDATE user SET emailVerified=1`)
    const authenticated = await login('limited@example.com')
    await env.DB.prepare(`INSERT INTO rateLimit(id,key,count,lastRequest) SELECT 'recovery-limit','registration:'||id,100000,? FROM user`).bind(Date.now()).run()
    const response = await request('/api/registration/recover', {}, authenticated)
    expect(response.status).toBe(429)
    expect(Number(response.headers.get('retry-after'))).toBeGreaterThan(0)
    expect(await response.json()).toMatchObject({ code: 'RATE_LIMITED' })
  } finally { fetchMock.deactivate() }
})
