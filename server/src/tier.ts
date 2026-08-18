/**
 * Plan tier resolution, shared across modules that can't import the API
 * router (avoids a require cycle: router → registry → router).
 *
 * A company's tier is the tier of its owner (`users.tier`). Mirrors the query
 * `companyPlanTier` uses in api/router.ts — keep them in sync.
 */
import { pool } from './db/pool.js'

export type Tier = 'free' | 'pro' | 'max'

export function normalizeTier(tier: string | null | undefined): Tier {
  return tier === 'pro' || tier === 'max' ? tier : 'free'
}

type Queryable = {
  query<T extends object = Record<string, unknown>>(text: string, params?: readonly unknown[]): Promise<{ rows: T[] }>
}

/** Resolve a company's plan tier from its owner's `users.tier`. */
export async function companyTier(companyId: string, db: Queryable = pool): Promise<Tier> {
  const { rows } = await db.query<{ tier: string | null }>(
    `SELECT COALESCE(owner_user.tier, owner_member.tier, 'free') AS tier
       FROM companies c
       LEFT JOIN users owner_user ON owner_user.id = c.owner_user_id
       LEFT JOIN LATERAL (
         SELECT u.tier
           FROM company_members cm
           JOIN users u ON u.id = cm.user_id
          WHERE cm.company_id = c.id AND cm.role = 'owner'
          ORDER BY cm.joined_at ASC
          LIMIT 1
       ) owner_member ON TRUE
      WHERE c.id = $1`,
    [companyId],
  )
  return normalizeTier(rows[0]?.tier)
}
