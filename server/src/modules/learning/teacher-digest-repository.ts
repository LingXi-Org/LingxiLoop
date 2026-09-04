import type { Queryable } from '../../db/queryable.js'

export async function calculateTeacherDigestRun(
  db: Queryable,
  input: {
    timezone: string
    frequency: 'daily' | 'weekly'
    localTime: string
    weekdayIndex: number
    from: Date
  },
): Promise<string> {
  const { rows } = await db.query<{ next_run_at: string }>(
    `WITH local_clock AS (
       SELECT $5::timestamptz AT TIME ZONE $1 AS local_now
     ), candidate AS (
       SELECT CASE WHEN $2='daily' THEN
         ((CASE WHEN local_now::time < $3::time
           THEN local_now::date ELSE local_now::date+1 END)+$3::time)
       ELSE
         ((local_now::date + (($4::int-EXTRACT(ISODOW FROM local_now)::int+7)%7))+$3::time)
       END AS local_candidate,local_now
       FROM local_clock
     )
     SELECT ((CASE WHEN $2='weekly' AND local_candidate<=local_now
       THEN local_candidate+INTERVAL '7 days' ELSE local_candidate END)
       AT TIME ZONE $1)::text AS next_run_at
     FROM candidate`,
    [input.timezone, input.frequency, input.localTime, input.weekdayIndex, input.from],
  )
  if (!rows[0]) throw new Error('could not calculate next digest time')
  return String(rows[0].next_run_at)
}

export async function pauseTeacherDigest(
  db: Queryable,
  companyId: string,
  routineId: string,
): Promise<void> {
  await db.query(
    `UPDATE agent_routines
        SET status='paused',next_run_at=NULL,updated_at=NOW()
      WHERE company_id=$1 AND id=$2`,
    [companyId, routineId],
  )
}

export async function upsertTeacherDigest(
  db: Queryable,
  input: {
    id: string
    companyId: string
    agentId: string
    roomId: string
    schedule: { frequency: 'daily' | 'weekly'; localTime: string; weekday?: string }
    timezone: string
    nextRunAt: string
    teacherId: string
  },
): Promise<void> {
  await db.query(
    `INSERT INTO agent_routines(
      id,company_id,agent_id,channel_id,kind,title,instructions,schedule,
      timezone,status,next_run_at,created_by,approved_by
    ) VALUES(
      $1,$2,$3,$4,'teacher_project_digest','项目学情摘要',
      'Generate a bounded aggregate teacher digest with host.teacher.overview. Do not read raw attempts or perform writes.',
      $5::jsonb,$6,'active',$7,$8,$8
    )
    ON CONFLICT(id) DO UPDATE SET
      schedule=EXCLUDED.schedule,timezone=EXCLUDED.timezone,status='active',
      next_run_at=EXCLUDED.next_run_at,updated_at=NOW(),created_by=EXCLUDED.created_by`,
    [
      input.id,
      input.companyId,
      input.agentId,
      input.roomId,
      JSON.stringify(input.schedule),
      input.timezone,
      input.nextRunAt,
      input.teacherId,
    ],
  )
}
