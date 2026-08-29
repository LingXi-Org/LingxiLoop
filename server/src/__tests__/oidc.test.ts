import assert from 'node:assert/strict'
import test from 'node:test'
import {
  clearOidcDiscoveryCacheForTest,
  discoverOidc,
  normalizeOidcProfile,
} from '../modules/identity/oidc-protocol.js'

test('OIDC discovery uses issuer metadata and caches it', async (t) => {
  clearOidcDiscoveryCacheForTest()
  const originalFetch = globalThis.fetch
  let calls = 0
  globalThis.fetch = async (input) => {
    calls++
    assert.equal(String(input), 'http://identity.test/oidc/.well-known/openid-configuration')
    return new Response(JSON.stringify({
      issuer: 'http://identity.test/oidc',
      authorization_endpoint: 'http://identity.test/authorize',
      token_endpoint: 'http://identity.test/token',
      userinfo_endpoint: 'http://identity.test/userinfo',
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  t.after(() => { globalThis.fetch = originalFetch; clearOidcDiscoveryCacheForTest() })

  const first = await discoverOidc('http://identity.test/oidc/')
  const second = await discoverOidc('http://identity.test/oidc')
  assert.equal(first.authorization_endpoint, 'http://identity.test/authorize')
  assert.equal(second, first)
  assert.equal(calls, 1)
})

test('OIDC discovery rejects an issuer mismatch', async (t) => {
  clearOidcDiscoveryCacheForTest()
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify({
    issuer: 'https://attacker.example',
    authorization_endpoint: 'https://attacker.example/authorize',
    token_endpoint: 'https://attacker.example/token',
    userinfo_endpoint: 'https://attacker.example/userinfo',
  }))
  t.after(() => { globalThis.fetch = originalFetch; clearOidcDiscoveryCacheForTest() })
  await assert.rejects(discoverOidc('https://identity.test/oidc'), /issuer mismatch/)
})

test('OIDC profile normalization requires verified email and maps standard claims', () => {
  assert.deepEqual(normalizeOidcProfile({
    sub: 'user-123',
    email: 'Person@Example.COM',
    email_verified: true,
    name: 'Person Name',
    picture: 'https://cdn.example/avatar.png',
  }), {
    providerId: 'user-123',
    email: 'person@example.com',
    displayName: 'Person Name',
    avatarUrl: 'https://cdn.example/avatar.png',
  })
  assert.throws(() => normalizeOidcProfile({
    sub: 'user-123', email: 'person@example.com', email_verified: false,
  }), /no verified email/)
})
