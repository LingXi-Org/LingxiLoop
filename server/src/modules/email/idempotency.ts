import { createHash } from 'node:crypto'

/** Stable opaque key shared by persistence, provider delivery, and replay lookup. */
export function tenantEmailIdempotencyKey(companyId: string, key: string): string {
  return `email/${createHash('sha256').update(companyId).update('\0').update(key).digest('hex')}`
}
