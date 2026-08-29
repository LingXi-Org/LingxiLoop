import type { Queryable } from '../../db/queryable.js'
import { ENTITLEMENT_CODES } from '../../domain/access/public.js'
import { PERSONAL_FREE_PLAN } from '../../domain/entitlement/public.js'

const PERSONAL_FREE_ENTITLEMENTS = ENTITLEMENT_CODES.map((code) => ({
  id: `entitlement-${code.replaceAll('.', '-')}`,
  code,
  description: `Enables ${code} in the current access context`,
}))

/** Ensure the non-billing base Plan and its boolean capabilities exist in the owning transaction. */
export async function ensurePersonalFreePlan(db: Queryable): Promise<string> {
  await db.query(
    `INSERT INTO plans (id,code,name,status) VALUES ($1,$2,$3,$4)
     ON CONFLICT (id) DO UPDATE SET
       code=EXCLUDED.code,name=EXCLUDED.name,status=EXCLUDED.status`,
    [PERSONAL_FREE_PLAN.id, PERSONAL_FREE_PLAN.code, PERSONAL_FREE_PLAN.name, PERSONAL_FREE_PLAN.status],
  )
  for (const entitlement of PERSONAL_FREE_ENTITLEMENTS) {
    await db.query(
      `INSERT INTO entitlements (id,code,description) VALUES ($1,$2,$3)
       ON CONFLICT (id) DO UPDATE SET code=EXCLUDED.code,description=EXCLUDED.description`,
      [entitlement.id, entitlement.code, entitlement.description],
    )
    await db.query(
      `INSERT INTO plan_entitlements (plan_id,entitlement_id,value) VALUES ($1,$2,'true'::jsonb)
       ON CONFLICT (plan_id,entitlement_id) DO UPDATE SET value=EXCLUDED.value`,
      [PERSONAL_FREE_PLAN.id, entitlement.id],
    )
  }
  return PERSONAL_FREE_PLAN.id
}

