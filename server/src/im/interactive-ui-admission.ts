import type { Queryable } from '../db/queryable.js'
import { pool } from '../db/pool.js'
import { HttpError } from '../http/errors.js'
import { createPermissionService } from '../modules/access/public.js'
import { assertTeacherRoomAccessible } from '../modules/learning/public.js'
import { uiInteractionSchema } from '../../../src/lib/interactive-ui/protocol.js'
import type { NativeMessage } from './message-types.js'
import { messageAcceptanceDigest } from './messages-digest.js'

export interface UiActor { companyId: string; channelId: string; userId: string }

export async function assertUiActor(db: Queryable, input: UiActor, action: 'conversation:read' | 'conversation:write'): Promise<void> {
  await createPermissionService(db).assertCan({ actorUserId: input.userId, companyId: input.companyId,
    action, resource: { type: 'conversation', id: input.channelId } })
  await assertTeacherRoomAccessible(input.channelId, input.companyId, input.userId, db)
  const member = await db.query(`SELECT 1 FROM conversations room
    JOIN participants person ON person.company_id=room.company_id AND person.id=$3
      AND person.kind='human' AND person.departed_at IS NULL
    WHERE room.company_id=$1 AND room.id=$2 AND room.members @> to_jsonb(ARRAY[$3::text])`,
  [input.companyId, input.channelId, input.userId])
  if (!member.rows.length) throw new HttpError(403, '交互讲解仅供当前会话成员使用。')
}

/** A generic send or webhook may replay an admitted action, but cannot mint its authority. */
export async function assertUiInteractionAdmission(input: UiActor & { clientNonce: string; payload: NativeMessage }, db: Queryable = pool): Promise<void> {
  if (input.payload.metadata.custom.uiInteraction === undefined) return
  if (input.payload.role !== 'user' || !uiInteractionSchema.safeParse(input.payload.metadata.custom.uiInteraction).success
    || input.payload.id !== input.clientNonce) throw new HttpError(403, '交互提交无效。')
  await assertUiActor(db, input, 'conversation:write')
  const receipt = (await db.query<{ input_digest: string; channel_type: number; payload: NativeMessage }>(
    `SELECT input_digest,channel_type,payload FROM im_send_acceptances
      WHERE company_id=$1 AND user_id=$2 AND channel_id=$3 AND client_nonce=$4`,
    [input.companyId, input.userId, input.channelId, input.clientNonce])).rows[0]
  if (!receipt || receipt.payload.metadata.custom.uiInteraction === undefined
    || receipt.input_digest !== messageAcceptanceDigest({ channelId: input.channelId, channelType: receipt.channel_type, payload: input.payload })) {
    throw new HttpError(403, '请从已确认的交互讲解提交操作。')
  }
}
