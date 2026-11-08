import { createHmac, timingSafeEqual } from 'node:crypto'
import { env } from '../../env.js'
import type { ArtifactKind } from './kinds.js'

// Short-lived signed capabilities let opaque content load its own resources.
// The content router accepts reads only and re-checks current tenant access.
export const GRANT_TTL_MS = 12 * 60 * 60_000

export interface EditorGrant {
  artifactId: string
  companyId: string
  userId: string
  kind: ArtifactKind
  write: boolean
  expiresAt: number
}

function key() {
  return createHmac('sha256', env.GATEWAY_HMAC_SECRET).update('lingxiloop:artifact-editor-grant:v1').digest()
}
const sign = (payload: string) => createHmac('sha256', key()).update(payload).digest('base64url')

export function issueGrant(grant: Omit<EditorGrant, 'expiresAt'>, now = Date.now()): { grant: string; expiresAt: number } {
  const expiresAt = now + GRANT_TTL_MS
  const payload = Buffer.from(JSON.stringify([grant.artifactId, grant.companyId, grant.userId, grant.kind, grant.write ? 1 : 0, expiresAt])).toString('base64url')
  return { grant: `${payload}.${sign(payload)}`, expiresAt }
}

export function readGrant(token: string, now = Date.now()): EditorGrant | null {
  const [payload, signature, extra] = token.split('.')
  if (!payload || !signature || extra !== undefined) return null
  const expected = Buffer.from(sign(payload)), actual = Buffer.from(signature)
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null
  try {
    const [artifactId, companyId, userId, kind, write, expiresAt] = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as unknown[]
    if (typeof artifactId !== 'string' || typeof companyId !== 'string' || typeof userId !== 'string'
      || (kind !== 'design' && kind !== 'slides') || (write !== 0 && write !== 1) || typeof expiresAt !== 'number' || expiresAt <= now) return null
    return { artifactId, companyId, userId, kind, write: write === 1, expiresAt }
  } catch { return null }
}
