import assert from 'node:assert/strict'
import test from 'node:test'
import type { Queryable } from '../db/queryable.js'
import { OAuthApplication } from '../modules/identity/oauth-application.js'
import {
  identityDoneUrl,
  identityErrorUrl,
  identitySuspendedUrl,
  identityWaitlistUrl,
} from '../modules/identity/oauth-urls.js'

function queryable(
  handler: (text: string, params: readonly unknown[]) => { rows?: unknown[]; rowCount?: number },
): Queryable {
  return {
    query: async (text, params = []) => ({
      command: '',
      rowCount: null,
      oid: 0,
      fields: [],
      ...handler(text, params),
    }) as never,
  }
}

const profile = {
  providerId: 'identity-1',
  email: 'person@example.com',
  displayName: 'Person',
  avatarUrl: 'https://identity.example/avatar.png',
}

function dependencies(db: Queryable) {
  const calls = {
    enqueue: 0,
    mirror: 0,
    finalize: 0,
    session: 0,
    audit: [] as string[],
  }
  return {
    calls,
    value: {
      transaction: async <T>(work: (transaction: Queryable) => Promise<T>) => work(db),
      fetchProfile: async () => profile,
      waitlistEnabled: async () => false,
      isAllowlistedAdmin: () => false,
      enqueueWaitlist: async () => { calls.enqueue += 1 },
      mirrorAvatar: async () => { calls.mirror += 1; return 'https://cdn.example/avatar.png' },
      provisionCompany: async () => false,
      finalizeCompany: async () => { calls.finalize += 1 },
      createLoginSession: async () => { calls.session += 1; return { token: 'session-token', expiresAt: new Date(0) } },
      audit: async (input: { kind: string }) => { calls.audit.push(input.kind) },
      defaultDoneUrl: 'https://app.example/',
      doneUrl: identityDoneUrl,
      waitlistUrl: identityWaitlistUrl,
      suspendedUrl: identitySuspendedUrl,
      userId: () => 'user-new',
      companyId: () => 'company-new',
      projectId: () => 'project-new',
    },
  }
}

function linkedUserDb(): Queryable {
  return queryable((text) => {
    if (/FROM user_identities/.test(text)) return { rows: [{ user_id: 'user-1' }] }
    if (/SELECT suspended_at/.test(text)) return { rows: [{ suspended_at: null, suspension_reason: null }] }
    if (/FROM company_members/.test(text)) return { rows: [{ company_id: 'company-1' }] }
    return { rows: [], rowCount: 1 }
  })
}

test('identity callback fails explicitly when authoritative avatar mirroring fails', async () => {
  const db = linkedUserDb()
  const fixture = dependencies(db)
  fixture.value.mirrorAvatar = async () => {
    fixture.calls.mirror += 1
    throw new Error('R2 unavailable')
  }
  const application = new OAuthApplication(fixture.value)

  await assert.rejects(application.handleCallback({
    provider: 'lingxi', code: 'code', returnUrl: null, ip: null, userAgent: null,
  }), /R2 unavailable/)
  assert.equal(fixture.calls.mirror, 1)
  assert.equal(fixture.calls.finalize, 0)
  assert.equal(fixture.calls.session, 0)
})

test('new identities use the explicit waitlist path without creating a product session', async () => {
  const db = queryable(() => ({ rows: [] }))
  const fixture = dependencies(db)
  fixture.value.waitlistEnabled = async () => true
  const application = new OAuthApplication(fixture.value)

  const result = await application.handleCallback({
    provider: 'lingxi', code: 'code', returnUrl: 'https://app.example/return', ip: '127.0.0.1', userAgent: 'test',
  })

  assert.equal(result, 'https://app.example/return?waitlist=1&email=person%40example.com')
  assert.equal(fixture.calls.enqueue, 1)
  assert.deepEqual(fixture.calls.audit, ['signup_waitlisted'])
  assert.equal(fixture.calls.mirror, 0)
  assert.equal(fixture.calls.session, 0)
})

test('unique conflicts retry the complete identity transaction before issuing a session', async () => {
  const db = linkedUserDb()
  const fixture = dependencies(db)
  let attempts = 0
  fixture.value.transaction = async <T>(work: (transaction: Queryable) => Promise<T>) => {
    attempts += 1
    if (attempts === 1) throw Object.assign(new Error('duplicate'), { code: '23505' })
    return work(db)
  }
  const application = new OAuthApplication(fixture.value)

  const result = await application.handleCallback({
    provider: 'lingxi', code: 'code', returnUrl: null, ip: null, userAgent: null,
  })

  assert.equal(attempts, 3)
  assert.equal(fixture.calls.mirror, 1)
  assert.equal(fixture.calls.finalize, 1)
  assert.equal(fixture.calls.session, 1)
  assert.equal(result, 'https://app.example/#token=session-token&companyId=company-1')
})

test('OAuth result URLs expose one canonical signal only', () => {
  const waitlist = identityWaitlistUrl('https://app.example/return', profile.email)
  assert.equal(waitlist, 'https://app.example/return?waitlist=1&email=person%40example.com')
  assert.doesNotMatch(waitlist, /#/)
  assert.equal(identityDoneUrl('https://app.example/', 'secret', 'company-1'), 'https://app.example/#token=secret&companyId=company-1')
  assert.equal(identitySuspendedUrl('https://app.example/', profile.email, 'review'), 'https://app.example/#suspended=1&email=person%40example.com&reason=review')
  assert.equal(identityErrorUrl(null, 'https://app.example/', 'denied'), 'https://app.example/#error=denied')
})
