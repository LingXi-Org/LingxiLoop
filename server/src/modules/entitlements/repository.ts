import type { Queryable } from '../../db/queryable.js'
import { FOUNDATION_PLAN } from '../../domain/entitlement/public.js'

/** Ensure the non-billing base Plan exists inside the owning Company transaction. */
export async function ensureFoundationPlan(db: Queryable): Promise<string> {
  await db.query(
    `INSERT INTO plans (id,code,name,status) VALUES ($1,$2,$3,$4)
     ON CONFLICT (id) DO UPDATE SET
       code=EXCLUDED.code,name=EXCLUDED.name,status=EXCLUDED.status`,
    [FOUNDATION_PLAN.id, FOUNDATION_PLAN.code, FOUNDATION_PLAN.name, FOUNDATION_PLAN.status],
  )
  return FOUNDATION_PLAN.id
}

