import { applyD1Migrations, env, fetchMock, SELF } from 'cloudflare:test'
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
    expect(tables.results.map((row) => row.name)).toEqual(expect.arrayContaining(['user', 'session', 'app_user_links', 'registration_claims', 'release_requests', 'control_audit', 'auth_settings']))
    const accountColumns = await env.DB.prepare(`PRAGMA table_info(account)`).all<{ name: string; notnull: number }>()
    expect(accountColumns.results).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'issuer', notnull: 1 })]))
    const authSettings = await env.DB.prepare(`SELECT session_expires_in,otp_expires_in,rate_limit_window,rate_limit_max FROM auth_settings WHERE id=1`).first()
    expect(authSettings).toEqual({ session_expires_in: 604800, otp_expires_in: 300, rate_limit_window: 60, rate_limit_max: 60 })
    const response = await SELF.fetch('https://lingxiloop-control-plane.yangyangli0426.workers.dev/api/control/releases')
    expect(response.status).toBe(401)
    const authSettingsResponse = await SELF.fetch('https://lingxiloop-control-plane.yangyangli0426.workers.dev/api/control/auth-settings')
    expect(authSettingsResponse.status).toBe(401)
  })

  it('keeps bootstrap locked behind its secret', async () => {
    const response = await SELF.fetch('https://lingxiloop-control-plane.yangyangli0426.workers.dev/api/internal/bootstrap-admin', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: 'wrong', email: 'admin@example.com' }),
    })
    expect(response.status).toBe(401)
  })

  it('fans one signed release out to every OpenShip project exactly once', async () => {
    const commitSha = 'a'.repeat(40)
    const deployCommitSha = 'b'.repeat(40)
    const body = JSON.stringify({ commitSha, deployCommitSha, imageDigests: { server: `server:${commitSha}` } })
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('test-release-secret'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)))
    const signature = btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
    fetchMock.activate()
    fetchMock.disableNetConnect()
    const openShip = fetchMock.get('https://openship.example.com')
    for (const projectId of ['proj_test-a', 'proj_test-b']) {
      openShip.intercept({
        path: '/api/proxy/api/deployments', method: 'POST',
        body: JSON.stringify({ projectId, branch: 'main', commitSha: deployCommitSha, environment: 'production' }),
      }).reply(201, { id: `dep_${projectId}` })
    }
    try {
      const request = () => SELF.fetch('https://admin.example.com/api/internal/releases', {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-release-signature': signature }, body,
      })
      const first = await request()
      expect({ status: first.status, body: await first.json() }).toEqual({
        status: 202,
        body: {
          commitSha,
          status: 'triggered',
          deployments: [
            { projectId: 'proj_test-a', deploymentId: 'dep_proj_test-a' },
            { projectId: 'proj_test-b', deploymentId: 'dep_proj_test-b' },
          ],
        },
      })
      expect((await request()).status).toBe(200)
      expect(await env.DB.prepare(`SELECT status,openship_deployment_id,error FROM release_requests WHERE commit_sha=?`).bind(commitSha).first()).toEqual({
        status: 'triggered',
        openship_deployment_id: JSON.stringify([
          { projectId: 'proj_test-a', deploymentId: 'dep_proj_test-a' },
          { projectId: 'proj_test-b', deploymentId: 'dep_proj_test-b' },
        ]),
        error: null,
      })
      fetchMock.assertNoPendingInterceptors()
    } finally { fetchMock.deactivate() }
  })

  it('rejects cross-site authentication writes and registration without CAPTCHA', async () => {
    const crossSite = await SELF.fetch('https://lingxiloop-control-plane.yangyangli0426.workers.dev/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://attacker.example', 'x-captcha-response': 'XXXX.DUMMY.TOKEN.XXXX' },
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
})
