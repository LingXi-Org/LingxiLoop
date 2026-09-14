import { productConversationId } from '../../agent-runtime/identity.js'
import type { ActionContext, ToolDefinition } from '@lyyzka/lingxios'
import type { Queryable } from '../../db/queryable.js'
import { nativeTool, compareResource } from '../../agents/tools.js'
import { routineSchemas } from './contracts.js'
import { cancelRoutineRuns, findRoutine, nextRoutineRun, routineId, routineScope, type RoutineControl } from './application.js'

export function createRoutineTools(control: RoutineControl): ToolDefinition[] {
  const authorize = async (context: ActionContext) => { await routineScope(context) }
  const verify: ToolDefinition['verify'] = async (context, _input, value) => {
    const row = value as { id: string; status: string; version: number }
    return compareResource(`routine:${row.id}`, { status: row.status, version: row.version }, await findRoutine(context, row.id))
  }
  return [
    nativeTool('routines.list', routineSchemas.list, { description: 'List this principal’s routines in the current conversation.', effect: 'read', approval: false, authorize,
      async execute(context) { const projectId = await routineScope(context), work = context.work
        const { rows } = await context.database.query(`SELECT * FROM agent_routines WHERE company_id=$1 AND agent_id=$2 AND channel_id=$3
          AND created_by=$4 AND thread_id IS NOT DISTINCT FROM $5 AND project_id IS NOT DISTINCT FROM $6 AND kind<>'teacher_project_digest'
          ORDER BY created_at DESC,id LIMIT 101`, [work.tenantId,work.agentId,productConversationId(work),work.principalId,work.threadId ?? null,projectId])
        return { ok: true, value: { routines: rows.slice(0,100), truncated: rows.length > 100 } } } }),
    nativeTool('routines.create', routineSchemas.create, { description: 'Create an approved paused routine; activation requires its own approval.', effect: 'transaction', approval: true, authorize, verify,
      async preview(context, input) { return { ...input, projectId: await routineScope(context), principalId: context.work.principalId, threadId: context.work.threadId ?? null } },
      async execute(context, input) { const id = routineId(context.action.idempotencyKey), work = context.work
        await context.database.query(`INSERT INTO agent_routines(id,company_id,agent_id,channel_id,created_by,approved_by,operator_id,project_id,thread_id,
          kind,title,instructions,schedule,timezone,status) VALUES($1,$2,$3,$4,$5,$5,$3,$6,$7,$8,$9,$10,$11::jsonb,$12,'paused')`,
          [id,work.tenantId,work.agentId,productConversationId(work),work.principalId,await routineScope(context),work.threadId ?? null,
            input.kind,input.title,input.instructions,JSON.stringify(input.schedule),input.timezone])
        return { ok: true, value: await findRoutine(context, id) } } }),
    nativeTool('routines.activate', routineSchemas.activate, { description: 'Activate a routine after approval of its current instructions and schedule.', effect: 'transaction', approval: true, authorize, verify,
      async preview(context, input) { const row = await findRoutine(context, input.routineId); return { routineId: row.id, version: row.version,
        title: row.title, instructions: row.instructions, schedule: row.schedule, timezone: row.timezone, status: row.status,
        principalId: row.created_by, projectId: row.project_id, threadId: row.thread_id } },
      async execute(context, input) { const row = await findRoutine(context, input.routineId), db = context.database as Queryable
        const next = await nextRoutineRun(db, row.schedule, row.timezone, new Date())
        await db.query("UPDATE agent_routines SET status='active',next_run_at=$2,version=version+1,pause_reason=NULL,updated_at=NOW() WHERE id=$1", [row.id,next])
        await cancelRoutineRuns(db, control, row.id, context.work.id)
        return { ok: true, value: await findRoutine(context, row.id) } } }),
    nativeTool('routines.pause', routineSchemas.pause, { description: 'Pause a routine and cancel its outstanding runs.', effect: 'transaction', approval: false, authorize, verify,
      async execute(context, input) { const row = await findRoutine(context, input.routineId)
        await context.database.query("UPDATE agent_routines SET status='paused',next_run_at=NULL,version=version+1,pause_reason='requested',updated_at=NOW() WHERE id=$1", [row.id])
        await cancelRoutineRuns(context.database as Queryable, control, row.id, context.work.id)
        return { ok: true, value: await findRoutine(context, row.id) } } }),
  ]
}
