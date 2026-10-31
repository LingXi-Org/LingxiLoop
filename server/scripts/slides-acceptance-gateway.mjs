// Local test credential sign-in through the actual control-plane Worker and D1.
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { Miniflare, Log, LogLevel } from 'miniflare'
import { readFile, readdir } from 'node:fs/promises'
import { hashPassword } from 'better-auth/crypto'

export async function gatewayFixture({ origin, userId, gatewaySecret }) {
  const bundle = await build({
    entryPoints: ['workers/control-plane/src/index.ts'],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'neutral',
    conditions: ['workerd', 'worker', 'browser'],
    mainFields: ['module', 'main'],
    external: ['node:*', 'cloudflare:*'],
    target: 'es2022',
  })
  const worker = new Miniflare({
    modules: [
      {
        type: 'ESModule',
        path: process.cwd() + '/server/scripts/slides-acceptance-worker.mjs',
        contents: bundle.outputFiles[0].text,
      },
    ],
    compatibilityDate: '2026-09-01',
    compatibilityFlags: ['nodejs_compat'],
    log: new Log(LogLevel.ERROR),
    d1Databases: ['DB'],
    host: '127.0.0.1',
    port: 0,
    bindings: {
      ORIGIN_BASE_URL: origin,
      AUTH_ALLOWED_HOSTS: '127.0.0.1,localhost',
      APP_VERSION: 'slides-isolated-test',
      BETTER_AUTH_SECRET: 'isolated-slides-auth-test-secret-minimum-32-chars',
      GATEWAY_HMAC_SECRET: gatewaySecret,
      TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA',
      ALIYUN_OTP_EMAIL_PASSWORD: 'unused-test-fixture',
      SIGILLO_PROVIDER_URL: 'https://unused.invalid',
      SIGILLO_SSO_SECRET: 'unused-test-fixture',
    },
    outboundService: async (req) => {
      const response = await fetch(req.url, {
        method: req.method,
        headers: Object.fromEntries(req.headers),
        ...(!['GET', 'HEAD'].includes(req.method) ? { body: Buffer.from(await req.arrayBuffer()) } : {}),
        signal: AbortSignal.timeout(15_000),
      })
      return new Response(response.body, { status: response.status, headers: Object.fromEntries(response.headers) })
    },
  })
  await worker.ready
  const db = await worker.getD1Database('DB')
  for (const file of (await readdir('workers/control-plane/migrations')).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = await readFile('workers/control-plane/migrations/' + file, 'utf8')
    await db.exec(sql.replace(/--[^\n]*/g, '').replaceAll('\n', ' '))
  }
  const now = Math.floor(Date.now() / 1000),
    email = 'slides-601@example.test',
    password = 'Slides601-local-test-only'
  await db
    .prepare('INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,1,?,?)')
    .bind(userId, 'Slides acceptance', email, now, now)
    .run()
  await db
    .prepare(
      'INSERT INTO account(id,accountId,providerId,issuer,userId,password,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?,?)',
    )
    .bind(
      'slides-local-credential',
      userId,
      'credential',
      'local:credential',
      userId,
      await hashPassword(password),
      now,
      now,
    )
    .run()
  await db
    .prepare('INSERT INTO app_user_links(auth_user_id,app_user_id,provisioned_at) VALUES(?,?,?)')
    .bind(userId, userId, now)
    .run()
  const url = (await worker.ready).origin
  const login = await fetch(url + '/api/auth/sign-in/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: url, 'x-captcha-response': 'XXXX.DUMMY.TOKEN.XXXX' },
    body: JSON.stringify({ email, password }),
  })
  assert.equal(login.status, 200, `local credential sign-in returned ${login.status}`)
  const cookie = login.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ')
  assert.ok(cookie)
  return { worker, url, cookie, email }
}
