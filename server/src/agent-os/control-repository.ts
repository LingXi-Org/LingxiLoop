import type { Queryable } from '../db/queryable.js'

export async function listVisibleRoutines(
  db: Queryable,
  input: { companyId: string; userId: string },
): Promise<Record<string, unknown>[]> {
  const { rows } = await db.query<Record<string, unknown>>(
    `SELECT routine.*
       FROM agent_routines routine
       JOIN conversations conversation
         ON conversation.id=routine.channel_id AND conversation.company_id=routine.company_id
      WHERE routine.company_id=$1 AND conversation.members @> to_jsonb(ARRAY[$2::text])
        AND (
          NOT EXISTS (
            SELECT 1 FROM learning_course_teacher_rooms room
             WHERE room.conversation_id=routine.channel_id AND room.company_id=routine.company_id
          ) OR EXISTS (
            SELECT 1 FROM learning_course_teacher_rooms room
            JOIN courses course ON course.id=room.course_id AND course.company_id=room.company_id
            JOIN projects project ON project.id=course.project_id AND project.company_id=course.company_id
            JOIN course_members teacher
              ON teacher.course_id=course.id AND teacher.company_id=course.company_id
              AND teacher.user_id=$2 AND teacher.role='teacher'
            WHERE room.conversation_id=routine.channel_id AND room.company_id=routine.company_id
              AND room.status='active' AND project.status='active'
          )
        )
      ORDER BY routine.created_at DESC`,
    [input.companyId, input.userId],
  )
  return rows
}

export async function visibleRoutineChannel(
  db: Queryable,
  input: { routineId: string; companyId: string; userId: string },
): Promise<string | null> {
  const { rows } = await db.query<{ channel_id: string }>(
    `SELECT routine.channel_id
       FROM agent_routines routine
       JOIN conversations conversation
         ON conversation.id=routine.channel_id AND conversation.company_id=routine.company_id
      WHERE routine.id=$1 AND routine.company_id=$2
        AND conversation.members @> to_jsonb(ARRAY[$3::text])`,
    [input.routineId, input.companyId, input.userId],
  )
  return rows[0]?.channel_id ?? null
}

export async function pauseRoutine(
  db: Queryable,
  input: { routineId: string; companyId: string },
): Promise<Record<string, unknown> | null> {
  const { rows } = await db.query<Record<string, unknown>>(
    `UPDATE agent_routines SET status='paused', updated_at=NOW()
      WHERE id=$1 AND company_id=$2 RETURNING *`,
    [input.routineId, input.companyId],
  )
  return rows[0] ?? null
}

export async function activeWorkId(
  db: Queryable,
  input: { companyId: string; userId: string; agentId: string; channelId: string },
): Promise<string | null> {
  const { rows } = await db.query<{ id: string }>(
    `SELECT work.id FROM agent_work_items work
      JOIN im_channel_bindings binding
        ON binding.channel_id=work.channel_id AND binding.company_id=work.company_id
      JOIN conversations conversation
        ON conversation.id=work.channel_id AND conversation.company_id=work.company_id
     WHERE work.company_id=$1 AND conversation.members @> to_jsonb(ARRAY[$2::text])
       AND work.agent_id=$3 AND work.channel_id=$4 AND work.status='leased'
     ORDER BY work.updated_at DESC LIMIT 1`,
    [input.companyId, input.userId, input.agentId, input.channelId],
  )
  return rows[0]?.id ?? null
}

export async function requestWorkCancellation(db: Queryable, workId: string): Promise<void> {
  await db.query(
    `UPDATE agent_work_items SET cancel_requested_at=NOW(), updated_at=NOW() WHERE id=$1`,
    [workId],
  )
}

export async function appendWorkSteer(
  db: Queryable,
  input: { workId: string; steer: { id: string; text: string; createdAt: string } },
): Promise<boolean> {
  const result = await db.query(
    `UPDATE agent_work_items
        SET steer_inputs=CASE
              WHEN EXISTS (
                SELECT 1 FROM jsonb_array_elements(steer_inputs) item WHERE item->>'id'=$3
              ) THEN steer_inputs
              ELSE steer_inputs || $2::jsonb
            END,
            updated_at=NOW()
      WHERE id=$1
        AND NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(steer_inputs) item
           WHERE item->>'id'=$3 AND item->>'text'<>$4
        )
      RETURNING id`,
    [input.workId, JSON.stringify([input.steer]), input.steer.id, input.steer.text],
  )
  return Boolean(result.rows[0])
}

export async function channelType(
  db: Queryable,
  input: { companyId: string; channelId: string },
): Promise<number> {
  const { rows } = await db.query<{ profile: Record<string, unknown> }>(
    `SELECT profile FROM im_channel_bindings WHERE channel_id=$1 AND company_id=$2`,
    [input.channelId, input.companyId],
  )
  return Number(rows[0]?.profile.channelType ?? 2)
}
