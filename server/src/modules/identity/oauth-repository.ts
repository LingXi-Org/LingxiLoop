import type { Queryable } from '../../db/queryable.js'
import type { IdentityProvider, NormalizedIdentityProfile } from './contracts.js'

export async function findLinkedIdentityUser(
  db: Queryable,
  provider: IdentityProvider,
  providerId: string,
): Promise<string | null> {
  const { rows } = await db.query<{ user_id: string }>(
    `SELECT user_id FROM user_identities WHERE provider = $1 AND provider_id = $2`,
    [provider, providerId],
  )
  return rows[0]?.user_id ?? null
}

export async function findActiveUserByEmail(db: Queryable, email: string): Promise<string | null> {
  const { rows } = await db.query<{ id: string }>(
    `SELECT id FROM users WHERE LOWER(email) = $1 AND deleted_at IS NULL LIMIT 1`,
    [email],
  )
  return rows[0]?.id ?? null
}

export async function linkIdentity(
  db: Queryable,
  input: { provider: IdentityProvider; providerId: string; userId: string; email: string },
): Promise<string> {
  const inserted = await db.query<{ user_id: string }>(
    `INSERT INTO user_identities (provider, provider_id, user_id, email_lower)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (provider, provider_id) DO NOTHING
     RETURNING user_id`,
    [input.provider, input.providerId, input.userId, input.email],
  )
  if (inserted.rows[0]?.user_id) return inserted.rows[0].user_id
  const authoritative = await findLinkedIdentityUser(db, input.provider, input.providerId)
  if (!authoritative) throw new Error('identity link conflict did not resolve to an authoritative user')
  return authoritative
}

export async function insertIdentityUser(
  db: Queryable,
  input: {
    userId: string
    provider: IdentityProvider
    profile: NormalizedIdentityProfile
  },
): Promise<void> {
  await db.query(
    `INSERT INTO users (id, email, display_name, password_hash, email_verified_at)
     VALUES ($1, $2, $3, NULL, NOW())`,
    [input.userId, input.profile.email, input.profile.displayName],
  )
  await db.query(
    `INSERT INTO user_identities (provider, provider_id, user_id, email_lower)
     VALUES ($1, $2, $3, $4)`,
    [input.provider, input.profile.providerId, input.userId, input.profile.email],
  )
}

export async function finalizeIdentityLogin(
  db: Queryable,
  userId: string,
): Promise<{ companyId: string | null; suspendedAt: Date | string | null; suspensionReason: string | null }> {
  const user = await db.query<{ suspended_at: Date | string | null; suspension_reason: string | null }>(
    `SELECT suspended_at, suspension_reason
       FROM users
      WHERE id = $1 AND deleted_at IS NULL`,
    [userId],
  )
  const row = user.rows[0]
  if (!row) throw new Error('identity points to missing or deleted user')
  const company = await db.query<{ company_id: string }>(
    `SELECT company_id FROM company_memberships
      WHERE user_id = $1 AND status='ACTIVE' ORDER BY created_at ASC LIMIT 1`,
    [userId],
  )
  return {
    companyId: company.rows[0]?.company_id ?? null,
    suspendedAt: row.suspended_at,
    suspensionReason: row.suspension_reason,
  }
}

export async function updateIdentityAvatar(
  db: Queryable,
  userId: string,
  avatarUrl: string | null,
): Promise<void> {
  await db.query(`UPDATE users SET avatar_url = $2 WHERE id = $1 AND deleted_at IS NULL`, [userId, avatarUrl])
  await db.query(
    `UPDATE participants participant
        SET avatar_url = $2
       FROM company_memberships member
      WHERE participant.id = $1
        AND participant.kind = 'human'
        AND participant.company_id = member.company_id
        AND member.user_id = $1 AND member.status='ACTIVE'`,
    [userId, avatarUrl],
  )
}
