import { test } from 'node:test'
import assert from 'node:assert/strict'
import { env } from '../env.js'
import { setUserTier, sub2apiOpenAIBaseURL } from '../sub2api.js'

test('sub2apiOpenAIBaseURL prefers the internal service URL for backend model traffic', () => {
  assert.equal(
    sub2apiOpenAIBaseURL({
      internalUrl: 'http://sub2api:8080/',
      publicUrl: 'https://sub2api.example.com/',
    }),
    'http://sub2api:8080/v1',
  )
})
test('sub2apiOpenAIBaseURL falls back to the public URL when no internal URL exists', () => {
  assert.equal(
    sub2apiOpenAIBaseURL({
      internalUrl: '',
      publicUrl: 'https://sub2api.example.com/',
    }),
    'https://sub2api.example.com/v1',
  )
})

const savedSub2apiEnv = {
  internalUrl: env.SUB2API_INTERNAL_URL,
  adminKey: env.SUB2API_ADMIN_KEY,
  freeGroup: env.SUB2API_TIER_FREE_GROUP_ID,
  proGroup: env.SUB2API_TIER_PRO_GROUP_ID,
  maxGroup: env.SUB2API_TIER_MAX_GROUP_ID,
}
const originalFetch = globalThis.fetch

function restoreSub2apiTestState(): void {
  env.SUB2API_INTERNAL_URL = savedSub2apiEnv.internalUrl
  env.SUB2API_ADMIN_KEY = savedSub2apiEnv.adminKey
  env.SUB2API_TIER_FREE_GROUP_ID = savedSub2apiEnv.freeGroup
  env.SUB2API_TIER_PRO_GROUP_ID = savedSub2apiEnv.proGroup
  env.SUB2API_TIER_MAX_GROUP_ID = savedSub2apiEnv.maxGroup
  globalThis.fetch = originalFetch
}

function configureSub2apiTestEnv(): void {
  env.SUB2API_INTERNAL_URL = 'http://sub2api.test'
  env.SUB2API_ADMIN_KEY = 'admin-test-key'
  env.SUB2API_TIER_FREE_GROUP_ID = 2
  env.SUB2API_TIER_PRO_GROUP_ID = 3
  env.SUB2API_TIER_MAX_GROUP_ID = 4
}

function ok(data: unknown): Response {
  return new Response(JSON.stringify({ code: 0, message: 'success', data }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

test('setUserTier uses subscription-group sync instead of replace-group', async () => {
  configureSub2apiTestEnv()
  const future = new Date(Date.now() + 86_400_000).toISOString()
  const past = new Date(Date.now() - 86_400_000).toISOString()
  const calls: Array<{ method: string; path: string; body: unknown }> = []

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input))
    const method = init?.method ?? 'GET'
    const body = init?.body ? JSON.parse(String(init.body)) as unknown : null
    const path = `${url.pathname}${url.search}`
    calls.push({ method, path, body })

    if (method === 'GET' && path === '/api/v1/admin/users/76/subscriptions') {
      return ok([
        { id: 10, user_id: 76, group_id: 2, status: 'active', expires_at: future, daily_usage_usd: 0, weekly_usage_usd: 0, monthly_usage_usd: 0, daily_window_start: null, weekly_window_start: null, monthly_window_start: null },
        { id: 11, user_id: 76, group_id: 9, status: 'active', expires_at: future, daily_usage_usd: 0, weekly_usage_usd: 0, monthly_usage_usd: 0, daily_window_start: null, weekly_window_start: null, monthly_window_start: null },
        { id: 12, user_id: 76, group_id: 3, status: 'expired', expires_at: past, daily_usage_usd: 0, weekly_usage_usd: 0, monthly_usage_usd: 0, daily_window_start: null, weekly_window_start: null, monthly_window_start: null },
      ])
    }
    if (method === 'DELETE' && path === '/api/v1/admin/subscriptions/12') return ok({ message: 'revoked' })
    if (method === 'POST' && path === '/api/v1/admin/subscriptions/assign') return ok({ id: 13 })
    if (method === 'GET' && path === '/api/v1/admin/users/76/api-keys?page=1&page_size=1000') {
      return ok({ items: [{ id: 501, group_id: 2 }, { id: 502, group_id: 3 }], total: 2, page: 1, page_size: 1000, pages: 1 })
    }
    if (method === 'PUT' && path === '/api/v1/admin/api-keys/501') return ok({ api_key: { id: 501, group_id: 3 } })
    if (method === 'DELETE' && path === '/api/v1/admin/subscriptions/10') return ok({ message: 'revoked' })
    return new Response(JSON.stringify({ code: 404, message: `unexpected ${method} ${path}` }), { status: 404 })
  }) as typeof fetch

  try {
    await setUserTier(76, 'pro')
  } finally {
    restoreSub2apiTestState()
  }

  assert.equal(calls.some((c) => c.path.includes('replace-group')), false)
  assert.deepEqual(calls.map((c) => `${c.method} ${c.path}`), [
    'GET /api/v1/admin/users/76/subscriptions',
    'DELETE /api/v1/admin/subscriptions/12',
    'POST /api/v1/admin/subscriptions/assign',
    'GET /api/v1/admin/users/76/api-keys?page=1&page_size=1000',
    'PUT /api/v1/admin/api-keys/501',
    'DELETE /api/v1/admin/subscriptions/10',
  ])
  assert.deepEqual(calls[2]?.body, {
    user_id: 76,
    group_id: 3,
    validity_days: 3650,
    notes: 'lingxiloop auto-provision',
  })
  assert.deepEqual(calls[4]?.body, { group_id: 3 })
})

test('setUserTier is idempotent when subscription and API keys already match', async () => {
  configureSub2apiTestEnv()
  const future = new Date(Date.now() + 86_400_000).toISOString()
  const calls: Array<{ method: string; path: string }> = []

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input))
    const method = init?.method ?? 'GET'
    const path = `${url.pathname}${url.search}`
    calls.push({ method, path })
    if (method === 'GET' && path === '/api/v1/admin/users/76/subscriptions') {
      return ok([
        { id: 20, user_id: 76, group_id: 3, status: 'active', expires_at: future, daily_usage_usd: 0, weekly_usage_usd: 0, monthly_usage_usd: 0, daily_window_start: null, weekly_window_start: null, monthly_window_start: null },
      ])
    }
    if (method === 'GET' && path === '/api/v1/admin/users/76/api-keys?page=1&page_size=1000') {
      return ok({ items: [{ id: 501, group_id: 3 }], total: 1, page: 1, page_size: 1000, pages: 1 })
    }
    return new Response(JSON.stringify({ code: 404, message: `unexpected ${method} ${path}` }), { status: 404 })
  }) as typeof fetch

  try {
    await setUserTier(76, 'pro')
  } finally {
    restoreSub2apiTestState()
  }

  assert.deepEqual(calls.map((c) => `${c.method} ${c.path}`), [
    'GET /api/v1/admin/users/76/subscriptions',
    'GET /api/v1/admin/users/76/api-keys?page=1&page_size=1000',
  ])
})
