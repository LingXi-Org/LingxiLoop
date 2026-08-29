import type { Queryable } from '../../db/queryable.js'
import { PERSONAL_FREE_PLAN } from '../../domain/entitlement/public.js'

/** Ensure the non-billing base Plan exists inside the owning Company transaction. */
export async function ensurePersonalFreePlan(db: Queryable): Promise<string> {
  await db.query(
    `INSERT INTO plans (id,code,name,status) VALUES ($1,$2,$3,$4)
     ON CONFLICT (id) DO UPDATE SET
       code=EXCLUDED.code,name=EXCLUDED.name,status=EXCLUDED.status`,
    [PERSONAL_FREE_PLAN.id, PERSONAL_FREE_PLAN.code, PERSONAL_FREE_PLAN.name, PERSONAL_FREE_PLAN.status],
  )
  return PERSONAL_FREE_PLAN.id
}

