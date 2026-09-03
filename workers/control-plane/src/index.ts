import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { admin, captcha, emailOTP } from 'better-auth/plugins'
import { drizzle } from 'drizzle-orm/d1'
import { type Context, Hono } from 'hono'
import { authSchema } from './schema'
import { sendSmtpEmail } from './smtp'

type Secrets = {
  BETTER_AUTH_SECRET: string
  GATEWAY_HMAC_SECRET: string
  RELEASE_HMAC_SECRET: string
  BOOTSTRAP_ADMIN_TOKEN: string
  OPENSHIP_PAT: string
  OPENSHIP_PROJECT_IDS: string
  OPENSHIP_IMAGE_TARGETS: string
  ALIYUN_OTP_EMAIL_PASSWORD: string
  TURNSTILE_SECRET_KEY: string
  CF_ACCESS_CLIENT_ID?: string
  CF_ACCESS_CLIENT_SECRET?: string
}
type Bindings = Env & Secrets
type Variables = { auth: ReturnType<typeof createAuth>; session: AuthSession }
type AuthSession = { user: { id: string; name: string; email: string; emailVerified: boolean; role?: string }; session: unknown }
type AppContext = Context<{ Bindings: Bindings; Variables: Variables }>
type AuthSettings = {
  sessionExpiresIn: number
  otpExpiresIn: number
  rateLimitWindow: number
  rateLimitMax: number
}

const encoder = new TextEncoder()
const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()
const releaseImageNames = ['server', 'agent-os', 'wukongim', 'open-notebook', 'gateway'] as const
const productionTopology: Record<string, readonly string[]> = {
  'lingxiloop-core-state': ['postgres', 'redis', 'wukongim'],
  'lingxiloop-app-a': ['db-migrate', 'lingxiloop'],
  'lingxiloop-agent-os-a': ['agent-os'],
  'lingxiloop-app-b': ['db-migrate', 'lingxiloop', 'worker', 'gateway'],
  'lingxiloop-knowledge-agent': ['surrealdb', 'open-notebook'],
  'lingxiloop-agent-os-b': ['agent-os'],
  'lingxilit-shanghai-b': ['clickhouse', 'openlit'],
  'Uptime Kuma': ['uptime-kuma'],
}

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

async function originRequest(env: Bindings, path: string, init: RequestInit, identity?: { appUserId?: string; authUserId?: string }): Promise<Response> {
  const url = new URL(path, env.ORIGIN_BASE_URL)
  const assertion = {
    appUserId: identity?.appUserId ?? null,
    authUserId: identity?.authUserId ?? null,
    method: init.method ?? 'GET',
    path: url.pathname + url.search,
    timestamp: Date.now(),
    nonce: crypto.randomUUID(),
  }
  const payload = base64url(encoder.encode(JSON.stringify(assertion)))
  const headers = new Headers(init.headers)
  headers.set('x-lingxiloop-gateway', `${payload}.${await hmac(env.GATEWAY_HMAC_SECRET, payload)}`)
  return fetch(url, { ...init, headers })
}

async function loadAuthSettings(env: Bindings): Promise<AuthSettings> {
  const row = await env.DB.prepare(`SELECT session_expires_in,otp_expires_in,rate_limit_window,rate_limit_max FROM auth_settings WHERE id=1`).first<{
    session_expires_in: number
    otp_expires_in: number
    rate_limit_window: number
    rate_limit_max: number
  }>()
  if (!row) throw new Error('Better Auth settings are not initialized')
  return {
    sessionExpiresIn: row.session_expires_in,
    otpExpiresIn: row.otp_expires_in,
    rateLimitWindow: row.rate_limit_window,
    rateLimitMax: row.rate_limit_max,
  }
}

async function provision(env: Bindings, authUser: { id: string; email: string; name: string }): Promise<void> {
  const claim = await env.DB.prepare(
    `SELECT invite_token,invite_kind,status FROM registration_claims WHERE auth_user_id=?`,
  ).bind(authUser.id).first<{ invite_token: string; invite_kind: string; status: string }>()
  if (claim?.status === 'provisioned') return
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
  }, { authUserId: authUser.id })
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

function createAuth(env: Bindings, request: Request, waitUntil: (promise: Promise<unknown>) => void, settings: AuthSettings) {
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
    session: { expiresIn: settings.sessionExpiresIn },
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

app.use('*', async (c, next) => {
  const auth = createAuth(c.env, c.req.raw, c.executionCtx.waitUntil.bind(c.executionCtx), await loadAuthSettings(c.env))
  c.set('auth', auth)
  const session = await auth.api.getSession({ headers: c.req.raw.headers }).catch(() => null)
  if (session) c.set('session', session as AuthSession)
  await next()
})

app.post('/api/auth/sign-up/email', async (c) => {
  const input = await c.req.json<{ email?: string; password?: string; name?: string; inviteToken?: string; inviteKind?: string }>()
  if (!input.email || !input.password || !input.name) return c.json({ error: '邮箱、姓名和密码均为必填项' }, 400)
  const inviteToken = input.inviteKind === 'project' ? input.inviteToken?.trim() ?? '' : ''
  if (inviteToken) {
    const validation = await originRequest(c.env, '/api/internal/registration/invitation', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: input.email, inviteToken, inviteKind: 'project' }),
    })
    if (!validation.ok) return c.json({ error: '邀请无效、已过期或与邮箱不匹配' }, validation.status === 404 ? 404 : 403)
  }
  const request = new Request(c.req.raw, { body: JSON.stringify({ email: input.email, password: input.password, name: input.name }) })
  const response = await c.get('auth').handler(request)
  if (response.ok && inviteToken) {
    const result = await response.clone().json<{ user?: { id?: string } }>().catch(() => null)
    if (result?.user?.id) {
      const now = Date.now()
      await c.env.DB.prepare(`INSERT INTO registration_claims(auth_user_id,token_hash,invite_token,invite_kind,email,status,created_at,updated_at) VALUES(?,?,?,?,?,'pending',?,?)`)
        .bind(result.user.id, await sha256(inviteToken), await sealClaim(c.env.BETTER_AUTH_SECRET, inviteToken), 'project', input.email.toLowerCase(), now, now).run()
    }
  }
  return response
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
  })
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

const openShipRead = /^(?:\/projects(?:\/[^/]+)?|\/servers(?:\/[^/]+)?|\/deployments(?:\/[^/]+(?:\/(?:logs|stream|info|usage|build))?)?)$/
const openShipWrite = /^\/deployments(?:\/build\/access|\/[^/]+\/(?:redeploy|rollback|cancel|restart|keep|reject))$/
const openShipUrl = (env: Bindings, path: string) => new URL(`/api/proxy/api${path}`, env.OPENSHIP_BASE_URL)
const openShipProjectIds = (env: Bindings) => [...new Set(env.OPENSHIP_PROJECT_IDS.split(',').map((id) => id.trim()).filter(Boolean))]

function openShipHeaders(c: AppContext): Headers {
  const headers = new Headers(c.req.raw.headers)
  headers.set('authorization', `Bearer ${c.env.OPENSHIP_PAT}`)
  headers.delete('cookie')
  headers.delete('host')
  if (c.env.CF_ACCESS_CLIENT_ID) headers.set('cf-access-client-id', c.env.CF_ACCESS_CLIENT_ID)
  if (c.env.CF_ACCESS_CLIENT_SECRET) headers.set('cf-access-client-secret', c.env.CF_ACCESS_CLIENT_SECRET)
  return headers
}

async function openShip(c: AppContext): Promise<Response> {
  const session = requireAdmin(c)
  if (session instanceof Response) return session
  const path = c.req.path.slice('/api/control/openship'.length)
  const allowed = c.req.method === 'GET' ? openShipRead.test(path) : c.req.method === 'POST' && openShipWrite.test(path)
  if (!allowed) return c.json({ error: 'OpenShip capability is not exposed' }, 404)
  const target = openShipUrl(c.env, `${path}${new URL(c.req.url).search}`)
  const response = await fetch(target, { method: c.req.method, headers: openShipHeaders(c), body: c.req.method === 'GET' ? null : c.req.raw.body })
  if (c.req.method !== 'GET') c.executionCtx.waitUntil(c.env.DB.prepare(`INSERT INTO control_audit(id,actor_user_id,action,resource,reason,created_at) VALUES(?,?,?,?,?,?)`)
    .bind(crypto.randomUUID(), session.user.id, c.req.method, `openship:${path}`, c.req.header('x-control-reason') ?? null, Date.now()).run().then(() => undefined))
  return response
}

app.get('/api/control/deployment-dashboard', async (c) => {
  const session = requireAdmin(c)
  if (session instanceof Response) return session
  const response = await fetch(openShipUrl(c.env, '/deployments?page=1&perPage=30'), { headers: openShipHeaders(c) })
  if (!response.ok) return c.json({ error: 'OpenShip unavailable' }, 502)
  const payload = await response.json<{ data?: Array<Record<string, unknown>>; total?: number }>()
  const projectIds = new Set(openShipProjectIds(c.env))
  const rows = (Array.isArray(payload.data) ? payload.data : []).filter((row) => typeof row.projectId === 'string' && projectIds.has(row.projectId))
  c.header('cache-control', 'private, no-store')
  return c.json({
    data: rows.map((row) => ({
      id: row.id,
      projectId: row.projectId,
      projectName: row.projectName,
      status: row.status,
      commitSha: row.commitSha,
      commitMessage: row.commitMessage,
      trigger: row.trigger,
      environment: row.environment,
      framework: row.framework,
      buildDurationMs: row.buildDurationMs,
      version: row.version,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      isActive: row.isActive,
    })),
    total: rows.length,
  })
})

app.get('/api/control/production-topology', async (c) => {
  const session = requireAdmin(c)
  if (session instanceof Response) return session
  const response = await fetch(openShipUrl(c.env, '/issues/health'), { headers: openShipHeaders(c) })
  if (!response.ok) return c.json({ error: 'OpenShip unavailable' }, 502)
  const payload = await response.json<{ data?: Array<Record<string, unknown>>; watching?: boolean }>()
  const services = (Array.isArray(payload.data) ? payload.data : []).slice(0, 100).flatMap((row) => {
    const id = typeof row.serviceId === 'string' ? row.serviceId : ''
    const project = typeof row.projectName === 'string' ? row.projectName : ''
    const service = typeof row.serviceName === 'string' ? row.serviceName : ''
    const server = typeof row.serverName === 'string' ? row.serverName : ''
    if (!id || !project || !service || !server || !productionTopology[project]?.includes(service)) return []
    const state = row.state === 'healthy' || row.state === 'unhealthy' || row.state === 'crash-looping' || row.state === 'down'
      ? row.state
      : 'unknown'
    return [{ id, project, service, server, state, observedAt: typeof row.observedAt === 'string' ? row.observedAt : null }]
  })
  const healthy = services.filter((service) => service.state === 'healthy').length
  const observedAt = services.map((service) => service.observedAt).filter((value): value is string => Boolean(value)).sort().at(-1) ?? null
  c.header('cache-control', 'private, no-store')
  return c.json({
    watching: payload.watching === true,
    observedAt,
    summary: {
      services: services.length,
      healthy,
      attention: services.length - healthy,
      projects: new Set(services.map((service) => service.project)).size,
      servers: new Set(services.map((service) => service.server)).size,
    },
    services,
  })
})

app.all('/api/control/openship/*', openShip)

app.get('/api/control/releases', async (c) => {
  const session = requireAdmin(c)
  if (session instanceof Response) return session
  const { results } = await c.env.DB.prepare(`SELECT commit_sha,status,created_at,updated_at FROM release_requests ORDER BY created_at DESC LIMIT 20`).all()
  return c.json({ data: results })
})

app.get('/api/control/status-page', async (c) => {
  const session = requireAdmin(c)
  if (session instanceof Response) return session
  try {
    const [pageResponse, heartbeatResponse] = await Promise.all([
      fetch(new URL('/api/status-page/lingxiloop', c.env.UPTIME_BASE_URL)),
      fetch(new URL('/api/status-page/heartbeat/lingxiloop', c.env.UPTIME_BASE_URL)),
    ])
    if (!pageResponse.ok || !heartbeatResponse.ok) return c.json({ error: 'status provider unavailable' }, 502)
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
    c.header('cache-control', 'private, max-age=30, stale-while-revalidate=60')
    return c.json({ config: page.config, incident: page.incident, groups: page.publicGroupList, maintenanceList: page.maintenanceList, history, latest, uptime: heartbeat.uptimeList })
  } catch {
    return c.json({ error: 'status provider unavailable' }, 502)
  }
})

app.get('/api/control/auth-settings', async (c) => {
  const session = requireAdmin(c)
  if (session instanceof Response) return session
  return c.json({
    ...(await loadAuthSettings(c.env)),
    locked: {
      defaultRole: 'user',
      requireEmailVerification: true,
      captchaProvider: 'cloudflare-turnstile',
      captchaEndpoints: ['/sign-up/email', '/sign-in/email', '/request-password-reset'],
    },
    secrets: {
      smtp: Boolean(c.env.ALIYUN_OTP_EMAIL_PASSWORD),
      turnstile: Boolean(c.env.TURNSTILE_SECRET_KEY),
    },
  })
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
  const now = Date.now()
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE auth_settings SET session_expires_in=?,otp_expires_in=?,rate_limit_window=?,rate_limit_max=?,updated_at=?,updated_by=? WHERE id=1`)
      .bind(values.sessionExpiresIn, values.otpExpiresIn, values.rateLimitWindow, values.rateLimitMax, now, session.user.id),
    c.env.DB.prepare(`INSERT INTO control_audit(id,actor_user_id,action,resource,reason,detail,created_at) VALUES(?,?,?,?,?,?,?)`)
      .bind(crypto.randomUUID(), session.user.id, 'update', 'better-auth:settings', reason, JSON.stringify(values), now),
  ])
  return c.json(values)
})

app.post('/api/control/platform/users/:id/:action', async (c) => {
  const adminSession = requireAdmin(c)
  if (adminSession instanceof Response) return adminSession
  const action = c.req.param('action')
  if (action !== 'suspend' && action !== 'restore' && action !== 'delete') return c.json({ error: 'unsupported user lifecycle action' }, 404)
  const appUserId = c.req.param('id')
  const adminLink = await c.env.DB.prepare(`SELECT app_user_id FROM app_user_links WHERE auth_user_id=?`).bind(adminSession.user.id).first<{ app_user_id: string }>()
  if (!adminLink) return c.json({ error: 'administrator business account is not provisioned' }, 409)
  const link = await c.env.DB.prepare(`SELECT auth_user_id FROM app_user_links WHERE app_user_id=?`).bind(appUserId).first<{ auth_user_id: string }>()
  if (!link) return c.json({ error: 'auth user mapping not found' }, 404)
  const raw = await c.req.text()
  const reason = (JSON.parse(raw || '{}') as { reason?: string }).reason?.trim()
  if (!reason) return c.json({ error: 'reason required' }, 400)
  if (action === 'suspend') {
    await c.env.DB.batch([
      c.env.DB.prepare(`UPDATE user SET banned=1,banReason=?,updatedAt=? WHERE id=?`).bind(reason, Date.now(), link.auth_user_id),
      c.env.DB.prepare(`DELETE FROM session WHERE userId=?`).bind(link.auth_user_id),
      c.env.DB.prepare(`UPDATE app_user_links SET suspended_at=? WHERE auth_user_id=?`).bind(Date.now(), link.auth_user_id),
    ])
  }
  const response = await originRequest(c.env, `/api/admin/users/${encodeURIComponent(appUserId)}/${action}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: raw,
  }, { appUserId: adminLink.app_user_id, authUserId: adminSession.user.id })
  if (response.ok && action === 'restore') {
    await c.env.DB.batch([
      c.env.DB.prepare(`UPDATE user SET banned=0,banReason=NULL,banExpires=NULL,updatedAt=? WHERE id=?`).bind(Date.now(), link.auth_user_id),
      c.env.DB.prepare(`UPDATE app_user_links SET suspended_at=NULL WHERE auth_user_id=?`).bind(link.auth_user_id),
    ])
  }
  if (response.ok && action === 'delete') {
    await c.env.DB.prepare(`DELETE FROM user WHERE id=?`).bind(link.auth_user_id).run()
  }
  return response
})

app.all('/api/health*', (c) => originRequest(c.env, c.req.path + new URL(c.req.url).search, { method: c.req.method, headers: c.req.raw.headers }))
app.all('/api/meta', (c) => originRequest(c.env, c.req.path, { method: c.req.method, headers: c.req.raw.headers }))

app.post('/api/internal/releases', async (c) => {
  const raw = await c.req.text()
  if (!await secretMatches(await hmac(c.env.RELEASE_HMAC_SECRET, raw), c.req.header('x-release-signature') ?? '')) return c.json({ error: 'invalid release signature' }, 401)
  let input: { commitSha?: string; deployCommitSha?: string; imageDigests?: Record<string, string> }
  try { input = JSON.parse(raw) as typeof input } catch { return c.json({ error: 'invalid release payload' }, 400) }
  if (!input.commitSha || !/^[0-9a-f]{40}$/.test(input.commitSha) || !input.deployCommitSha || !/^[0-9a-f]{40}$/.test(input.deployCommitSha) || !input.imageDigests || Array.isArray(input.imageDigests)) return c.json({ error: 'invalid release payload' }, 400)
  if (releaseImageNames.some((name) => !input.imageDigests?.[name]?.match(new RegExp(`lingxiloop-${name}:[0-9a-f]{40}$`)))) return c.json({ error: 'release images must be complete and immutable' }, 400)
  const projectIds = openShipProjectIds(c.env)
  if (!projectIds.length || projectIds.some((id) => !/^proj_[\w-]+$/.test(id))) return c.json({ error: 'invalid OpenShip project configuration' }, 500)
  const imageTargets = c.env.OPENSHIP_IMAGE_TARGETS.split(',').map((target) => target.trim().split(':'))
  if (new Set(imageTargets.map(([name]) => name)).size !== releaseImageNames.length || imageTargets.some(([name, projectId, serviceId]) => !releaseImageNames.some((imageName) => imageName === name) || !projectIds.includes(projectId) || !/^svc_[\w-]+$/.test(serviceId))) return c.json({ error: 'invalid OpenShip image configuration' }, 500)
  const existing = await c.env.DB.prepare(`SELECT status,openship_deployment_id FROM release_requests WHERE commit_sha=?`).bind(input.commitSha).first<{ status: string; openship_deployment_id: string | null }>()
  if (existing?.status === 'triggered') return c.json(existing)
  let previous: Array<{ projectId: string; deploymentId?: string; accepted?: boolean; error?: string }> = []
  try {
    const parsed = JSON.parse(existing?.openship_deployment_id ?? '[]') as unknown
    if (Array.isArray(parsed)) previous = parsed as typeof previous
  } catch { previous = [] }
  const now = Date.now()
  if (existing) await c.env.DB.prepare(`UPDATE release_requests SET image_digests=?,status='triggering',error=NULL,updated_at=? WHERE commit_sha=?`).bind(JSON.stringify(input.imageDigests), now, input.commitSha).run()
  else await c.env.DB.prepare(`INSERT INTO release_requests(commit_sha,image_digests,status,created_at,updated_at) VALUES(?,?,'triggering',?,?)`).bind(input.commitSha, JSON.stringify(input.imageDigests), now, now).run()
  const syncErrors = (await Promise.all(imageTargets.map(async ([name, projectId, serviceId]) => {
    try {
      const response = await fetch(openShipUrl(c.env, `/projects/${projectId}/services/${serviceId}`), {
        method: 'PATCH', headers: { authorization: `Bearer ${c.env.OPENSHIP_PAT}`, 'content-type': 'application/json' },
        body: JSON.stringify({ image: input.imageDigests?.[name] }),
      })
      return response.ok ? null : `${projectId}/${serviceId}: image sync failed (${response.status})`
    } catch { return `${projectId}/${serviceId}: image sync unavailable` }
  }))).filter(Boolean)
  if (syncErrors.length) {
    const error = syncErrors.join('; ')
    await c.env.DB.prepare(`UPDATE release_requests SET status='failed',error=?,updated_at=? WHERE commit_sha=?`).bind(error, Date.now(), input.commitSha).run()
    return c.json({ commitSha: input.commitSha, status: 'failed', error }, 502)
  }
  const completed = new Map(previous.filter((item) => item.deploymentId || item.accepted).map((item) => [item.projectId, item]))
  const attempted = await Promise.all(projectIds.filter((projectId) => !completed.has(projectId)).map(async (projectId) => {
    try {
      const response = await fetch(openShipUrl(c.env, '/deployments'), {
        method: 'POST', headers: { authorization: `Bearer ${c.env.OPENSHIP_PAT}`, 'content-type': 'application/json' },
        body: JSON.stringify({ projectId, branch: 'main', commitSha: input.deployCommitSha, environment: 'production' }),
      })
      const result = await response.json().catch(() => ({})) as { id?: string; deploymentId?: string; deployment_id?: string; error?: string; data?: { id?: string } }
      const deploymentId = result.deployment_id ?? result.deploymentId ?? result.id ?? result.data?.id
      return response.ok ? deploymentId ? { projectId, deploymentId } : { projectId, accepted: true } : { projectId, error: result.error ?? `OpenShip ${response.status}` }
    } catch { return { projectId, error: 'OpenShip unavailable' } }
  }))
  for (const item of attempted) completed.set(item.projectId, item)
  const deployments = projectIds.map((projectId) => completed.get(projectId) ?? { projectId, error: 'not triggered' })
  const succeeded = deployments.filter((item) => item.deploymentId || item.accepted).length
  const status = succeeded === projectIds.length ? 'triggered' : succeeded ? 'partial' : 'failed'
  const error = deployments.filter((item) => item.error).map((item) => `${item.projectId}: ${item.error}`).join('; ') || null
  await c.env.DB.prepare(`UPDATE release_requests SET status=?,openship_deployment_id=?,error=?,updated_at=? WHERE commit_sha=?`)
    .bind(status, JSON.stringify(deployments), error, Date.now(), input.commitSha).run()
  return c.json({ commitSha: input.commitSha, status, deployments }, status === 'triggered' ? 202 : 502)
})

app.all('/api/control/platform/*', async (c) => {
  const session = requireAdmin(c)
  if (session instanceof Response) return session
  const link = await c.env.DB.prepare(`SELECT app_user_id FROM app_user_links WHERE auth_user_id=? AND suspended_at IS NULL`).bind(session.user.id).first<{ app_user_id: string }>()
  if (!link) return c.json({ error: 'business account is not provisioned' }, 409)
  const suffix = c.req.path.slice('/api/control/platform'.length)
  return originRequest(c.env, `/api/admin${suffix}${new URL(c.req.url).search}`, { method: c.req.method, headers: c.req.raw.headers, body: ['GET', 'HEAD'].includes(c.req.method) ? null : c.req.raw.body }, { appUserId: link.app_user_id, authUserId: session.user.id })
})

app.all('/api/*', async (c) => {
  if (c.req.path.startsWith('/api/webhooks/')) return originRequest(c.env, c.req.path + new URL(c.req.url).search, { method: c.req.method, headers: c.req.raw.headers, body: ['GET', 'HEAD'].includes(c.req.method) ? null : c.req.raw.body })
  const session = requireSession(c)
  if (session instanceof Response) return session
  let link = await c.env.DB.prepare(`SELECT app_user_id FROM app_user_links WHERE auth_user_id=? AND suspended_at IS NULL`).bind(session.user.id).first<{ app_user_id: string }>()
  if (!link && session.user.emailVerified) {
    await provision(c.env, session.user)
    link = await c.env.DB.prepare(`SELECT app_user_id FROM app_user_links WHERE auth_user_id=? AND suspended_at IS NULL`).bind(session.user.id).first<{ app_user_id: string }>()
  }
  if (!link) return c.json({ error: 'business account is not provisioned' }, 409)
  const path = c.req.path === '/api/session' ? '/api/auth/me' : c.req.path
  return originRequest(c.env, path + new URL(c.req.url).search, { method: c.req.method, headers: c.req.raw.headers, body: ['GET', 'HEAD'].includes(c.req.method) ? null : c.req.raw.body }, { appUserId: link.app_user_id, authUserId: session.user.id })
})

export default app
