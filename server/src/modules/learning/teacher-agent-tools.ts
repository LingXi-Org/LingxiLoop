import { productConversationId } from '../../agent-runtime/identity.js'
import { z } from 'zod'
import { NoEffectError, type ActionContext, type ToolDefinition } from '@lyyzka/lingxios'
import type { Queryable } from '../../db/queryable.js'
import { nativeContext, nativeTool, compareResource, authorizeAudienceRead } from '../../agents/tools.js'
import { queueNativeEvents, type NativeEvent } from '../../agents/native-events.js'
import { createPermissionService } from '../access/public.js'
import { teacherAgentSchemas as schemas } from './agent-contracts.js'
import { describeTeacherAction, executeTeacherAction, resolveTeacherScope, teacherActionRequiresApproval } from './teacher-agent-application.js'
import { findTeacherScopeBinding } from './teacher-runtime-repository.js'

type Method = keyof typeof schemas
const digestReads = new Set<Method>(['current', 'overview', 'list_learners', 'list_objectives', 'list_activities', 'get_digest_schedule'])
const reads = new Set<Method>([...digestReads, 'get_learner', 'list_reviews', 'list_rooms'])
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}

async function authorize(context: ActionContext, method: Method) {
  if (context.work.kind === 'teacher_digest' && !digestReads.has(method)) throw new NoEffectError('scheduled teacher summaries allow aggregate reads only', 'forbidden')
  const scope = await resolveTeacherScope(nativeContext(context), context.database as Queryable)
  await authorizeAudienceRead(context,{ projectId: scope.projectId,action: 'learning:manage',resource: { type: 'project',id: scope.projectId } })
}

async function state(context: ActionContext, method: Method, args: Record<string, unknown>, result: unknown) {
  const db = context.database as Queryable, work = context.work
  const scope = await findTeacherScopeBinding(db, work.tenantId, work.agentId, productConversationId(work))
  if (!scope) throw new NoEffectError('teacher scope no longer exists', 'forbidden')
  await createPermissionService(db).assertCan({ actorUserId: work.principalId!, companyId: work.tenantId,
    action: 'learning:read', resource: { type: 'project', id: scope.project_id } })
  let table: string, columns: string, where: string, ids: string[]
  const returned = object(result)
  if (method.includes('objective')) {
    table = 'learning_knowledge_units'; columns = method === 'draft_objectives' ? 'id,title,success_criteria,target_level,created_by' : 'id,status'
    ids = args.objectiveId ? [String(args.objectiveId)] : (Array.isArray(result) ? result.map(row => String(object(row).id)) : [])
    where = 'project_id=$2 AND id=ANY($3::text[])'
  } else if (method.includes('activity')) {
    table = 'learning_activities'; columns = method === 'draft_activity' ? 'id,title,instructions,kind,evaluation_mode,target_level,rubric,created_by' : 'id,status'
    ids = [String(args.activityId ?? returned.id)]; where = 'project_id=$2 AND id=ANY($3::text[])'
  } else if (method === 'review_evaluation') {
    table = 'learning_evaluations'; columns = 'id,status'; ids = [String(args.evaluationId)]; where = 'project_id=$2 AND id=ANY($3::text[])'
  } else if (method === 'set_learner_membership' || method === 'set_teacher_membership') {
    table = 'project_memberships'; columns = 'user_id,role,status'; ids = [String(args.userId)]; where = 'project_id=$2 AND user_id=ANY($3::text[])'
  } else if (method === 'set_room_binding') {
    table = 'learning_course_rooms'; columns = 'conversation_id,purpose'; ids = [String(args.conversationId)]; where = 'course_id=$2 AND conversation_id=ANY($3::text[])'
  } else if (method === 'configure_digest') {
    table = 'agent_routines'; columns = 'id,schedule,timezone,status'; ids = [work.agentId]; where = "channel_id=$2 AND agent_id=ANY($3::text[]) AND kind='teacher_project_digest'"
  } else if (method === 'get_attempt') {
    const audit = await db.query(`SELECT 1 FROM audit_events WHERE company_id=$1 AND kind='teacher_agent_attempt_access'
      AND user_id=$2 AND detail->>'attemptId'=$3 LIMIT 1`, [work.tenantId,work.principalId,args.attemptId])
    return { resource: `teacher:attempt:${String(args.attemptId)}`, observed: { audited: audit.rows.length === 1 } }
  } else {
    table = 'projects'; columns = method === 'update_course' ? `id,${Object.keys(args).map(key => key === 'title' ? 'name' : 'description').join(',')}` : 'id,status'
    ids = [scope.project_id]; where = 'id=$2 AND id=ANY($3::text[])'
  }
  const scopeId = method === 'set_room_binding' ? scope.course_id : method === 'configure_digest' ? productConversationId(work) : scope.project_id
  const { rows } = await db.query(`SELECT ${columns} FROM ${table} WHERE company_id=$1 AND ${where} ORDER BY 1`, [work.tenantId,scopeId,ids])
  return { resource: `${table}:${ids.join(',')}`, observed: { rows: JSON.parse(JSON.stringify(rows)) as unknown[] } }
}

function teacherTool<M extends Method>(method: M): ToolDefinition<z.output<(typeof schemas)[M]>> {
  const effect = reads.has(method) ? 'read' : 'transaction'
  return nativeTool(`teacher.${method}`, schemas[method], {
    description: `Teacher operations: ${method.replaceAll('_', ' ')} within the current authorized course.`, effect,
    approval: teacherActionRequiresApproval(`teacher.${method}`), authorize: context => authorize(context, method),
    ...(teacherActionRequiresApproval(`teacher.${method}`) ? { async preview(context: ActionContext) {
      const preview = await describeTeacherAction(nativeContext(context), context.action, context.database as Queryable)
      if (!preview) throw new NoEffectError('teacher preview is unavailable')
      return { ...preview }
    } } : {}),
    async execute(context, input) {
      const events: NativeEvent[] = [], db = context.database as Queryable
      const result = await executeTeacherAction(nativeContext(context), method, input, db, run => run(db), async () => {
        events.push({ type: 'im.channel_sync', companyId: context.work.tenantId, channelId: productConversationId(context.work) })
      })
      if (effect === 'read') return { ok: true, executionState: 'succeeded', value: result }
      await queueNativeEvents(context, events)
      return { ok: true, executionState: 'succeeded', value: { result, state: await state(context, method, input, result) } }
    },
    ...(effect === 'transaction' ? { async verify(context: ActionContext, input: z.output<(typeof schemas)[M]>, value: unknown) {
      const stored = object(value), expected = object(stored.state)
      const actual = await state(context, method, input, stored.result)
      return compareResource(actual.resource, object(expected.observed), actual.observed)
    } } : {}),
  })
}

export const teacherTools = Object.keys(schemas).map(method => teacherTool(method as Method))
