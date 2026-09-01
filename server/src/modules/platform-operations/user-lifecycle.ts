import type { Queryable } from '../../db/queryable.js'
import { HttpError } from '../../http/errors.js'
import { auditInTransaction } from '../identity/public.js'

export async function changeUserLifecycle(
  db: Queryable,
  input: {
    action: 'suspend' | 'restore' | 'delete'
    targetId: string
    adminId: string
    reason: string
    ip: string | null
    userAgent: string | null
  },
): Promise<{ id: string; suspended: boolean; deleted: boolean }> {
  const target = await db.query(`SELECT id FROM users WHERE id=$1 AND deleted_at IS NULL FOR UPDATE`, [input.targetId])
  if (!target.rows[0]) throw new HttpError(404, 'user not found')
  if (input.action === 'suspend') {
    await db.query(
      `UPDATE users SET suspended_at=COALESCE(suspended_at,NOW()),suspension_reason=$2,suspended_by=$3 WHERE id=$1`,
      [input.targetId, input.reason, input.adminId],
    )
    await db.query(`DELETE FROM ws_tickets WHERE user_id=$1`, [input.targetId])
  } else if (input.action === 'restore') {
    await db.query(
      `UPDATE users SET suspended_at=NULL,suspension_reason=NULL,suspended_by=NULL WHERE id=$1`,
      [input.targetId],
    )
  } else {
    await db.query(
      `UPDATE users SET deleted_at=NOW(),suspended_at=COALESCE(suspended_at,NOW()),suspension_reason=$2,suspended_by=$3 WHERE id=$1`,
      [input.targetId, input.reason, input.adminId],
    )
    await db.query(`DELETE FROM ws_tickets WHERE user_id=$1`, [input.targetId])
  }
  await auditInTransaction(db, {
    kind: `platform_admin.user_${input.action}`,
    userId: input.adminId,
    ip: input.ip,
    userAgent: input.userAgent,
    detail: { targetUserId: input.targetId, reason: input.reason, status: 200 },
  })
  return { id: input.targetId, suspended: input.action !== 'restore', deleted: input.action === 'delete' }
}
