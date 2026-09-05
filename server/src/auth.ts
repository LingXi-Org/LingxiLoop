import { createHmac, timingSafeEqual } from 'node:crypto'
import { env } from './env.js'
import { redis } from './redis.js'

export interface GatewayAssertion {
  appUserId: string | null
  authUserId: string | null
  method: string
  path: string
  timestamp: number
  nonce: string
}

export interface AuthedRequest {
  authUserId?: string
  gatewayAuthenticated?: boolean
  gatewayAuthUserId?: string
}

function decode(value: string): GatewayAssertion | null {
  if (value.length > 2048) return null
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Partial<GatewayAssertion>
    if ((parsed.appUserId !== null && typeof parsed.appUserId !== 'string')
      || (parsed.authUserId !== null && typeof parsed.authUserId !== 'string')
      || typeof parsed.method !== 'string'
      || typeof parsed.path !== 'string'
      || typeof parsed.timestamp !== 'number'
      || !Number.isFinite(parsed.timestamp)
      || typeof parsed.nonce !== 'string'
      || !/^[0-9a-f-]{36}$/i.test(parsed.nonce)) return null
    return parsed as GatewayAssertion
  } catch {
    return null
  }
}

export function verifyGatewayAssertion(value: string, method: string, path: string, now = Date.now()): GatewayAssertion | null {
  if (value.length > 4096) return null
  const [payload, signature, extra] = value.split('.')
  if (!payload || !signature || extra) return null
  const expected = createHmac('sha256', env.GATEWAY_HMAC_SECRET).update(payload).digest()
  let actual: Buffer
  try { actual = Buffer.from(signature, 'base64url') } catch { return null }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null
  const assertion = decode(payload)
  if (!assertion || assertion.method !== method || assertion.path !== path || Math.abs(now - assertion.timestamp) > 30_000 || !assertion.nonce) return null
  return assertion
}

export async function authMiddleware(
  request: { headers: Record<string, string | string[] | undefined>; method: string; originalUrl: string } & AuthedRequest,
  _response: unknown,
  next: () => void,
): Promise<void> {
  const header = request.headers['x-lingxiloop-gateway']
  const assertion = typeof header === 'string' ? verifyGatewayAssertion(header, request.method, request.originalUrl) : null
  if (assertion) {
    const fresh = await redis.set(`gateway:nonce:${assertion.nonce}`, '1', 'PX', 60_000, 'NX')
    if (fresh) {
      request.gatewayAuthenticated = true
      request.gatewayAuthUserId = assertion.authUserId ?? undefined
      request.authUserId = assertion.appUserId ?? undefined
    }
  }
  next()
}
