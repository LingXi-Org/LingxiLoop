import type { Request } from 'express'
import type { AuthedRequest } from '../../auth.js'
import type { Queryable } from '../../db/queryable.js'
import { env } from '../../env.js'
import { HttpError } from '../../http/errors.js'

export interface PlatformAdminIdentity {
  id: string
  email: string
  name: string
}

export function isPlatformAdminEmail(
  email: string,
  emailVerifiedAt: unknown,
  allowlist: readonly string[] = env.PLATFORM_ADMIN_EMAILS,
): boolean {
  return Boolean(emailVerifiedAt) && allowlist.includes(email.trim().toLowerCase())
}

export async function platformAdminIdentity(
  db: Queryable,
  userId: string,
): Promise<PlatformAdminIdentity | null> {
  const { rows } = await db.query<{
    id: string
    email: string
    display_name: string
    email_verified_at: Date | string | null
  }>(
    `SELECT id,email,display_name,email_verified_at
       FROM users
      WHERE id=$1 AND deleted_at IS NULL AND suspended_at IS NULL`,
    [userId],
  )
  const user = rows[0]
  return user && isPlatformAdminEmail(user.email, user.email_verified_at)
    ? { id: user.id, email: user.email, name: user.display_name }
    : null
}

export async function requirePlatformAdmin(
  db: Queryable,
  request: Request & AuthedRequest,
): Promise<PlatformAdminIdentity> {
  if (!request.authUserId) throw new HttpError(401, 'authentication required')
  const identity = await platformAdminIdentity(db, request.authUserId)
  if (!identity) throw new HttpError(403, 'platform administrator access required')
  return identity
}
