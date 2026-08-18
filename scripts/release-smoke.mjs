#!/usr/bin/env node

/** Authenticated production smoke.
 *
 * Required:
 *   CUMORA_SMOKE_TOKEN       bearer session/service token
 *   CUMORA_SMOKE_COMPANY_ID  tenant whose real API surface is exercised
 * Optional:
 *   CUMORA_SMOKE_BASE        defaults to https://api.cumora.ai
 *   CUMORA_SMOKE_REQUIRE_SHIPPING defaults to Y; set to N only for the
 *                                 pre-deploy compatibility baseline
 *
 * This intentionally checks more than "the load balancer returns 401": it
 * proves authentication, tenant selection, the core conversation read path,
 * and the shipping/readback path all survive the deployed schema + runtime. */

const base = (process.env.CUMORA_SMOKE_BASE || 'https://api.cumora.ai').replace(/\/+$/, '')
const token = process.env.CUMORA_SMOKE_TOKEN
const companyId = process.env.CUMORA_SMOKE_COMPANY_ID
const requireShipping = (process.env.CUMORA_SMOKE_REQUIRE_SHIPPING || 'Y').toUpperCase() !== 'N'

if (!token || !companyId) {
  console.error('CUMORA_SMOKE_TOKEN and CUMORA_SMOKE_COMPANY_ID are required')
  process.exit(2)
}

async function request(path, { authenticated = true } = {}) {
  const headers = { accept: 'application/json' }
  if (authenticated) {
    headers.authorization = `Bearer ${token}`
    headers['x-company-id'] = companyId
  }
  const started = Date.now()
  const response = await fetch(`${base}${path}`, { headers, signal: AbortSignal.timeout(15_000) })
  const raw = await response.text()
  let body = null
  try { body = raw ? JSON.parse(raw) : null } catch { body = raw }
  if (!response.ok) throw new Error(`${path} → ${response.status}: ${String(raw).slice(0, 300)}`)
  console.log(`✓ ${path} → ${response.status} (${Date.now() - started}ms)`)
  return body
}

try {
  const health = await request('/api/health', { authenticated: false })
  if (!health?.ok) throw new Error('/api/health did not report ok')

  const auth = await request('/api/auth/me')
  if (!Array.isArray(auth?.companies) || !auth.companies.some((company) => company.id === companyId)) {
    throw new Error(`smoke identity is not a member of company ${companyId}`)
  }

  const conversations = await request('/api/conversations')
  if (!Array.isArray(conversations)) throw new Error('/api/conversations did not return an array')

  let shipping = null
  if (requireShipping) {
    shipping = await request('/api/shipping/overview')
    if (!Array.isArray(shipping?.features) || !Array.isArray(shipping?.friction) || !Array.isArray(shipping?.dueReadbacks)) {
      throw new Error('/api/shipping/overview returned an invalid contract')
    }
  }

  const shippingSummary = shipping
    ? ` shipping_features=${shipping.features.length} due_readbacks=${shipping.dueReadbacks.length}`
    : ' shipping=baseline-skipped'
  console.log(`Smoke passed: company=${companyId} conversations=${conversations.length}${shippingSummary}`)
} catch (error) {
  console.error(`Smoke failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
