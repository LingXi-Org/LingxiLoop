import { productConversationId } from '../../agent-runtime/identity.js'
import { z } from 'zod'
import { NoEffectError, type ActionContext, type ToolDefinition } from '@lyyzka/lingxios'
import type { Queryable } from '../../db/queryable.js'
import { nativeTool, compareResource, audienceHumanIds } from '../../agents/tools.js'
import { queueNativeEvents } from '../../agents/native-events.js'
import { readAgentChannelMessages } from '../../im/public.js'
import { inc } from '../../metrics.js'
import { createPermissionService } from '../access/public.js'
import { learningAgentSchemas as schemas } from './agent-contracts.js'
import { loadLearningContext, recordLearningAttempt, startLearningMission } from './missions-application.js'
import { addLearningMissionSteps, completeLearningMission, finishLearningMissionPlanning, updateLearningMissionStep } from './mission-lifecycle-application.js'
import { createLearningKnowledgeUnits, createProjectLearningActivity } from './curriculum-application.js'
import { findLearningMission, findLearningRoomState, listProjectLearningKnowledgeUnits, findVisibleProjectLearningActivity } from './repository.js'
import { proposeLearningEvaluation } from './evaluation-application.js'

type Method = keyof typeof schemas
type Input<M extends Method> = z.output<(typeof schemas)[M]>
const database = (context: ActionContext) => context.database as Queryable
const roomInput = (context: ActionContext) => ({ companyId: context.work.tenantId, channelId: productConversationId(context.work) })

async function scope(context: ActionContext, action: 'learning:read' | 'learning:submit' = 'learning:read') {
  const room = await findLearningRoomState(database(context), roomInput(context))
  if (!room) throw new NoEffectError('conversation is not bound to a learning project')
  for (const userId of await audienceHumanIds(context)) if (userId !== context.work.principalId) {
    await createPermissionService(database(context),{ lockDependencies: true }).assertCan({ actorUserId: userId,
      companyId: room.companyId,projectId: room.projectId,action: 'learning:manage',resource: { type: 'project',id: room.projectId } })
  }
  await createPermissionService(database(context), { lockDependencies: true }).assertCan({
    actorUserId: context.work.principalId!, companyId: context.work.tenantId, action,
    resource: { type: 'conversation', id: productConversationId(context.work) } })
  return room
}

async function contextView(context: ActionContext) {
  await scope(context)
  return loadLearningContext(database(context), { syncMessages: async () => [] }, { ...roomInput(context),
    agentId: context.work.agentId, triggerClientMsgNo: context.work.triggerRef, actorId: context.work.principalId! })
}

async function mission(context: ActionContext, id?: string) {
  const room = await scope(context)
  if (!id) return (await contextView(context))?.activeMission ?? null
  const result = await findLearningMission(database(context), room.companyId, room.projectId, id)
  if (!result || result.learnerId !== context.work.principalId || result.conversationId !== productConversationId(context.work)) throw new NoEffectError('mission is outside the original learner and conversation', 'forbidden')
  return result
}

async function committedMessages(context: ActionContext, ids: string[]) {
  if (!ids.length) return []
  const messages = await readAgentChannelMessages({ companyId: context.work.tenantId, agentId: context.work.agentId,
    channelId: productConversationId(context.work), messageIds: ids, signal: context.signal })
  if (!messages || new Set(messages.map(message => message.messageId)).size !== ids.length
    || messages.some(message => message.fromUid !== context.work.principalId || message.payload.refs?.agentId)) throw new NoEffectError('evidence must be committed messages from the original human', 'forbidden')
  return ids.map(id => ({ ...messages.find(message => message.messageId === id || message.payload.clientMsgNo === id)!, clientMsgNo: id }))
}

export async function readLearningAttempts(context: ActionContext, input: { attemptId?: string; activityId?: string; missionStepId?: string }) {
  const room = await scope(context), db = database(context)
  const { rows } = await db.query<Record<string, unknown>>(`SELECT a.id,a.activity_id,a.mission_step_id,a.assistance,a.status,a.submitted_at,a.evidence_id
    FROM learning_attempts a JOIN participants p ON p.company_id=a.company_id AND p.id=a.learner_id
    WHERE a.company_id=$1 AND a.project_id=$2 AND a.learner_id=$3 AND p.kind='human' AND p.departed_at IS NULL
      AND ($4::text IS NULL OR a.id=$4) AND ($5::text IS NULL OR a.activity_id=$5) AND ($6::text IS NULL OR a.mission_step_id=$6)
    ORDER BY a.submitted_at DESC,a.id DESC LIMIT 101`,
  [room.companyId,room.projectId,context.work.principalId,input.attemptId ?? null,input.activityId ?? null,input.missionStepId ?? null])
  if (!input.attemptId) return { attempts: rows.slice(0,100), truncated: rows.length > 100 }
  const attempt = rows[0]
  if (!attempt) throw new NoEffectError('attempt is outside the original learner and project', 'forbidden')
  const evidence = await db.query('SELECT id,data,created_by_type,created_by_id,created_at FROM evidence_records WHERE company_id=$1 AND project_id=$2 AND id=$3',
    [room.companyId,room.projectId,attempt.evidence_id])
  if (evidence.rows.length !== 1) throw new NoEffectError('attempt evidence is missing')
  const evaluations = await db.query(`SELECT id,demonstrated_level,confidence,rubric_results,feedback,evaluator_id,evaluator_kind,status,source_evidence_id,verifier_evidence_id,created_at
    FROM learning_evaluations WHERE company_id=$1 AND project_id=$2 AND attempt_id=$3 ORDER BY created_at DESC,id DESC LIMIT 101`, [room.companyId,room.projectId,input.attemptId])
  return { ...attempt, evidence: evidence.rows[0], evaluations: evaluations.rows.slice(0,100), evaluationsTruncated: evaluations.rows.length > 100 }
}

function read<M extends Method>(method: M, run: (context: ActionContext, input: Input<M>) => Promise<unknown>) {
  return nativeTool(`learning.${method}`, schemas[method], { description: `Read ${method.replaceAll('_', ' ')} for the original learner in this project.`,
    effect: 'read', approval: false, authorize: async context => { await scope(context) },
    async execute(context, input) { return { ok: true, executionState: 'succeeded', value: await run(context, input) } } })
}

function write<M extends Method, R>(method: M, run: (context: ActionContext, input: Input<M>) => Promise<R>,
  inspect: (context: ActionContext, input: Input<M>, result: R) => Promise<{ resource: string; observed: Record<string, unknown> }>) {
  return nativeTool(`learning.${method}`, schemas[method], { description: `Persist ${method.replaceAll('_', ' ')} with native learner and evidence checks.`,
    effect: 'transaction', approval: false, authorize: async context => { await scope(context, 'learning:submit') },
    async execute(context, input) {
      const result = await run(context, input)
      return { ok: true, executionState: 'succeeded', value: { result, state: await inspect(context, input, result) } }
    }, async verify(context, input, value) {
      const expected = value as { result: R; state: { observed: Record<string, unknown> } }
      const actual = await inspect(context, input, expected.result)
      return compareResource(actual.resource, expected.state.observed, actual.observed)
    } })
}

async function missionState(context: ActionContext, input: { missionId: string }) {
  const result = await mission(context, input.missionId)
  return { resource: `learning_mission:${input.missionId}`, observed: { status: result?.status, steps: result?.steps } }
}

export const learningTools: ToolDefinition[] = [
  read('current', contextView), read('get_learner_state', contextView),
  read('list_knowledge_units', async context => (await contextView(context))?.knowledgeUnits ?? []),
  read('list_due', async context => (await contextView(context))?.due ?? []),
  read('get_mission', (context, input) => mission(context, input.missionId)),
  read('get_activity', async (context, input) => {
    const room = await scope(context)
    const value = await findVisibleProjectLearningActivity(database(context), room.companyId, room.projectId, input.activityId)
    if (!value) throw new NoEffectError('activity not found')
    return value
  }),
  read('list_attempts', readLearningAttempts), read('get_attempt', readLearningAttempts),
  write('draft_knowledge_units', async (context, input) => {
    const room = await scope(context, 'learning:submit'), db = database(context)
    return createLearningKnowledgeUnits(db, run => run(db), { ...input, companyId: room.companyId, projectId: room.projectId, actorId: context.work.agentId, actorKind: 'agent' })
  }, async (context, _input, result) => {
    const room = await scope(context), ids = new Set(result.map(unit => unit.id))
    const units = (await listProjectLearningKnowledgeUnits(database(context), room.companyId, room.projectId)).filter(unit => ids.has(unit.id))
      .map(({ status: _status, ...unit }) => unit)
    return { resource: `learning_units:${room.projectId}`, observed: { units } }
  }),
  write('draft_activity', async (context, input) => {
    const room = await scope(context, 'learning:submit'), db = database(context)
    return createProjectLearningActivity(db, run => run(db), { ...input, companyId: room.companyId, projectId: room.projectId, actorId: context.work.agentId, actorKind: 'agent' })
  }, async (context, _input, result) => {
    const room = await scope(context)
    const activity = await findVisibleProjectLearningActivity(database(context), room.companyId, room.projectId, result.id)
    return { resource: `learning_activity:${result.id}`, observed: { title: activity?.title, instructions: activity?.instructions,
      kind: activity?.kind, rubric: activity?.rubric, knowledgeUnitIds: activity?.knowledgeUnitIds } }
  }),
  write('add_steps', async (context, input) => {
    await mission(context, input.missionId)
    const db = database(context)
    return addLearningMissionSteps(db, run => run(db), roomInput(context), input.missionId, input.steps)
  }, missionState),
  write('update_step', async (context, input) => {
    await mission(context, input.missionId)
    const db = database(context)
    return updateLearningMissionStep(db, run => run(db), roomInput(context), input)
  }, missionState),
  write('finish_planning', async (context, input) => {
    await mission(context, input.missionId)
    const db = database(context)
    return finishLearningMissionPlanning(db, run => run(db), roomInput(context), input.missionId)
  }, missionState),
  write('complete_mission', async (context, input) => {
    await mission(context, input.missionId)
    const db = database(context)
    return completeLearningMission(db, run => run(db), roomInput(context), input.missionId)
  }, missionState),
  write('record_attempt', async (context, input) => {
    const messages = await committedMessages(context, input.evidenceClientMsgNos), db = database(context)
    const result = await recordLearningAttempt(db, run => run(db), {
      syncMessages: async () => messages.map(message => ({ clientMsgNo: message.clientMsgNo, fromUid: message.fromUid, authoredByAgent: false })), metric: inc,
    }, { ...roomInput(context), agentId: context.work.agentId, ...input })
    if (result.learnerId !== context.work.principalId) throw new NoEffectError('evidence belongs to another learner', 'forbidden')
    return result
  }, async (context, _input, result) => {
    const attempt = await readLearningAttempts(context, { attemptId: result.id })
    return { resource: `learning_attempt:${result.id}`, observed: { evidence: Reflect.get(attempt, 'evidence'), assistance: Reflect.get(attempt, 'assistance') } }
  }),
  write('propose_evaluation', async (context, input) => {
    const room = await scope(context, 'learning:submit'), db = database(context)
    await readLearningAttempts(context, { attemptId: input.attemptId })
    for (const id of [input.sourceEvidenceId,input.verifierEvidenceId]) if (id) {
      const found = await db.query('SELECT 1 FROM evidence_records WHERE company_id=$1 AND project_id=$2 AND id=$3', [room.companyId,room.projectId,id])
      if (found.rows.length !== 1) throw new NoEffectError('evaluation evidence is outside this project', 'forbidden')
    }
    return proposeLearningEvaluation(db, run => run(db), inc, { ...roomInput(context), agentId: context.work.agentId, ...input })
  }, async (context, input, result) => {
    const room = await scope(context)
    await readLearningAttempts(context, { attemptId: input.attemptId })
    const row = await context.database.query(`SELECT id,attempt_id,demonstrated_level,confidence,rubric_results,feedback,evaluator_id,status,
      source_evidence_id,verifier_evidence_id FROM learning_evaluations WHERE company_id=$1 AND project_id=$2 AND id=$3`, [room.companyId,room.projectId,result.evaluationId])
    return { resource: `learning_evaluation:${result.evaluationId}`, observed: row.rows[0] ?? { missing: true } }
  }),
  nativeTool('learning.start_mission', schemas.start_mission, { description: 'Create a learner Mission and its coordinator child in the same transaction.',
    effect: 'transaction', approval: false, authorize: async context => { await scope(context, 'learning:submit') },
    async execute(context, input) {
      const source = input.sourceClientMsgNo ?? context.work.triggerRef
      const messages = await committedMessages(context, [source]), db = database(context)
      if (messages[0]?.payload.kind !== 'text') throw new NoEffectError('a Mission requires the original learner’s committed text')
      let childId: string | undefined
      const result = await startLearningMission(db, run => run(db), {
        syncMessages: async () => messages.map(message => ({ clientMsgNo: message.clientMsgNo, fromUid: message.fromUid, authoredByAgent: false })),
        metric: inc, enqueueCoordinator: async (_db, child) => {
          const queued = await context.enqueueChild({ id: child.id, agentId: child.coordinatorAgentId, kind: 'mission_coordinator',
            executionClass: 'operation', text: `Plan and coordinate Mission ${child.missionId}: ${input.goal}\nSuccess criteria: ${input.successCriteria}`, meta: { conversationId: child.channelId, missionId: child.missionId, sourceClientMsgNo: source } })
          childId = queued.id
        }, publishMission: async ({ mission, projectId, courseId }) => {
          const clientNonce = `learning-mission-${mission.id}`
          await queueNativeEvents(context, [{ type: 'im.system', companyId: context.work.tenantId, actorId: context.work.agentId,
            channelId: productConversationId(context.work), clientNonce, payload: { version: 1, kind: 'learning_mission', clientMsgNo: clientNonce,
              body: mission.goal, refs: { agentId: context.work.agentId }, data: { missionId: mission.id, projectId, ...(courseId ? { courseId } : {}),
                goal: mission.goal, successCriteria: mission.successCriteria, kind: mission.kind, coordinatorAgentId: mission.coordinatorAgentId, status: mission.status, suppressAgentWake: true } } }])
        },
      }, { ...roomInput(context), workId: context.work.id, agentId: context.work.agentId, triggerClientMsgNo: source, ...input })
      if (result.learnerId !== context.work.principalId) throw new NoEffectError('Mission principal changed', 'forbidden')
      return { ok: true, executionState: 'succeeded', value: result,
        ...(childId ? { directive: await context.waitForChildren([childId]) } : {}) }
    }, async verify(context, _input, value) {
      const expected = value as { id: string; learnerId: string; goal: string; successCriteria: string; coordinatorAgentId: string }
      return compareResource(`learning_mission:${expected.id}`, { learnerId: expected.learnerId, goal: expected.goal, successCriteria: expected.successCriteria,
        coordinatorAgentId: expected.coordinatorAgentId }, await mission(context, expected.id) ?? {})
    } }),
]
