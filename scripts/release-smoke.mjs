#!/usr/bin/env node

/** Authenticated production smoke.
 *
 * Required:
 *   LINGXILOOP_SMOKE_COOKIE      Better Auth cookie header value
 *   LINGXILOOP_SMOKE_COMPANY_ID  tenant whose real API surface is exercised
 *   LINGXILOOP_SMOKE_BASE        deployed public origin
 * Optional:
 *   LINGXILOOP_SMOKE_EXPECTED_SHA     require /api/meta to match this commit
 *   LINGXILOOP_SMOKE_EXPECTED_VERSION require /api/meta to match this version
 *
 * This intentionally checks more than "the load balancer returns 401": it
 * proves authentication, tenant selection and the core conversation read path
 * all survive the deployed schema + runtime. */

const base = (process.env.LINGXILOOP_SMOKE_BASE || '').replace(/\/+$/, '')
const cookie = process.env.LINGXILOOP_SMOKE_COOKIE
const companyId = process.env.LINGXILOOP_SMOKE_COMPANY_ID
const expectedSha = process.env.LINGXILOOP_SMOKE_EXPECTED_SHA
const expectedVersion = process.env.LINGXILOOP_SMOKE_EXPECTED_VERSION

if (!base || !cookie || !companyId) {
  console.error('LINGXILOOP_SMOKE_BASE, LINGXILOOP_SMOKE_COOKIE and LINGXILOOP_SMOKE_COMPANY_ID are required')
  process.exit(2)
}

const parsedBase = new URL(base)
if (parsedBase.protocol !== 'https:' || parsedBase.pathname !== '/' || parsedBase.search || parsedBase.hash) {
  console.error('LINGXILOOP_SMOKE_BASE must be an HTTPS origin without path, query, or fragment')
  process.exit(2)
}

async function request(path, { authenticated = true, method = 'GET' } = {}) {
  const headers = { accept: 'application/json' }
  if (authenticated) {
    headers.cookie = cookie
    headers['x-company-id'] = companyId
  }
  const started = Date.now()
  const response = await fetch(`${base}${path}`, { method, headers, signal: AbortSignal.timeout(15_000) })
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

  const dependencyHealth = await request('/api/health/dependencies', { authenticated: false })
  if (!dependencyHealth?.ok || !Object.values(dependencyHealth.dependencies ?? {}).every(Boolean)) {
    throw new Error('/api/health/dependencies did not report database, Redis and Agent OS healthy')
  }

  const meta = await request('/api/meta', { authenticated: false })
  if (meta?.product !== 'LingxiLoop' || meta?.reasoningRuntime !== 'agent-os') {
    throw new Error('/api/meta did not report the LingxiLoop + Agent OS production contract')
  }
  if (expectedSha && meta.commitSha !== expectedSha) {
    throw new Error(`/api/meta commit mismatch: expected ${expectedSha}, got ${meta.commitSha}`)
  }
  if (expectedVersion && meta.version !== expectedVersion) {
    throw new Error(`/api/meta version mismatch: expected ${expectedVersion}, got ${meta.version}`)
  }

  const auth = await request('/api/auth/me')
  if (!Array.isArray(auth?.companies) || !auth.companies.some((company) => company.id === companyId)) {
    throw new Error(`smoke identity is not a member of company ${companyId}`)
  }

  const conversations = await request('/api/im/channels')
  if (!Array.isArray(conversations)) throw new Error('/api/conversations did not return an array')

  const wsTicket = await request('/api/auth/ws-ticket', { method: 'POST' })
  if (!wsTicket?.ticket) throw new Error('/api/auth/ws-ticket did not return a ticket')
  await new Promise((resolve, reject) => {
    const wsBase = new URL(base)
    wsBase.protocol = 'wss:'
    wsBase.pathname = '/ws'
    wsBase.searchParams.set('t', wsTicket.ticket)
    const socket = new WebSocket(wsBase)
    const timer = setTimeout(() => {
      socket.close()
      reject(new Error('authenticated WebSocket hello timed out'))
    }, 10_000)
    socket.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(String(event.data))
        if (message?.type !== 'hello') return
        clearTimeout(timer)
        socket.close()
        console.log('✓ /ws → authenticated hello')
        resolve()
      } catch (error) {
        clearTimeout(timer)
        socket.close()
        reject(error)
      }
    })
    socket.addEventListener('error', () => {
      clearTimeout(timer)
      reject(new Error('authenticated WebSocket connection failed'))
    })
  })

  console.log(`Smoke passed: company=${companyId} conversations=${conversations.length}`)
} catch (error) {
  console.error(`Smoke failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
