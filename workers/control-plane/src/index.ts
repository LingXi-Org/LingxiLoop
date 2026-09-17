import { betterAuth } from 'better-auth'
import { APIError } from 'better-auth/api'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { admin, captcha, emailOTP } from 'better-auth/plugins'
import { drizzle } from 'drizzle-orm/d1'
import { type Context, Hono } from 'hono'
import { handleMcpRequest } from './mcp'
import { authSchema } from './schema'
import { sendSmtpEmail } from './smtp'

type Secrets = {
  BETTER_AUTH_SECRET: string
  GATEWAY_HMAC_SECRET: string
  BOOTSTRAP_ADMIN_TOKEN: string
  ALIYUN_OTP_EMAIL_PASSWORD: string
  TURNSTILE_SECRET_KEY: string
  SIGILLO_SSO_SECRET: string
  SIGILLO_PROVIDER_URL: string
  MCP_SERVICE_TOKEN: string
  MCP_AUTH_USER_ID: string
  KOMODO_API_KEY: string
  KOMODO_API_SECRET: string
  KOMODO_TARGETS_JSON: string
}
type Bindings = Env & Secrets
type Variables = { auth: ReturnType<typeof createAuth>; session: AuthSession; registrationValidated: boolean }
type AuthSession = { user: { id: string; name: string; email: string; emailVerified: boolean; role?: string }; session: { createdAt: Date | string } }
type AppContext = Context<{ Bindings: Bindings; Variables: Variables }>
type AuthSettings = {
  sessionExpiresIn: number
  otpExpiresIn: number
  rateLimitWindow: number
  rateLimitMax: number
}

const encoder = new TextEncoder()
const authSettingsCacheKey = 'https://lingxiloop.invalid/auth-settings'
const authSettingsCache = () => caches.open('lingxiloop-auth-settings')
const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()

function base64url(bytes: ArrayBuffer | Uint8Array): string {
  const value = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  return btoa(String.fromCharCode(...value)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

async function sha256(value: string): Promise<string> {
  return base64url(await crypto.subtle.digest('SHA-256', encoder.encode(value)))
}

async function hmac(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return base64url(await crypto.subtle.sign('HMAC', key, encoder.encode(value)))
}

async function claimCipher(secret: string): Promise<CryptoKey> {
  const material = await crypto.subtle.digest('SHA-256', encoder.encode(`registration-claim:${secret}`))
  return crypto.subtle.importKey('raw', material, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

async function sealClaim(secret: string, value: string): Promise<string> {
  const nonce = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, await claimCipher(secret), encoder.encode(value)))
  const sealed = new Uint8Array(nonce.length + ciphertext.length)
  sealed.set(nonce); sealed.set(ciphertext, nonce.length)
  return base64url(sealed)
}

async function openClaim(secret: string, value: string): Promise<string> {
  const encoded = value.replaceAll('-', '+').replaceAll('_', '/')
  const sealed = Uint8Array.from(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '=')), (character) => character.charCodeAt(0))
  if (sealed.length < 29) throw new Error('invalid registration claim')
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: sealed.slice(0, 12) }, await claimCipher(secret), sealed.slice(12)))
}

async function secretMatches(expected: string, candidate: string): Promise<boolean> {
  if (!expected || !candidate) return false
  const expectedKey = await crypto.subtle.importKey('raw', encoder.encode(expected), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
  const candidateKey = await crypto.subtle.importKey('raw', encoder.encode(candidate), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', candidateKey, encoder.encode('lingxiloop-secret-check'))
  return crypto.subtle.verify('HMAC', expectedKey, signature, encoder.encode('lingxiloop-secret-check'))
}

async function sendEmail(env: Bindings, message: { to: string; subject: string; html: string }): Promise<void> {
  await sendSmtpEmail({ address: 'no-reply@lingxilearn.cn', password: env.ALIYUN_OTP_EMAIL_PASSWORD }, message)
}

async function originRequest(env: Bindings, path: string, init: RequestInit, identity?: { appUserId?: string; authUserId?: string; authSessionIssuedAt?: number; platformAdmin?: boolean }, service?: { capability: 'registration-provision' | 'registration-invitation' | 'bootstrap-platform-user'; emailVerified?: boolean }): Promise<Response> {
  const url = new URL(path, env.ORIGIN_BASE_URL)
  const assertion = {
    appUserId: identity?.appUserId ?? null,
    authSessionIssuedAt: identity?.authSessionIssuedAt,
    platformAdmin: identity?.platformAdmin === true,
    authUserId: identity?.authUserId ?? null,
    method: init.method ?? 'GET',
    path: url.pathname + url.search,
    timestamp: Date.now(),
    nonce: crypto.randomUUID(),
    ...(service ? { service: { ...service, audience: 'registration', bodyHash: await sha256(String(init.body)) } } : {}),
  }
  const payload = base64url(encoder.encode(JSON.stringify(assertion)))
  const headers = new Headers(init.headers)
  headers.set('x-lingxiloop-gateway', `${payload}.${await hmac(env.GATEWAY_HMAC_SECRET, payload)}`)
  return fetch(url, { ...init, headers })
}

async function loadAuthSettings(c: AppContext): Promise<AuthSettings> {
  const cache = await authSettingsCache()
  const cached = await cache.match(authSettingsCacheKey)
  if (cached) return cached.json<AuthSettings>()
  const row = await c.env.DB.prepare(`SELECT session_expires_in,otp_expires_in,rate_limit_window,rate_limit_max FROM auth_settings WHERE id=1`).first<{
    session_expires_in: number
    otp_expires_in: number
    rate_limit_window: number
    rate_limit_max: number
  }>()
  if (!row) throw new Error('Better Auth settings are not initialized')
  const settings = {
    sessionExpiresIn: row.session_expires_in,
    otpExpiresIn: row.otp_expires_in,
    rateLimitWindow: row.rate_limit_window,
    rateLimitMax: row.rate_limit_max,
  }
  c.executionCtx.waitUntil(cache.put(authSettingsCacheKey, Response.json(settings, {
    headers: { 'cache-control': 'max-age=60' },
  })))
  return settings
}

function authSettingsPayload(env: Bindings, settings: AuthSettings) {
  return {
    ...settings,
    locked: {
      defaultRole: 'user',
      requireEmailVerification: true,
      captchaProvider: 'cloudflare-turnstile',
      captchaEndpoints: ['/sign-up/email', '/sign-in/email', '/request-password-reset'],
    },
    secrets: {
      smtp: Boolean(env.ALIYUN_OTP_EMAIL_PASSWORD),
      turnstile: Boolean(env.TURNSTILE_SECRET_KEY),
    },
  }
}

async function updateAuthSettings(c: AppContext, values: AuthSettings, actorUserId: string, reason: string, writeAudit = true): Promise<AuthSettings> {
  const now = Date.now()
  const statements = [
    c.env.DB.prepare(`UPDATE auth_settings SET session_expires_in=?,otp_expires_in=?,rate_limit_window=?,rate_limit_max=?,updated_at=?,updated_by=? WHERE id=1`)
      .bind(values.sessionExpiresIn, values.otpExpiresIn, values.rateLimitWindow, values.rateLimitMax, now, actorUserId),
  ]
  if (writeAudit) statements.push(c.env.DB.prepare(`INSERT INTO control_audit(id,actor_user_id,action,resource,reason,detail,created_at) VALUES(?,?,?,?,?,?,?)`)
    .bind(crypto.randomUUID(), actorUserId, 'update', 'better-auth:settings', reason, JSON.stringify(values), now))
  await c.env.DB.batch(statements)
  await (await authSettingsCache()).delete(authSettingsCacheKey)
  return values
}

async function provision(env: Bindings, authUser: { id: string; email: string; name: string; emailVerified: boolean }): Promise<void> {
  if (!authUser.emailVerified) throw new Error('verified registration identity required')
  const claim = await env.DB.prepare(
    `SELECT invite_token,invite_kind,status FROM registration_claims WHERE auth_user_id=?`,
  ).bind(authUser.id).first<{ invite_token: string; invite_kind: string; status: string }>()
  if (!claim) throw new Error('invitation required')
  if (claim.status === 'provisioned') return
  if (claim) {
    await env.DB.prepare(`UPDATE registration_claims SET status='provisioning',updated_at=? WHERE auth_user_id=?`)
      .bind(Date.now(), authUser.id).run()
  }
  const body: { authUserId: string; email: string; name: string; inviteToken?: string; inviteKind?: string } = {
    authUserId: authUser.id,
    email: authUser.email,
    name: authUser.name,
  }
  if (claim) {
    body.inviteToken = await openClaim(env.BETTER_AUTH_SECRET, claim.invite_token)
    body.inviteKind = claim.invite_kind
  }
  const response = await originRequest(env, '/api/internal/registration/provision', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }, { authUserId: authUser.id }, { capability: 'registration-provision', emailVerified: true })
  if (!response.ok) {
    const error = (await response.text()).slice(0, 500)
    if (claim) {
      await env.DB.prepare(`UPDATE registration_claims SET status='failed',error=?,updated_at=? WHERE auth_user_id=?`)
        .bind(error, Date.now(), authUser.id).run()
    }
    throw new Error(`business user provision failed (${response.status})`)
  }
  const result = await response.json<{ appUserId: string }>()
  const now = Date.now()
  const statements = [
    env.DB.prepare(`INSERT INTO app_user_links(auth_user_id,app_user_id,provisioned_at) VALUES(?,?,?) ON CONFLICT(auth_user_id) DO UPDATE SET app_user_id=excluded.app_user_id,provisioned_at=excluded.provisioned_at,suspended_at=NULL`).bind(authUser.id, result.appUserId, now),
  ]
  if (claim) statements.push(env.DB.prepare(`UPDATE registration_claims SET status='provisioned',error=NULL,updated_at=? WHERE auth_user_id=?`).bind(now, authUser.id))
  await env.DB.batch(statements)
}

function createAuth(env: Bindings, request: Request, waitUntil: (promise: Promise<unknown>) => void, settings: AuthSettings, registrationAllowed: () => boolean) {
  const origin = new URL(request.url).origin
  const trustedOrigins = env.AUTH_ALLOWED_HOSTS.split(',').map((host) => `https://${host.trim()}`)
  const hostname = new URL(request.url).hostname
  if (['localhost', '127.0.0.1', '::1'].includes(hostname) || hostname.endsWith('.workers.dev')) trustedOrigins.push(origin)
  return betterAuth({
    appName: 'LingxiLoop',
    baseURL: origin,
    basePath: '/api/auth',
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins,
    database: drizzleAdapter(drizzle(env.DB), { provider: 'sqlite', schema: authSchema }),
    databaseHooks: { user: { create: { before: async () => {
      if (!registrationAllowed()) throw new APIError('FORBIDDEN', { message: 'invitation required' })
    } } } },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      autoSignIn: false,
      sendResetPassword: async ({ user, url }) => sendEmail(env, { to: user.email, subject: '重置 LingxiLoop 密码', html: `<p><a href="${url}">重置密码</a></p>` }),
    },
    emailVerification: {
      autoSignInAfterVerification: false,
      afterEmailVerification: async (user) => provision(env, user),
    },
    session: { expiresIn: settings.sessionExpiresIn, cookieCache: { enabled: false } },
    rateLimit: { enabled: true, storage: 'database', window: settings.rateLimitWindow, max: settings.rateLimitMax },
    plugins: [
      admin({ defaultRole: 'user', adminRoles: ['admin'] }),
      emailOTP({
        overrideDefaultEmailVerification: true,
        sendVerificationOnSignUp: true,
        expiresIn: settings.otpExpiresIn,
        sendVerificationOTP: async ({ email, otp, type }) => {
          if (type === 'email-verification') {
            waitUntil(sendEmail(env, { to: email, subject: '验证 LingxiLoop 邮箱', html: `<p>你的邮箱验证码是 <strong>${otp}</strong>，${Math.ceil(settings.otpExpiresIn / 60)} 分钟内有效。</p>` }))
          }
        },
      }),
      captcha({
        provider: 'cloudflare-turnstile',
        secretKey: env.TURNSTILE_SECRET_KEY,
        endpoints: ['/sign-up/email', '/sign-in/email', '/request-password-reset'],
      }),
    ],
    advanced: {
      ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] },
      backgroundTasks: { handler: waitUntil },
    },
  })
}

async function attachAuth(c: AppContext) {
  const auth = createAuth(c.env, c.req.raw, c.executionCtx.waitUntil.bind(c.executionCtx), await loadAuthSettings(c), () => c.get('registrationValidated') === true)
  c.set('auth', auth)
  return auth
}

async function attachSession(c: AppContext, source: 'cache' | 'database') {
  const auth = await attachAuth(c)
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
    query: source === 'database' ? { disableCookieCache: true } : undefined,
  }).catch(() => null)
  if (session) c.set('session', session as AuthSession)
}

app.post('/api/auth/ws-ticket', async (c) => {
  await attachSession(c, 'database')
  return proxyAppRequest(c)
})

app.use('/api/auth/*', async (c, next) => {
  await attachAuth(c)
  await next()
})

app.use('/api/control/*', async (c, next) => {
  await attachSession(c, 'database')
  await next()
})

app.post('/api/auth/sign-up/email', async (c) => {
  const input = await c.req.json<{ email?: string; password?: string; name?: string; inviteToken?: string; inviteKind?: string }>()
  if (!input.email || !input.password || !input.name) return c.json({ error: '邮箱、姓名和密码均为必填项' }, 400)
  const inviteKind = input.inviteKind
  const inviteToken = input.inviteToken?.trim() ?? ''
  if (!inviteToken || (inviteKind !== 'project' && inviteKind !== 'company')) return c.json({ error: '仅限邀请注册' }, 403)
  if (inviteToken) {
    const validation = await originRequest(c.env, '/api/internal/registration/invitation', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: input.email, inviteToken, inviteKind }),
    }, undefined, { capability: 'registration-invitation' })
    if (!validation.ok) return c.json({ error: '邀请无效、已过期或与邮箱不匹配' }, validation.status === 404 ? 404 : 403)
  }
  c.set('registrationValidated', true)
  const request = new Request(c.req.raw, { body: JSON.stringify({ email: input.email, password: input.password, name: input.name }) })
  const response = await c.get('auth').handler(request)
  if (response.ok && inviteToken) {
    const result = await response.clone().json<{ user?: { id?: string } }>().catch(() => null)
    if (result?.user?.id) {
      const now = Date.now()
      await c.env.DB.prepare(`INSERT INTO registration_claims(auth_user_id,token_hash,invite_token,invite_kind,email,status,created_at,updated_at) VALUES(?,?,?,?,?,'pending',?,?)`)
        .bind(result.user.id, await sha256(inviteToken), await sealClaim(c.env.BETTER_AUTH_SECRET, inviteToken), inviteKind, input.email.toLowerCase(), now, now).run()
    }
  }
  return response
})

app.get('/api/auth/sso/sigillo', async (c) => {
  const returnTo = c.req.query('return_to')
  if (!returnTo) return c.json({ error: 'return_to required' }, 400)
  let target: URL
  try { target = new URL(returnTo) } catch { return c.json({ error: 'invalid return_to' }, 400) }
  if (target.origin !== c.env.SIGILLO_PROVIDER_URL || target.pathname !== '/sign-in/sso') {
    return c.json({ error: 'unapproved return_to' }, 400)
  }

  await attachSession(c, 'database')
  const session = c.get('session')
  if (!session) {
    const login = new URL('/', c.req.url)
    login.searchParams.set('returnTo', `${new URL(c.req.url).pathname}${new URL(c.req.url).search}`)
    return c.redirect(login.toString(), 302)
  }

  const code = crypto.randomUUID().replaceAll('-', '')
  const now = Date.now()
  await c.env.DB.prepare(
    `INSERT INTO sigillo_sso_code(code_hash,user_id,email,name,return_to,expires_at,created_at) VALUES(?,?,?,?,?,?,?)`,
  ).bind(await sha256(code), session.user.id, session.user.email, session.user.name, target.toString(), now + 60_000, now).run()
  target.searchParams.set('code', code)
  return c.redirect(target.toString(), 302)
})

app.post('/api/auth/sso/sigillo/exchange', async (c) => {
  if (!await secretMatches(c.env.SIGILLO_SSO_SECRET, c.req.header('x-sigillo-sso-secret') ?? '')) {
    return c.json({ error: 'unauthorized' }, 401)
  }
  const input = await c.req.json<{ code?: string }>().catch((): { code?: string } => ({}))
  const code = input.code
  if (!code) return c.json({ error: 'code required' }, 400)
  const hash = await sha256(code)
  const row = await c.env.DB.prepare(
    `SELECT user_id,email,name,return_to,expires_at,used_at FROM sigillo_sso_code WHERE code_hash=?`,
  ).bind(hash).first<{ user_id: string; email: string; name: string; return_to: string; expires_at: number; used_at: number | null }>()
  if (!row || row.used_at || row.expires_at <= Date.now()) return c.json({ error: 'invalid code' }, 401)
  const consumed = await c.env.DB.prepare(
    `UPDATE sigillo_sso_code SET used_at=? WHERE code_hash=? AND used_at IS NULL AND expires_at>?`,
  ).bind(Date.now(), hash, Date.now()).run()
  if (consumed.meta.changes !== 1) return c.json({ error: 'invalid code' }, 401)
  return c.json({ userId: row.user_id, email: row.email, name: row.name, returnTo: row.return_to })
})

app.all('/api/auth/*', (c) => c.get('auth').handler(c.req.raw))

function requireSession(c: AppContext): AuthSession | Response {
  return c.get('session') ?? c.json({ error: 'authentication required' }, 401)
}

function requireAdmin(c: AppContext): AuthSession | Response {
  const session = requireSession(c)
  if (session instanceof Response) return session
  return session.user.role === 'admin' ? session : c.json({ error: 'administrator required' }, 403)
}

app.get('/api/registration/invitation', async (c) => {
  const token = c.req.query('token')
  const kind = c.req.query('kind') === 'project' ? 'project' : 'company'
  if (!token) return c.json({ error: 'token required' }, 400)
  return originRequest(c.env, '/api/internal/registration/invitation', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ inviteToken: token, inviteKind: kind }),
  }, undefined, { capability: 'registration-invitation' })
})

app.get('/api/invitations/:token', (c) => originRequest(c.env,
  `/api/invitations/${encodeURIComponent(c.req.param('token'))}`, { method: 'GET' }))
app.get('/api/project-invitations/:token', (c) => originRequest(c.env,
  `/api/project-invitations/${encodeURIComponent(c.req.param('token'))}`, { method: 'GET' }))

app.post('/api/registration/accept', async (c) => {
  await attachSession(c, 'database')
  const session = requireSession(c)
  if (session instanceof Response) return session
  if (!session.user.emailVerified) return c.json({ error: 'verified email required' }, 403)
  const input = await c.req.json<{ inviteToken?: string; inviteKind?: string }>()
  if (!input.inviteToken || (input.inviteKind !== 'company' && input.inviteKind !== 'project')) return c.json({ error: 'invitation required' }, 400)
  const response = await originRequest(c.env, '/api/internal/registration/provision', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ authUserId: session.user.id, email: session.user.email, name: session.user.name, inviteToken: input.inviteToken, inviteKind: input.inviteKind }),
  }, { authUserId: session.user.id }, { capability: 'registration-provision', emailVerified: true })
  if (!response.ok) return response
  const result = await response.json<{ appUserId: string }>()
  await c.env.DB.prepare(`INSERT INTO app_user_links(auth_user_id,app_user_id,provisioned_at) VALUES(?,?,?)
    ON CONFLICT(auth_user_id) DO UPDATE SET app_user_id=excluded.app_user_id,provisioned_at=excluded.provisioned_at,suspended_at=NULL`)
    .bind(session.user.id, result.appUserId, Date.now()).run()
  return c.json({ ok: true })
})

app.post('/api/internal/revoke-sessions', async (c) => {
  const body = await c.req.text()
  const timestamp = Number(c.req.header('x-lingxi-timestamp'))
  const signature = c.req.header('x-lingxi-signature') ?? ''
  if (!Number.isFinite(timestamp) || Math.abs(Date.now()-timestamp)>30_000
    || !await secretMatches(await hmac(c.env.GATEWAY_HMAC_SECRET, `revoke-sessions:${timestamp}:${body}`), signature)) {
    return c.json({ error: 'invalid revocation signature' }, 401)
  }
  const input = JSON.parse(body) as { appUserId?: string; revokedAt?: number }
  if (!input.appUserId || !Number.isFinite(input.revokedAt) || input.revokedAt! > timestamp + 1000) return c.json({ error: 'invalid revocation' }, 400)
  await c.env.DB.prepare(`DELETE FROM session WHERE userId IN (SELECT auth_user_id FROM app_user_links WHERE app_user_id=?) AND createdAt<=?`)
    .bind(input.appUserId, input.revokedAt).run()
  return c.json({ ok: true })
})

app.post('/api/internal/bootstrap-admin', async (c) => {
  const input = await c.req.json<{ token?: string; email?: string }>()
  if (!await secretMatches(c.env.BOOTSTRAP_ADMIN_TOKEN, input.token ?? '')) return c.json({ error: 'invalid bootstrap token' }, 401)
  const state = await c.env.DB.prepare(`SELECT completed_at FROM bootstrap_state WHERE id=1`).first<{ completed_at: number | null }>()
  const currentAdmin = await c.env.DB.prepare(`SELECT id FROM user WHERE role='admin' LIMIT 1`).first()
  if (state?.completed_at || currentAdmin) return c.json({ error: 'bootstrap permanently locked' }, 409)
  const user = await c.env.DB.prepare(`SELECT id,emailVerified FROM user WHERE lower(email)=lower(?)`).bind(input.email ?? '').first<{ id: string; emailVerified: number }>()
  if (!user?.emailVerified) return c.json({ error: 'verified user not found' }, 404)
  const now = Date.now()
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE user SET role='admin',updatedAt=? WHERE id=?`).bind(now, user.id),
    c.env.DB.prepare(`UPDATE bootstrap_state SET completed_at=?,admin_user_id=? WHERE id=1`).bind(now, user.id),
  ])
  return c.json({ ok: true, removeSecret: 'BOOTSTRAP_ADMIN_TOKEN' })
})

async function ensureAdminBusinessIdentity(c: AppContext, session: AuthSession): Promise<{ app_user_id: string } | Response> {
  const linked = await c.env.DB.prepare(`SELECT app_user_id,suspended_at FROM app_user_links WHERE auth_user_id=?`).bind(session.user.id).first<{ app_user_id: string; suspended_at: number | null }>()
  if (linked) return linked.suspended_at === null ? { app_user_id: linked.app_user_id } : c.json({ error: 'business account is suspended' }, 403)
  if (!session.user.emailVerified) return c.json({ error: 'verified email required' }, 403)
  const state = await c.env.DB.prepare(`SELECT admin_user_id FROM bootstrap_state WHERE id=1`).first<{ admin_user_id: string | null }>()
  if (state?.admin_user_id !== session.user.id) return c.json({ error: 'initial administrator required' }, 403)
  const response = await originRequest(c.env, '/api/internal/bootstrap/platform-user', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ authUserId: session.user.id, email: session.user.email, name: session.user.name }),
  }, { authUserId: session.user.id }, { capability: 'bootstrap-platform-user', emailVerified: session.user.emailVerified })
  if (!response.ok) return response
  const { appUserId } = await response.json<{ appUserId: string }>()
  const inUse = await c.env.DB.prepare(`SELECT auth_user_id FROM app_user_links WHERE app_user_id=?`).bind(appUserId).first<{ auth_user_id: string }>()
  if (inUse && inUse.auth_user_id !== session.user.id) return c.json({ error: 'business identity is linked to another administrator' }, 409)
  await c.env.DB.prepare(`INSERT INTO app_user_links(auth_user_id,app_user_id,provisioned_at) VALUES(?,?,?) ON CONFLICT DO NOTHING`)
    .bind(session.user.id, appUserId, Date.now()).run()
  const saved = await c.env.DB.prepare(`SELECT app_user_id FROM app_user_links WHERE auth_user_id=? AND suspended_at IS NULL`).bind(session.user.id).first<{ app_user_id: string }>()
  return saved?.app_user_id === appUserId ? saved : c.json({ error: 'business identity changed during initialization' }, 409)
}

app.post('/api/control/bootstrap-business-identity', async (c) => {
  const session = requireAdmin(c)
  if (session instanceof Response) return session
  const link = await ensureAdminBusinessIdentity(c, session)
  return link instanceof Response ? link : c.json({ ok: true, appUserId: link.app_user_id })
})

app.all('/api/mcp', async (c) => {
  const origin = c.req.header('origin')
  if (origin) {
    let allowed = false
    try {
      const url = new URL(origin)
      const configured = c.env.AUTH_ALLOWED_HOSTS.split(',').map((host) => host.trim()).filter(Boolean)
      allowed = (url.protocol === 'https:' && configured.includes(url.hostname))
        || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '::1'].includes(url.hostname))
    } catch { allowed = false }
    if (!allowed) return c.json({ error: 'unapproved origin' }, 403)
  }
  const authorization = c.req.header('authorization') ?? ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
  if (!await secretMatches(c.env.MCP_SERVICE_TOKEN, token)) {
    return c.json({ error: 'unauthorized' }, 401, { 'WWW-Authenticate': 'Bearer' })
  }
  const identity = await c.env.DB.prepare(`SELECT u.id AS auth_user_id,l.app_user_id
      FROM user u JOIN app_user_links l ON l.auth_user_id=u.id
      WHERE u.id=? AND u.role='admin' AND u.banned=0 AND l.suspended_at IS NULL LIMIT 1`)
    .bind(c.env.MCP_AUTH_USER_ID).first<{ auth_user_id: string; app_user_id: string }>()
  if (!identity) return c.json({ error: 'configured MCP administrator is unavailable' }, 403)
  const platform = (path: string, init: RequestInit = {}) => originRequest(c.env, path, init,
    { authUserId: identity.auth_user_id, appUserId: identity.app_user_id, platformAdmin: true })
  return handleMcpRequest(c.req.raw, c.env, { authUserId: identity.auth_user_id, appUserId: identity.app_user_id }, {
    platform,
    health: async () => {
      const paths = ['/api/health', '/api/health/dependencies', '/api/meta']
      const responses = await Promise.all(paths.map(async (path) => {
        const response = await originRequest(c.env, path, {})
        return { path, status: response.status, body: await response.json().catch(() => null) }
      }))
      return { controlPlane: { ok: true, version: c.env.APP_VERSION }, origin: responses, uptime: await statusPage(c.env) }
    },
    authSettings: async () => authSettingsPayload(c.env, await loadAuthSettings(c)),
    updateAuthSettings: (values, why) => updateAuthSettings(c, values, identity.auth_user_id, why, false),
    userLifecycle: async (appUserId, action, why) => {
      const response = await controlUserLifecycle(c.env, identity, appUserId, action, why)
      const text = await response.text()
      if (!response.ok) throw new Error(`${response.status} ${text.slice(0, 1000)}`)
      return text ? JSON.parse(text) : { ok: true }
    },
  }, [c.env.MCP_SERVICE_TOKEN, c.env.KOMODO_API_KEY, c.env.KOMODO_API_SECRET,
    c.env.BETTER_AUTH_SECRET, c.env.GATEWAY_HMAC_SECRET, c.env.BOOTSTRAP_ADMIN_TOKEN,
    c.env.ALIYUN_OTP_EMAIL_PASSWORD, c.env.TURNSTILE_SECRET_KEY, c.env.SIGILLO_SSO_SECRET])
})

async function statusPage(env: Bindings): Promise<unknown> {
  try {
    const [pageResponse, heartbeatResponse] = await Promise.all([
      fetch(new URL('/api/status-page/lingxiloop', env.UPTIME_BASE_URL)),
      fetch(new URL('/api/status-page/heartbeat/lingxiloop', env.UPTIME_BASE_URL)),
    ])
    if (!pageResponse.ok || !heartbeatResponse.ok) throw new Error('status provider unavailable')
    const page = await pageResponse.json<{
      config: unknown
      incident: unknown
      publicGroupList: unknown[]
      maintenanceList: unknown[]
    }>()
    const heartbeat = await heartbeatResponse.json<{
      heartbeatList: Record<string, unknown[]>
      uptimeList: Record<string, number>
    }>()
    const history = Object.fromEntries(Object.entries(heartbeat.heartbeatList).map(([id, rows]) => [id, rows.slice(-50)]))
    const latest = Object.fromEntries(Object.entries(history).map(([id, rows]) => [id, rows.at(-1) ?? null]))
    return { config: page.config, incident: page.incident, groups: page.publicGroupList, maintenanceList: page.maintenanceList, history, latest, uptime: heartbeat.uptimeList }
  } catch (error) {
    throw new Error('status provider unavailable', { cause: error })
  }
}

app.get('/api/control/status-page', async (c) => {
  const session = requireAdmin(c)
  if (session instanceof Response) return session
  try {
    const payload = await statusPage(c.env)
    c.header('cache-control', 'private, max-age=30, stale-while-revalidate=60')
    return c.json(payload)
  } catch { return c.json({ error: 'status provider unavailable' }, 502) }
})

app.get('/api/control/auth-settings', async (c) => {
  const session = requireAdmin(c)
  if (session instanceof Response) return session
  return c.json(authSettingsPayload(c.env, await loadAuthSettings(c)))
})

app.put('/api/control/auth-settings', async (c) => {
  const session = requireAdmin(c)
  if (session instanceof Response) return session
  const reason = c.req.header('x-control-reason')?.trim()
  if (!reason || reason.length > 280) return c.json({ error: '1–280 字操作原因必填' }, 400)
  const input = await c.req.json<Partial<AuthSettings>>()
  const values: AuthSettings = {
    sessionExpiresIn: Number(input.sessionExpiresIn),
    otpExpiresIn: Number(input.otpExpiresIn),
    rateLimitWindow: Number(input.rateLimitWindow),
    rateLimitMax: Number(input.rateLimitMax),
  }
  const valid = Number.isInteger(values.sessionExpiresIn) && values.sessionExpiresIn >= 3600 && values.sessionExpiresIn <= 2592000
    && Number.isInteger(values.otpExpiresIn) && values.otpExpiresIn >= 60 && values.otpExpiresIn <= 1800
    && Number.isInteger(values.rateLimitWindow) && values.rateLimitWindow >= 10 && values.rateLimitWindow <= 3600
    && Number.isInteger(values.rateLimitMax) && values.rateLimitMax >= 5 && values.rateLimitMax <= 1000
  if (!valid) return c.json({ error: 'Better Auth 配置超出允许范围' }, 400)
  return c.json(await updateAuthSettings(c, values, session.user.id, reason))
})


async function controlUserLifecycle(env: Bindings, admin: { auth_user_id: string; app_user_id: string }, appUserId: string,
  action: 'suspend' | 'restore' | 'delete', reason: string): Promise<Response> {
  if (appUserId === admin.app_user_id) return Response.json({ error: 'administrators cannot change their own access' }, { status: 409 })
  const link = await env.DB.prepare(`SELECT auth_user_id FROM app_user_links WHERE app_user_id=?`).bind(appUserId).first<{ auth_user_id: string }>()
  if (!link) return Response.json({ error: 'auth user mapping not found' }, { status: 404 })
  const raw = JSON.stringify({ reason })
  if (action === 'suspend') {
    await env.DB.batch([
      env.DB.prepare(`UPDATE user SET banned=1,banReason=?,updatedAt=? WHERE id=?`).bind(reason, Date.now(), link.auth_user_id),
      env.DB.prepare(`DELETE FROM session WHERE userId=?`).bind(link.auth_user_id),
      env.DB.prepare(`UPDATE app_user_links SET suspended_at=? WHERE auth_user_id=?`).bind(Date.now(), link.auth_user_id),
    ])
  }
  const response = await originRequest(env, `/api/admin/users/${encodeURIComponent(appUserId)}/${action}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: raw,
  }, { appUserId: admin.app_user_id, authUserId: admin.auth_user_id })
  if (response.ok && action === 'restore') {
    await env.DB.batch([
      env.DB.prepare(`UPDATE user SET banned=0,banReason=NULL,banExpires=NULL,updatedAt=? WHERE id=?`).bind(Date.now(), link.auth_user_id),
      env.DB.prepare(`UPDATE app_user_links SET suspended_at=NULL WHERE auth_user_id=?`).bind(link.auth_user_id),
    ])
  }
  if (response.ok && action === 'delete') {
    await env.DB.prepare(`DELETE FROM user WHERE id=?`).bind(link.auth_user_id).run()
  }
  return response
}

app.post('/api/control/platform/users/:id/:action', async (c) => {
  const adminSession = requireAdmin(c)
  if (adminSession instanceof Response) return adminSession
  const action = c.req.param('action')
  if (action !== 'suspend' && action !== 'restore' && action !== 'delete') return c.json({ error: 'unsupported user lifecycle action' }, 404)
  const reason = (await c.req.json<{ reason?: string }>().catch((): { reason?: string } => ({}))).reason?.trim()
  if (!reason) return c.json({ error: 'reason required' }, 400)
  const adminLink = await ensureAdminBusinessIdentity(c, adminSession)
  if (adminLink instanceof Response) return adminLink
  return controlUserLifecycle(c.env, { auth_user_id: adminSession.user.id, app_user_id: adminLink.app_user_id }, c.req.param('id'), action, reason)
})

app.all('/api/health*', (c) => originRequest(c.env, c.req.path + new URL(c.req.url).search, { method: c.req.method, headers: c.req.raw.headers }))
app.all('/api/meta', (c) => originRequest(c.env, c.req.path, { method: c.req.method, headers: c.req.raw.headers }))

app.get('/api/control/management-session', async (c) => {
  const session = requireSession(c)
  if (session instanceof Response) return session
  const link = session.user.role === 'admin'
    ? await ensureAdminBusinessIdentity(c, session)
    : await c.env.DB.prepare(`SELECT app_user_id FROM app_user_links WHERE auth_user_id=? AND suspended_at IS NULL`).bind(session.user.id).first<{ app_user_id: string }>()
  if (link instanceof Response) return link
  if (!link) return c.json({ error: 'management access required' }, 403)
  return originRequest(c.env, '/api/admin-management/session', { method: 'GET', headers: c.req.raw.headers }, { appUserId: link.app_user_id, authUserId: session.user.id, authSessionIssuedAt: new Date(session.session.createdAt).getTime(), platformAdmin: session.user.role === 'admin' })
})

app.all('/api/control/company/*', async (c) => {
  const session = requireSession(c)
  if (session instanceof Response) return session
  const link = await c.env.DB.prepare(`SELECT app_user_id FROM app_user_links WHERE auth_user_id=? AND suspended_at IS NULL`).bind(session.user.id).first<{ app_user_id: string }>()
  if (!link) return c.json({ error: 'management access required' }, 403)
  const suffix = c.req.path.slice('/api/control/company'.length)
  return originRequest(c.env, `/api/admin-company${suffix}${new URL(c.req.url).search}`, { method: c.req.method, headers: c.req.raw.headers, body: ['GET', 'HEAD'].includes(c.req.method) ? null : c.req.raw.body }, { appUserId: link.app_user_id, authUserId: session.user.id, authSessionIssuedAt: new Date(session.session.createdAt).getTime() })
})

app.all('/api/control/platform/*', async (c) => {
  const session = requireAdmin(c)
  if (session instanceof Response) return session
  const link = await ensureAdminBusinessIdentity(c, session)
  if (link instanceof Response) return link
  const suffix = c.req.path.slice('/api/control/platform'.length)
  return originRequest(c.env, `/api/admin${suffix}${new URL(c.req.url).search}`, { method: c.req.method, headers: c.req.raw.headers, body: ['GET', 'HEAD'].includes(c.req.method) ? null : c.req.raw.body }, { appUserId: link.app_user_id, authUserId: session.user.id, authSessionIssuedAt: new Date(session.session.createdAt).getTime(), platformAdmin: c.req.path.startsWith('/api/control/') && session.user.role === 'admin' })
})

app.all('/api/webhooks/*', (c) => originRequest(c.env, c.req.path + new URL(c.req.url).search, { method: c.req.method, headers: c.req.raw.headers, body: ['GET', 'HEAD'].includes(c.req.method) ? null : c.req.raw.body }))

app.use('/api/*', async (c, next) => {
  await attachSession(c, 'database')
  await next()
})

async function proxyAppRequest(c: AppContext): Promise<Response> {
  if (/^\/api\/(?:internal|control|admin(?:-company|-management)?)(?:\/|$)/i.test(decodeURIComponent(c.req.path))) return c.json({ error: 'internal service route' }, 403)
  const session = requireSession(c)
  if (session instanceof Response) return session
  const link = await c.env.DB.prepare(`SELECT app_user_id FROM app_user_links WHERE auth_user_id=? AND suspended_at IS NULL`).bind(session.user.id).first<{ app_user_id: string }>()
  if (!link) return c.json({ error: 'business account is not provisioned' }, 409)
  const path = c.req.path === '/api/session' ? '/api/auth/me' : c.req.path
  return originRequest(c.env, path + new URL(c.req.url).search, { method: c.req.method, headers: c.req.raw.headers, body: ['GET', 'HEAD'].includes(c.req.method) ? null : c.req.raw.body }, { appUserId: link.app_user_id, authUserId: session.user.id, authSessionIssuedAt: new Date(session.session.createdAt).getTime(), platformAdmin: c.req.path.startsWith('/api/control/') && session.user.role === 'admin' })
}

app.all('/api/*', proxyAppRequest)

export default app
