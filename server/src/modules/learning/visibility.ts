import type { Queryable } from '../../db/queryable.js'
import { pool } from '../../db/pool.js'
import { HttpError } from '../../http/errors.js'
import { createPermissionService } from '../access/public.js'

export async function isManagedPulse(
  agentId: string,
  companyId: string,
  db: Queryable = pool,
): Promise<boolean> {
  const { rows } = await db.query(
    `SELECT 1 FROM learning_project_teacher_agents
      WHERE agent_id=$1 AND company_id=$2 LIMIT 1`,
    [agentId, companyId],
  )
  return Boolean(rows[0])
}

export async function canDiscoverPulse(
  agentId: string,
  companyId: string,
  userId: string,
  db: Queryable = pool,
): Promise<boolean> {
  const { rows } = await db.query<{ project_id: string }>(
    `SELECT project_id FROM learning_project_teacher_agents
      WHERE agent_id=$1 AND company_id=$2 LIMIT 1`,
    [agentId, companyId],
  )
  if (!rows[0]) return true
  return (await createPermissionService(db).can({
    actorUserId: userId,
    action: 'learning:manage',
    companyId,
    projectId: rows[0].project_id,
  })).allowed
}

export async function assertPulseVisible(
  agentId: string,
  companyId: string,
  userId: string,
  db: Queryable = pool,
): Promise<void> {
  if (await isManagedPulse(agentId, companyId, db) && !await canDiscoverPulse(agentId, companyId, userId, db)) {
    throw new HttpError(404, 'not found')
  }
}

/** Managed Pulse identities are lifecycle-owned by the learning control plane. */
export async function assertNotManagedPulse(
  agentId: string,
  companyId: string,
  db: Queryable = pool,
): Promise<void> {
  if (await isManagedPulse(agentId, companyId, db)) {
    throw new HttpError(403, 'Pulse is managed by the learning control plane')
  }
}

export async function isTeacherRoom(
  conversationId: string,
  companyId: string,
  db: Queryable = pool,
): Promise<boolean> {
  const { rows } = await db.query(
    `SELECT 1 FROM learning_course_teacher_rooms
      WHERE conversation_id=$1 AND company_id=$2 LIMIT 1`,
    [conversationId, companyId],
  )
  return Boolean(rows[0])
}

/**
 * Teacher rooms are opaque outside their owning current-teacher boundary.
 * A closed room is inaccessible even while its durable membership snapshot is
 * retained for later reactivation.
 */
export async function assertTeacherRoomAccessible(
  conversationId: string,
  companyId: string,
  userId: string,
  db: Queryable = pool,
): Promise<void> {
  const { rows } = await db.query<{
    room_status: 'active' | 'closed'
    project_id: string
  }>(
    `SELECT room.status AS room_status,project.id AS project_id
       FROM learning_course_teacher_rooms room
       JOIN courses course ON course.id=room.course_id AND course.company_id=room.company_id
       JOIN projects project ON project.id=course.project_id AND project.company_id=course.company_id
      WHERE room.conversation_id=$1 AND room.company_id=$2
      LIMIT 1`,
    [conversationId, companyId],
  )
  const room = rows[0]
  if (!room) return
  const allowed = room.room_status === 'active' && (await createPermissionService(db).can({
    actorUserId: userId,
    action: 'learning:manage',
    companyId,
    projectId: room.project_id,
  })).allowed
  if (!allowed) {
    throw new HttpError(404, 'not found')
  }
}
