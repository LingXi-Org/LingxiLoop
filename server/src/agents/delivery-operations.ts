import { z } from 'zod'
import type { Queryable } from '../db/queryable.js'
import { HttpError } from '../http/errors.js'

const identitySchema = z.union([
  z.tuple([z.literal('event'),z.string().min(1).max(2000)]),
  z.tuple([z.literal('ingress'),z.string().min(1).max(2000),z.string().min(1).max(2000)]),
])

/** Administrator read projection; native event bodies and committed message contents stay private. */
export async function listNativeDeliveryFailures(db: Queryable, query: { id?: string; companyId?: string; offset?: number; limit?: number; search?: string; sort?: string } = {}) {
  const limit = query.limit ?? 50, offset = query.offset ?? 0
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset) || offset < 0 || offset > 10000) throw new HttpError(400,'invalid delivery pagination')
  if ((query.search?.length ?? 0) > 200 || query.sort && !['newest', 'oldest'].includes(query.sort)) throw new HttpError(400, 'invalid delivery filters')
  const direction = query.sort === 'newest' ? 'DESC' : 'ASC'
  const { rows } = await db.query(`SELECT * FROM (
    SELECT jsonb_build_array('event',id)::text AS id,'event' AS channel,company_id,work_id AS run_id,
      attempts,last_error AS error,failed_at,created_at FROM agent_native_event_outbox WHERE failed_at IS NOT NULL AND delivered_at IS NULL
    UNION ALL SELECT jsonb_build_array('ingress',event_id,agent_id)::text,'ingress',company_id,NULL,
      attempts,error,failed_at,created_at FROM lingxios_ingress_outbox WHERE failed_at IS NOT NULL AND delivered_at IS NULL
    ) failures WHERE ($1::text IS NULL OR company_id=$1) AND ($2::text IS NULL OR id=$2)
    AND ($5::text IS NULL OR id ILIKE $5 OR error ILIKE $5 OR run_id ILIKE $5)
    ORDER BY failed_at ${direction},id ${direction} LIMIT $3 OFFSET $4`,[query.companyId ?? null,query.id ?? null,limit+1,offset,query.search ? `%${query.search}%` : null])
  return { data: rows.slice(0,limit), nextCursor: rows.length > limit ? Buffer.from(String(offset+limit)).toString('base64url') : null }
}

export async function retryNativeDelivery(db: Queryable, id: string) {
  let decoded: unknown
  try { decoded = JSON.parse(id) } catch { throw new HttpError(400,'invalid delivery identity') }
  const parsed = identitySchema.safeParse(decoded)
  if (!parsed.success) throw new HttpError(400,'invalid delivery identity')
  const [channel,key,agentId] = parsed.data
  const { rows } = channel === 'event'
    ? await db.query(`UPDATE agent_native_event_outbox SET failed_at=NULL,last_error=NULL,claim_token=NULL,attempts=0,available_at=NOW()
      WHERE id=$1 AND failed_at IS NOT NULL AND delivered_at IS NULL RETURNING company_id`,[key])
    : await db.query(`UPDATE lingxios_ingress_outbox SET failed_at=NULL,error=NULL,claim_token=NULL,claimed_until=NULL,attempts=0,available_at=NOW()
      WHERE event_id=$1 AND agent_id=$2 AND failed_at IS NOT NULL AND delivered_at IS NULL RETURNING company_id`,[key,agentId])
  return rows.length === 1
}
