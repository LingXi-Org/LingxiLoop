import type { Queryable } from '../db/queryable.js'

export async function channelProfileForMember(
  db: Queryable,
  input: { companyId: string; channelId: string; userId: string },
): Promise<Record<string, unknown> | null> {
  const { rows } = await db.query<{ profile: Record<string, unknown> }>(
    `SELECT binding.profile
       FROM im_channel_bindings binding
       JOIN conversations conversation
         ON conversation.id=binding.channel_id AND conversation.company_id=binding.company_id
      WHERE binding.channel_id=$1 AND binding.company_id=$2
        AND conversation.members @> to_jsonb(ARRAY[$3::text])`,
    [input.channelId, input.companyId, input.userId],
  )
  return rows[0]?.profile ?? null
}
