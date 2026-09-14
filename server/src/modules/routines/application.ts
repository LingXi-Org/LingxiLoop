import { productConversationId } from '../../agent-runtime/identity.js'
import { createHash } from 'node:crypto'
import { NoEffectError, readRunReference, type ActionContext, type RunIdentity, type createLingxiOS } from '@lyyzka/lingxios'
import type { Queryable } from '../../db/queryable.js'
import { createPermissionService } from '../access/public.js'
import type { RoutineRow, RoutineRunRow } from './contracts.js'

export type RoutineControl = () => Promise<Pick<Awaited<ReturnType<typeof createLingxiOS>>, 'enqueueJob' | 'readRun' | 'readDelivery' | 'cancel'>>
export async function routineIdentity(db: Queryable, run: RoutineRunRow): Promise<RunIdentity> {
  const identity = await readRunReference(db,run.company_id,run.work_id)
  if (!identity || identity.agentId !== run.agent_id || identity.principalId !== run.principal_id) throw new Error('routine run identity is unavailable')
  return identity
}

export async function authorizeRoutine(db: Queryable, input: { companyId: string; channelId: string; agentId: string; principalId: string }) {
  await createPermissionService(db, { lockDependencies: true }).assertCan({ actorUserId: input.principalId, companyId: input.companyId,
    action: 'agent_run:control', resource: { type: 'conversation', id: input.channelId } })
  const { rows } = await db.query<{ project_id: string | null }>(`SELECT conversation.project_id FROM conversations conversation
    JOIN im_channel_bindings binding ON binding.company_id=conversation.company_id AND binding.channel_id=conversation.id
    JOIN participants agent ON agent.company_id=conversation.company_id AND agent.id=$3 AND agent.kind='agent' AND agent.departed_at IS NULL
    JOIN participants human ON human.company_id=conversation.company_id AND human.id=$4 AND human.kind='human' AND human.departed_at IS NULL
    WHERE conversation.company_id=$1 AND conversation.id=$2 AND binding.profile->'members' ? agent.id AND binding.profile->'members' ? human.id
      AND agent.capabilities @> '["routines"]'::jsonb
      AND NOT EXISTS(SELECT 1 FROM learning_project_teacher_agents teacher WHERE teacher.company_id=agent.company_id AND teacher.agent_id=agent.id)`,
    [input.companyId,input.channelId,input.agentId,input.principalId])
  if (!rows[0]) throw new NoEffectError('routine membership or capability was revoked', 'forbidden')
  return rows[0].project_id
}
export async function routineScope(context: ActionContext) {
  const work = context.work
  return authorizeRoutine(context.database as Queryable, { companyId: work.tenantId, channelId: productConversationId(work),
    agentId: work.agentId, principalId: work.principalId! })
}
export async function findRoutine(context: ActionContext, id: string) {
  const projectId = await routineScope(context), work = context.work
  const { rows } = await (context.database as Queryable).query<RoutineRow>(`SELECT * FROM agent_routines
    WHERE id=$1 AND company_id=$2 AND agent_id=$3 AND channel_id=$4 AND created_by=$5 AND thread_id IS NOT DISTINCT FROM $6
      AND project_id IS NOT DISTINCT FROM $7 AND kind<>'teacher_project_digest' FOR UPDATE`,
    [id,work.tenantId,work.agentId,productConversationId(work),work.principalId,work.threadId ?? null,projectId])
  if (!rows[0]) throw new NoEffectError('routine is outside this principal and conversation', 'forbidden')
  return rows[0]
}
export async function nextRoutineRun(db: Queryable, schedule: Record<string, unknown>, timezone: string, now: Date) {
  const { rows } = await db.query<{ next: Date }>(`SELECT CASE WHEN $2::int IS NOT NULL THEN $1::timestamptz + $2::int * INTERVAL '1 minute'
    ELSE (SELECT MIN((($1::timestamptz AT TIME ZONE $3)::date+day+$4::time) AT TIME ZONE $3)
      FROM generate_series(0,2) day WHERE ((($1::timestamptz AT TIME ZONE $3)::date+day+$4::time) AT TIME ZONE $3)>$1::timestamptz) END AS next`,
    [now,schedule.everyMinutes ?? null,timezone,schedule.time ?? '09:00'])
  const next = new Date(rows[0]?.next)
  if (!Number.isFinite(next.getTime()) || next <= now) throw new Error('routine schedule has no future instant')
  return next.toISOString()
}
export async function cancelRoutineRuns(db: Queryable, control: RoutineControl, id: string, exceptWorkId?: string) {
  const { rows } = await db.query<RoutineRunRow>('SELECT * FROM agent_routine_runs WHERE routine_id=$1 AND settled_at IS NULL ORDER BY scheduled_at LIMIT 32', [id])
  for (const run of rows) if (run.work_id !== exceptWorkId) await (await control()).cancel(await routineIdentity(db,run), db)
}
export const routineId = (actionId: string) => 'routine-' + createHash('sha256').update(actionId).digest('hex')
