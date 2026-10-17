import type { Router } from 'express'
import type { PlatformApplication } from './application.js'

/** LingxiOS 3.4.7 public /readyz: HTTP 200 and { ok: true }. Never follow redirects. */
export async function probeControlReady(baseUrl: string): Promise<void> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 2_500)
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/readyz`, {
      signal: controller.signal, redirect: 'error',
    })
    if (!response.ok) {
      await response.body?.cancel()
      throw new Error('control unavailable')
    }
    const body: unknown = await response.json()
    if (!body || typeof body !== 'object' || !('ok' in body) || body.ok !== true) {
      throw new Error('control unavailable')
    }
  } finally { clearTimeout(timer) }
}

export function registerHealthRoutes(router: Pick<Router, 'get'>, application: PlatformApplication): void {
  router.get('/livez', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    res.json({ ok: true, ts: Date.now() })
  })
  // Preserve legacy PG/Redis health semantics for existing clients.
  router.get('/health', async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    try {
      await application.assertReady()
      res.json({ ok: true, ts: Date.now() })
    } catch {
      res.status(503).json({ ok: false, error: 'dependencies unavailable', ts: Date.now() })
    }
  })
  router.get('/readyz', async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    const dependencies = await application.readiness()
    const ok = Object.values(dependencies).every(Boolean)
    res.status(ok ? 200 : 503).json({ ok, dependencies, ts: Date.now() })
  })
  router.get('/health/dependencies', async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    const dependencies = await application.dependencyReadiness()
    const ok = Object.values(dependencies).every(Boolean)
    res.status(ok ? 200 : 503).json({ ok, dependencies, ts: Date.now() })
  })
}
