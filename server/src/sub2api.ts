/**
 * sub2api gateway — thin admin SDK + provisioning helpers.
 *
 * sub2api (https://github.com/Wei-Shaw/sub2api) is the LLM quota
 * gateway sitting between cumora-server and OpenAI. Each cumora user
 * gets a mirrored sub2api account + API key + group assignment. All
 * LLM calls flow through sub2api so quotas are enforced at the
 * gateway layer rather than scattered through cumora-server.
 *
 * Provisioning flow (`provisionUser`) — every step uses the admin
 * x-api-key; no auth endpoint is ever touched:
 *   1. POST /api/v1/admin/users               — create user
 *   2. POST /api/v1/admin/subscriptions/assign — bind the tier group
 *   3. POST /api/v1/admin/users/:id/api-keys   — mint user's first key
 *   4. caller persists {sub2api_user_id, sub2api_api_key} on users
 *
 * Earlier this logged in AS the user (POST /auth/login) to obtain a JWT
 * and then hit the user-facing POST /keys, because upstream sub2api had
 * no admin-side mint endpoint. But /auth/* is exactly what app-level
 * Turnstile gates, so that login would break provisioning the moment
 * Turnstile is enabled. Our fork adds POST /admin/users/:id/api-keys, so
 * provisioning is now pure admin API and Turnstile-safe. We still create
 * the sub2api user with a throwaway random password (the admin create
 * endpoint requires one) but never use it to authenticate.
 *
 * Best-effort posture: every helper here returns a Result-shaped value
 * rather than throwing. OAuth sign-in must NEVER fail because sub2api
 * provisioning hiccupped — the user just lands without a sub2api_key
 * and the LLM client falls back to the legacy global key. A background
 * job (TBD) can backfill missing keys.
 */
import { randomBytes } from 'node:crypto'
import { env } from './env.js'

export type Tier = 'free' | 'pro' | 'max'

export interface ProvisionResult {
  sub2apiUserId: number
  apiKey: string
  groupId: number
}

/** Translate cumora's soft tier label to sub2api's numeric group id. */
function tierToGroupId(tier: Tier): number {
  switch (tier) {
    case 'free': return env.SUB2API_TIER_FREE_GROUP_ID
    case 'pro':  return env.SUB2API_TIER_PRO_GROUP_ID
    case 'max':  return env.SUB2API_TIER_MAX_GROUP_ID
  }
}

/** True when env is wired enough that we should actually try to talk
 *  to sub2api. When false, callers should silently fall back to the
 *  legacy global OPENAI_API_KEY path. */
export function sub2apiConfigured(): boolean {
  return Boolean(env.SUB2API_INTERNAL_URL && env.SUB2API_ADMIN_KEY)
}

/** OpenAI-compatible base URL for backend agent/model traffic.
 *
 * Prefer the in-cluster service URL. The public sub2api URL sits behind
 * GCP Ingress, whose request timeout is too short for long streaming
 * Responses calls; routing server and agent-pod traffic through that
 * ingress can abort otherwise successful model calls.
 */
export function sub2apiOpenAIBaseURL(args?: {
  internalUrl?: string
  publicUrl?: string
}): string {
  const internalUrl = (args?.internalUrl ?? env.SUB2API_INTERNAL_URL).replace(/\/+$/, '')
  const publicUrl = (args?.publicUrl ?? env.SUB2API_PUBLIC_URL).replace(/\/+$/, '')
  const base = internalUrl || publicUrl
  return base ? `${base}/v1` : ''
}

/** sub2api wraps every response in {code, message, data}. `code: 0`
 *  is success; any non-zero (incl. HTTP-level 4xx/5xx) carries an
 *  error message we surface to logs. */
interface SubResponse<T> {
  code: number
  message?: string
  data?: T
}

async function adminFetch<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(`${env.SUB2API_INTERNAL_URL}${path}`, {
    ...init,
    headers: {
      'x-api-key': env.SUB2API_ADMIN_KEY,
      'content-type': 'application/json',
      accept: 'application/json',
      ...(init.headers ?? {}),
    },
  })
  const body = (await r.json()) as SubResponse<T>
  if (!r.ok || body.code !== 0) {
    throw new Error(`sub2api ${path} ${r.status}/${body.code}: ${body.message ?? 'unknown error'}`)
  }
  return body.data as T
}

interface AdminUserResponse { id: number; email: string }
interface ApiKeyResponse    { id: number; key: string }
interface AdminAPIKeyRow    { id: number; group_id: number | null }
interface AdminAPIKeyList   { items: AdminAPIKeyRow[]; total: number; page: number; page_size: number; pages: number }

/** End-to-end: create sub2api user + log in + mint key. Returns the
 *  numeric user id and the raw API key, both to be persisted on the
 *  cumora users row. On any step failure, throws — caller decides
 *  whether to swallow (we do during OAuth signup to never block login).
 *
 *  We mirror the cumora user with their REAL email. sub2api's user
 *  list is the operator's source of truth for "who is on this
 *  platform" — showing synthetic addresses defeats that. The sub2api
 *  admin account is provisioned out of the way (set ADMIN_EMAIL on
 *  the sub2api deployment to something like `admin@cumora.local`) so
 *  there's no collision with real user emails. */
export async function provisionUser(args: {
  cumoraUserId: string
  email: string
  displayName: string
  tier?: Tier
}): Promise<ProvisionResult> {
  const tier = args.tier ?? 'free'
  const groupId = tierToGroupId(tier)
  // 24 bytes of base64url = 32 chars — well above sub2api's min=6.
  // The admin create-user endpoint requires a password; we never store
  // it or use it to authenticate (keys are minted via the admin API).
  const throwawayPw = randomBytes(24).toString('base64url')

  // Idempotent provisioning: if a sub2api user with this email already
  // exists (e.g. a previous provisioning run created the user but
  // crashed before we persisted the key, or the operator manually
  // pre-created one), re-assert password + group in-place so a retry
  // still converges instead of permanently stranding the sub2api side.
  let created: AdminUserResponse
  try {
    created = await adminFetch<AdminUserResponse>('/api/v1/admin/users', {
      method: 'POST',
      body: JSON.stringify({
        email: args.email,
        password: throwawayPw,
        username: args.displayName,
        // 0 means "unmapped tier" — we still create the user but with no
        // group access. They'll get gated until SUB2API_TIER_*_GROUP_ID
        // is configured. Better than refusing signup.
        allowed_groups: groupId > 0 ? [groupId] : [],
        // Tag the sub2api row with the cumora user id so the operator
        // can grep / trace either direction.
        notes: `cumora user ${args.cumoraUserId}`,
      }),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (!/email already exists|409/i.test(msg)) throw e
    // Find the existing sub2api user by email.
    const list = await adminFetch<{ items: Array<{ id: number; email: string }> }>(
      `/api/v1/admin/users?search=${encodeURIComponent(args.email)}&page=1&page_size=1`,
    )
    const existing = list.items?.find((u) => u.email.toLowerCase() === args.email.toLowerCase())
    if (!existing) throw new Error(`sub2api claims ${args.email} exists but admin search can't find it`)
    // Reset the password so we can log in and mint a key.
    await adminFetch(`/api/v1/admin/users/${existing.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        password: throwawayPw,
        allowed_groups: groupId > 0 ? [groupId] : [],
      }),
    })
    created = { id: existing.id, email: existing.email }
  }

  // Assign a subscription for the group. sub2api groups marked
  // `subscription_type: subscription` (which is the default for groups
  // we created via the dashboard) refuse to bind an API key to the
  // group unless the user has an active subscription record — even
  // when the group is in allowed_groups. Default to ~10 years validity
  // so the subscription effectively never expires; tier downgrades go
  // through setUserTier (which calls replace-group, not subscription).
  if (groupId > 0) {
    try {
      await adminFetch('/api/v1/admin/subscriptions/assign', {
        method: 'POST',
        body: JSON.stringify({
          user_id: created.id,
          group_id: groupId,
          validity_days: 3650,
          notes: 'cumora auto-provision',
        }),
      })
    } catch (e) {
      // If the user already has an active subscription on this group
      // (e.g. retry after a partial failure), sub2api typically returns
      // a conflict-shaped error. Don't fail the whole provisioning.
      const msg = e instanceof Error ? e.message : String(e)
      if (!/already|exists|active/i.test(msg)) throw e
    }
  }

  // Mint the user's key purely via the admin API (x-api-key). The old
  // path logged in AS the user (POST /auth/login) to get a JWT, then hit
  // the user-facing POST /keys — but /auth/* is exactly what app-level
  // Turnstile gates, so that login would fail once Turnstile is enabled.
  // The fork now exposes POST /admin/users/:id/api-keys, so provisioning
  // never touches an auth endpoint. (See sub2api fork
  // backend/internal/handler/admin/apikey_handler.go.)
  const apiKey = await adminFetch<ApiKeyResponse>(`/api/v1/admin/users/${created.id}/api-keys`, {
    method: 'POST',
    body: JSON.stringify({
      name: `cumora · ${args.displayName}`,
      // Bind the key to the user's allowed group at creation time so
      // upstream calls are gated immediately. If groupId is 0 the
      // sub2api side will refuse upstream calls anyway.
      group_id: groupId > 0 ? groupId : null,
    }),
  })

  return { sub2apiUserId: created.id, apiKey: apiKey.key, groupId }
}

/** sub2api subscription window — used + limit per period, in USD. `null`
 *  limit means "unlimited at this tier" (matching sub2api's group config
 *  shape where `*_limit_usd` is a nullable column). */
export interface QuotaWindow {
  usedUsd: number
  limitUsd: number | null
  windowStart: string | null
}

export interface QuotaSnapshot {
  groupId: number
  groupName: string | null
  status: string
  expiresAt: string | null
  daily: QuotaWindow
  weekly: QuotaWindow
  monthly: QuotaWindow
}

interface AdminSubscriptionRow {
  id: number
  user_id: number
  group_id: number
  status: string
  starts_at: string
  expires_at: string
  daily_window_start: string | null
  weekly_window_start: string | null
  monthly_window_start: string | null
  daily_usage_usd: number
  weekly_usage_usd: number
  monthly_usage_usd: number
  group?: {
    id: number
    name: string
    daily_limit_usd: number | null
    weekly_limit_usd: number | null
    monthly_limit_usd: number | null
  } | null
}

const TIER_SUBSCRIPTION_VALIDITY_DAYS = 3650
const TIER_SUBSCRIPTION_NOTES = 'cumora auto-provision'

function configuredTierGroupIds(): Set<number> {
  return new Set([
    env.SUB2API_TIER_FREE_GROUP_ID,
    env.SUB2API_TIER_PRO_GROUP_ID,
    env.SUB2API_TIER_MAX_GROUP_ID,
  ].filter((id) => id > 0))
}

function subscriptionIsActive(row: AdminSubscriptionRow, now = Date.now()): boolean {
  if (row.status !== 'active') return false
  const expiresAt = Date.parse(row.expires_at)
  return Number.isFinite(expiresAt) && expiresAt > now
}

/** Read a user's current quota usage + group-defined limits from sub2api.
 *  Returns `null` when sub2api is not configured or the user has no active
 *  subscriptions (e.g. provisioning didn't complete) — callers should
 *  treat that as "feature unavailable" and not as a hard error.
 *
 *  When the user has multiple active subscriptions we pick the one whose
 *  group has the highest monthly limit, since that's the tier actually
 *  gating most calls. In the common single-tier case the choice is
 *  trivially the only row. */
export async function getUserQuota(sub2apiUserId: number): Promise<QuotaSnapshot | null> {
  if (!sub2apiConfigured()) return null
  const rows = await adminFetch<AdminSubscriptionRow[]>(
    `/api/v1/admin/users/${sub2apiUserId}/subscriptions`,
  )
  const active = rows.filter((r) => r.status === 'active')
  if (active.length === 0) return null
  // Pick the "most generous" subscription as the visible quota. sub2api
  // technically allows multiple active groups but a cumora user almost
  // always has exactly one (their tier).
  active.sort((a, b) => (b.group?.monthly_limit_usd ?? 0) - (a.group?.monthly_limit_usd ?? 0))
  const r = active[0]
  const group = r.group ?? null
  return {
    groupId: r.group_id,
    groupName: group?.name ?? null,
    status: r.status,
    expiresAt: r.expires_at ?? null,
    daily: {
      usedUsd: Number(r.daily_usage_usd) || 0,
      limitUsd: group?.daily_limit_usd ?? null,
      windowStart: r.daily_window_start,
    },
    weekly: {
      usedUsd: Number(r.weekly_usage_usd) || 0,
      limitUsd: group?.weekly_limit_usd ?? null,
      windowStart: r.weekly_window_start,
    },
    monthly: {
      usedUsd: Number(r.monthly_usage_usd) || 0,
      limitUsd: group?.monthly_limit_usd ?? null,
      windowStart: r.monthly_window_start,
    },
  }
}

/** Tier change. Idempotent: re-calling with the same tier is fine.
 *
 * sub2api's `replace-group` endpoint is only for non-subscription
 * exclusive groups. Cumora's tiers are subscription groups, so tier
 * changes must keep three records in sync:
 *   1. target user subscription is active,
 *   2. the user's API keys point at the target group,
 *   3. stale Cumora tier subscriptions are revoked so quota reads don't
 *      keep seeing the old tier.
 */
export async function setUserTier(sub2apiUserId: number, tier: Tier): Promise<void> {
  const groupId = tierToGroupId(tier)
  if (groupId <= 0) {
    console.warn(`[sub2api] tier=${tier} has no group_id mapped; skip`)
    return
  }

  const tierGroups = configuredTierGroupIds()
  const subscriptions = await adminFetch<AdminSubscriptionRow[]>(
    `/api/v1/admin/users/${sub2apiUserId}/subscriptions`,
  )
  const now = Date.now()
  const staleTargetSubs = subscriptions.filter((s) => s.group_id === groupId && !subscriptionIsActive(s, now))
  for (const sub of staleTargetSubs) {
    await adminFetch(`/api/v1/admin/subscriptions/${sub.id}`, { method: 'DELETE' })
  }

  const hasActiveTarget = subscriptions.some((s) => s.group_id === groupId && subscriptionIsActive(s, now))
  if (!hasActiveTarget) {
    await adminFetch('/api/v1/admin/subscriptions/assign', {
      method: 'POST',
      body: JSON.stringify({
        user_id: sub2apiUserId,
        group_id: groupId,
        validity_days: TIER_SUBSCRIPTION_VALIDITY_DAYS,
        notes: TIER_SUBSCRIPTION_NOTES,
      }),
    })
  }

  const keys = await adminFetch<AdminAPIKeyList>(
    `/api/v1/admin/users/${sub2apiUserId}/api-keys?page=1&page_size=1000`,
  )
  for (const key of keys.items ?? []) {
    if (key.group_id === groupId) continue
    await adminFetch(`/api/v1/admin/api-keys/${key.id}`, {
      method: 'PUT',
      body: JSON.stringify({ group_id: groupId }),
    })
  }

  const staleTierSubs = subscriptions.filter((s) => (
    s.group_id !== groupId
    && tierGroups.has(s.group_id)
    && subscriptionIsActive(s, now)
  ))
  for (const sub of staleTierSubs) {
    await adminFetch(`/api/v1/admin/subscriptions/${sub.id}`, {
      method: 'DELETE',
    })
  }
}
