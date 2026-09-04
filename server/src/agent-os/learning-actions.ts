import { createHash, randomUUID } from 'node:crypto'
import { runStructuredLearningAction } from '../agents/cli.js'
import { pool } from '../db/pool.js'
import { advanceAgentReadReceipt } from '../im/read-receipts.js'
import { wukongClient } from '../im/wukong.js'
import {
  addCanvasWorkspaceAgents,
  appendCanvasFrameContent,
  type CanvasMemberInput,
  createCanvasFrame,
  deleteCanvasFrame,
  getCanvasSnapshot,
  handoffCanvasWork,
  listCanvasAvailableAgents,
  setCanvasStatus,
  startCanvasWorkspace,
  submitCanvasReport,
  updateCanvasFrame,
} from '../modules/canvas/index.js'
import {
  addKnowledgeFile,
  addKnowledgeText,
  addKnowledgeUrl,
  deleteKnowledgeSourceForAgent,
  listKnowledgeSourcesForAgent,
  retryKnowledgeSourceForAgent,
  setKnowledgeSourceEnabled,
} from '../modules/knowledge/public.js'
import { learningScoreBreakdownSchema } from '../modules/learning/contracts.js'
import {
  addMissionSteps,
  completeMission,
  createKnowledgeUnits,
  draftActivity,
  executeTeacherAction,
  finishMissionPlanning,
  getActivity,
  getMission,
  type LearningActivityType,
  type LearningEvaluationMode,
  type LearningStepStatus,
  type LearningStepType,
  loadLearningTurnContext,
  proposeEvaluation,
  recordAttempt,
  startMission,
  teacherActionRequiresApproval,
  updateMissionStep,
} from '../modules/learning/runtime.js'
import {
  approvePresentationOutlineForAgent,
  cancelPresentationForAgent,
  createPresentationForAgent,
  getPresentationForAgent,
  retryPresentationForAgent,
  revisePresentationForAgent,
  revisePresentationOutlineForAgent,
} from '../modules/presentations/public.js'
import { recallMemories, verifyExplicitMemory, writeExplicitMemory } from './memory-service.js'
import { readResearch, searchResearch } from './research.js'
import type { AgentWorkItem, HostAction, HostActionResult, LingxiMessageV1, MemoryScopeType } from './types.js'

const APPROVAL_REQUIRED = new Set([
  'email.send', 'email.reply',
  'routines.create', 'routines.activate',
  'documents.delete', 'calendar.create', 'calendar.delete',
  'knowledge.set_source_enabled', 'knowledge.delete_source',
  'presentations.approve_outline',
])

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function authorizationUserId(work: AgentWorkItem): string {
  if (!work.authorizationUserId) throw new Error('Agent work has no persisted human authorization principal')
  return work.authorizationUserId
}

function textArg(args: Record<string, unknown>, name: string, required = true): string {
  const value = typeof args[name] === 'string' ? args[name].trim() : ''
  if (required && !value) throw new Error(`${name} is required`)
  return value
}

function closedArg<const T extends string>(
  args: Record<string, unknown>,
  name: string,
  allowed: readonly T[],
): T {
  const value = textArg(args, name)
  if (!allowed.includes(value as T)) throw new Error(`${name} must be one of ${allowed.join(', ')}`)
  return value as T
}

const MISSION_KINDS = ['STUDY','RESEARCH','PROJECT'] as const
const STEP_KINDS = ['LEARN','PRACTICE','CHECK','REFLECT'] as const
const STEP_STATUSES = ['OPEN','IN_PROGRESS','COMPLETED','CANCELLED'] as const
const ACTIVITY_KINDS = ['LESSON','PRACTICE','ASSESSMENT','PROJECT','REVIEW'] as const
const EVALUATION_MODES = ['AGENT_FORMATIVE','TEACHER_REQUIRED'] as const
const ASSISTANCE_LEVELS = ['NONE','HINT','GUIDED'] as const

async function executeEducation(work: AgentWorkItem, method: string, args: Record<string, unknown>): Promise<HostActionResult> {
  const context = await loadLearningTurnContext(work)
  if (!context) throw new Error('current conversation is not bound to a project')
  if (method === 'current' || method === 'get_learner_state') return { ok: true, value: context }
  if (method === 'list_knowledge_units') return { ok: true, value: context.knowledgeUnits }
  if (method === 'list_due') return { ok: true, value: context.due }
  if (method === 'get_mission') {
    const missionId = textArg(args, 'missionId', false)
    if (!missionId) return { ok: true, value: context.activeMission ?? null }
    if (!context.learnerId) throw new Error('current learning room has no learner scope')
    return {
      ok: true,
      value: await getMission(missionId, work.companyId, context.project.id, context.learnerId, work.channelId),
    }
  }
  if (method === 'get_activity') return {
    ok: true,
    value: await getActivity(textArg(args, 'activityId'), work.companyId, context.project.id),
  }
  if (method === 'start_mission') return { ok: true, value: await startMission(work, {
    goal: textArg(args, 'goal'), successCriteria: textArg(args, 'successCriteria'),
    ...(typeof args.missionKind === 'string'
      ? { missionKind: closedArg(args, 'missionKind', MISSION_KINDS) }
      : {}),
    ...(typeof args.sourceClientMsgNo === 'string' ? { sourceClientMsgNo: args.sourceClientMsgNo } : {}),
    ...(args.explicit === true ? { explicit: true } : {}),
  }) }
  if (method === 'add_steps') {
    const steps = Array.isArray(args.steps) ? args.steps.map((item) => record(item)).map((item) => ({
      kind: closedArg(item, 'kind', STEP_KINDS) as LearningStepType,
      description: textArg(item, 'description'), successCriteria: textArg(item, 'successCriteria'),
      ...(typeof item.knowledgeUnitId === 'string' ? { knowledgeUnitId: item.knowledgeUnitId } : {}),
    })) : []
    return { ok: true, value: await addMissionSteps(work, textArg(args, 'missionId'), steps) }
  }
  if (method === 'finish_planning') return { ok: true, value: await finishMissionPlanning(work, textArg(args, 'missionId')) }
  if (method === 'update_step') return { ok: true, value: await updateMissionStep(work, {
    missionId: textArg(args, 'missionId'), stepId: textArg(args, 'stepId'),
    status: closedArg(args, 'status', STEP_STATUSES) as LearningStepStatus,
    ...(typeof args.outcome === 'string' ? { outcome: args.outcome } : {}),
    ...(typeof args.sourceEvidenceId==='string'?{sourceEvidenceId:args.sourceEvidenceId}:{}),
    ...(typeof args.attemptId==='string'?{attemptId:args.attemptId}:{}),
  }) }
  if (method === 'complete_mission') return { ok: true, value: await completeMission(work, textArg(args, 'missionId')) }
  if (method === 'draft_knowledge_units') {
    const knowledgeUnits = Array.isArray(args.knowledgeUnits)
      ? args.knowledgeUnits.map((item) => record(item)).map((item) => ({
      title: textArg(item, 'title'), successCriteria: textArg(item, 'successCriteria'),
      ...(item.targetLevel !== undefined ? { targetLevel: Number(item.targetLevel) } : {}),
      ...(Array.isArray(item.prerequisiteKnowledgeUnitIds)
        ? { prerequisiteKnowledgeUnitIds: item.prerequisiteKnowledgeUnitIds.map(String) }
        : {}),
    })) : []
    return { ok: true, value: await createKnowledgeUnits({
      companyId: work.companyId,
      projectId: context.project.id,
      actorId: work.agentId,
      actorKind: 'agent',
      knowledgeUnits,
    }) }
  }
  if (method === 'draft_activity') return { ok: true, value: await draftActivity({
    companyId: work.companyId, projectId: context.project.id, actorId: work.agentId, actorKind: 'agent',
    title: textArg(args, 'title'), instructions: textArg(args, 'instructions'),
    kind: closedArg(args, 'kind', ACTIVITY_KINDS) as LearningActivityType,
    ...(typeof args.evaluationMode === 'string'
      ? { evaluationMode: closedArg(args, 'evaluationMode', EVALUATION_MODES) as LearningEvaluationMode }
      : {}),
    ...(args.targetLevel !== undefined ? { targetLevel: Number(args.targetLevel) } : {}),
    ...(Array.isArray(args.rubric) ? { rubric: args.rubric } : {}),
    ...(Array.isArray(args.knowledgeUnitIds) ? { knowledgeUnitIds: args.knowledgeUnitIds.map(String) } : {}),
    ...(typeof args.dueAt === 'string' ? { dueAt: args.dueAt } : {}),
  }) }
  if (method === 'record_attempt') return { ok: true, value: await recordAttempt(work, {
    ...(typeof args.activityId === 'string' ? { activityId: args.activityId } : {}),
    ...(typeof args.missionStepId === 'string' ? { missionStepId: args.missionStepId } : {}),
    evidenceClientMsgNos: Array.isArray(args.evidenceClientMsgNos) ? args.evidenceClientMsgNos.map(String) : [],
    documentIds: Array.isArray(args.documentIds) ? args.documentIds.map(String) : [],
    canvasFrameIds: Array.isArray(args.canvasFrameIds) ? args.canvasFrameIds.map(String) : [],
    assistance: args.assistance === undefined
      ? 'NONE'
      : closedArg(args, 'assistance', ASSISTANCE_LEVELS),
  }) }
  if (method === 'propose_evaluation') {
    const rubricResults = learningScoreBreakdownSchema.parse(args.rubricResults)
    return { ok: true, value: await proposeEvaluation(work, {
      attemptId: textArg(args, 'attemptId'), demonstratedLevel: Number(args.demonstratedLevel), confidence: Number(args.confidence),
      rubricResults,
      ...(typeof args.feedback === 'string' ? { feedback: args.feedback } : {}),
      ...(typeof args.sourceEvidenceId === 'string' ? { sourceEvidenceId: args.sourceEvidenceId } : {}),
      ...(typeof args.verifierEvidenceId === 'string' ? { verifierEvidenceId: args.verifierEvidenceId } : {}),
    }) }
  }
  throw new Error(`unsupported learning action: ${method}`)
}

async function executeKnowledge(work: AgentWorkItem, method: string, args: Record<string, unknown>, action: HostAction): Promise<HostActionResult> {
  if (method === 'list_sources') return { ok: true, value: await listKnowledgeSourcesForAgent(work) }
  if (method === 'add_text') return { ok: true, value: await addKnowledgeText(work, { title: textArg(args, 'title'), text: textArg(args, 'text'), idempotencyKey: action.idempotencyKey }) }
  if (method === 'add_url') return { ok: true, value: await addKnowledgeUrl(work, { title: textArg(args, 'title', false) || textArg(args, 'url'), url: textArg(args, 'url'), idempotencyKey: action.idempotencyKey }) }
  if (method === 'add_file') {
    // Agents refer to a committed message, never an arbitrary storage key.
    // The Host resolves the attachment inside the current channel so a guessed
    // key from another tenant cannot cross the knowledge boundary.
    const clientMsgNo = textArg(args, 'clientMsgNo')
    const { rows } = await pool.query<{ profile: Record<string, unknown> }>(
      `SELECT profile FROM im_channel_bindings WHERE channel_id=$1 AND company_id=$2`, [work.channelId, work.companyId],
    )
    const messages = await wukongClient().syncMessages(work.channelId, Number(rows[0]?.profile.channelType ?? 2), 100, work.agentId)
    const message = messages.find((item) => item.clientMsgNo === clientMsgNo && item.payload.kind === 'attachment')
    if (!message) throw new Error('attachment message not found in the current conversation')
    const attachment = record(message.payload.data)
    return { ok: true, value: await addKnowledgeFile(work, {
      title: textArg(args, 'title', false) || String(attachment.name ?? '聊天附件'),
      storageKey: String(attachment.key ?? ''), mime: String(attachment.mime ?? ''), size: Number(attachment.size ?? 0),
      idempotencyKey: action.idempotencyKey,
    }) }
  }
  if (method === 'retry_ingestion') return { ok: true, value: await retryKnowledgeSourceForAgent(work, textArg(args, 'sourceId')) }
  if (method === 'set_source_enabled') return { ok: true, value: await setKnowledgeSourceEnabled(work, textArg(args, 'sourceId'), args.enabled === true) }
  if (method === 'delete_source') return { ok: true, value: await deleteKnowledgeSourceForAgent(work, textArg(args, 'sourceId')) }
  throw new Error(`unsupported knowledge action: ${method}`)
}

async function executePresentation(
  work: AgentWorkItem,
  method: string,
  args: Record<string, unknown>,
  action: HostAction,
): Promise<HostActionResult> {
  const presentationId = (): string => textArg(args, 'presentationId')
  const expectedRevision = (): number => {
    const value = Number(args.expectedRevision)
    if (!Number.isInteger(value) || value < 0) throw new Error('expectedRevision must be a non-negative integer')
    return value
  }
  const boundedInteger = (name: string, minimum: number, maximum: number): number | undefined => {
    if (args[name] === undefined) return undefined
    const value = Number(args[name])
    if (!Number.isInteger(value) || value < minimum || value > maximum) {
      throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`)
    }
    return value
  }
  const stringIds = (name: string): string[] | undefined => {
    if (args[name] === undefined) return undefined
    if (!Array.isArray(args[name])) throw new Error(`${name} must be an array`)
    if (!args[name].every((value) => typeof value === 'string' && value.trim())) {
      throw new Error(`${name} must contain only non-empty strings`)
    }
    const values = args[name].map((value) => value.trim())
    return [...new Set(values)]
  }

  if (method === 'create') {
    const sourceIds = stringIds('sourceIds')
    const targetSlideCount = boundedInteger('targetSlideCount', 24, 40)
    return {
      ok: true,
      value: await createPresentationForAgent(work, {
        idempotencyKey: action.idempotencyKey,
        requirements: textArg(args, 'requirements'),
        ...(typeof args.title === 'string' && args.title.trim() ? { title: args.title.trim() } : {}),
        ...(sourceIds ? { sourceIds } : {}),
        ...(targetSlideCount !== undefined ? { targetSlideCount } : {}),
        ...(typeof args.language === 'string' && args.language.trim() ? { language: args.language.trim() } : {}),
      }),
    }
  }
  if (method === 'get') return { ok: true, value: await getPresentationForAgent(work, presentationId()) }
  if (method === 'revise_outline') {
    const feedback = textArg(args, 'feedback', false)
    const targetSlideCount = boundedInteger('targetSlideCount', 3, 40)
    if (!feedback && targetSlideCount === undefined) {
      throw new Error('feedback or targetSlideCount is required')
    }
    return {
      ok: true,
      value: await revisePresentationOutlineForAgent(work, presentationId(), {
        ...(feedback ? { feedback } : {}),
        ...(targetSlideCount !== undefined ? { targetSlideCount } : {}),
        expectedRevision: expectedRevision(),
        idempotencyKey: action.idempotencyKey,
      }),
    }
  }
  if (method === 'approve_outline') return {
    ok: true,
    value: await approvePresentationOutlineForAgent(work, presentationId(), {
      expectedRevision: expectedRevision(),
    }),
  }
  if (method === 'revise') {
    const pageIds = stringIds('pageIds')
    const sectionIds = stringIds('sectionIds')
    return {
      ok: true,
      value: await revisePresentationForAgent(work, presentationId(), {
        instruction: textArg(args, 'instruction'),
        scope: closedArg(args, 'scope', ['page', 'section', 'deck'] as const),
        ...(pageIds ? { pageIds } : {}),
        ...(sectionIds ? { sectionIds } : {}),
        idempotencyKey: action.idempotencyKey,
      }),
    }
  }
  if (method === 'cancel') return {
    ok: true,
    value: await cancelPresentationForAgent(work, presentationId(), { idempotencyKey: action.idempotencyKey }),
  }
  if (method === 'retry') return {
    ok: true,
    value: await retryPresentationForAgent(work, presentationId(), {
      idempotencyKey: action.idempotencyKey,
    }),
  }
  throw new Error(`unsupported presentations action: ${method}`)
}

async function executeChat(work: AgentWorkItem, method: string, args: Record<string, unknown>, action: HostAction): Promise<HostActionResult> {
  if (method === 'history') {
    const channelId = textArg(args, 'channelId', false) || work.channelId
    const messages = await wukongClient().syncMessages(channelId, Number(args.channelType ?? 2), Number(args.limit ?? 50), work.agentId)
    const readThroughSeq = messages.reduce((max, message) => Math.max(max, message.messageSeq), 0)
    if (readThroughSeq > 0) {
      await advanceAgentReadReceipt({
        companyId: work.companyId,
        channelId,
        agentId: work.agentId,
        readThroughSeq,
      })
    }
    return { ok: true, value: messages }
  }
  if (method === 'send') {
    const body = textArg(args, 'body')
    const channelId = textArg(args, 'channelId', false) || work.channelId
    const payload: LingxiMessageV1 = {
      version: 1, kind: 'text', clientMsgNo: `action-${action.idempotencyKey}`, body,
      ...(typeof args.replyToClientMsgNo === 'string' ? { replyToClientMsgNo: args.replyToClientMsgNo } : {}),
      refs: { runId: action.runId, agentId: work.agentId },
    }
    return { ok: true, value: await wukongClient().sendMessage(channelId, Number(args.channelType ?? 2), work.agentId, payload) }
  }
  if (method === 'ask') {
    const rawItems = Array.isArray(args.items) ? args.items : []
    if (rawItems.length < 1 || rawItems.length > 8) throw new Error('items must contain between 1 and 8 questions')
    const names = new Set<string>()
    const items = rawItems.map((rawItem, itemIndex) => {
      const item = record(rawItem)
      const name = textArg(item, 'name', false) || `question_${itemIndex + 1}`
      if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(name) || names.has(name)) throw new Error('question names must be unique identifiers')
      names.add(name)
      const prompt = textArg(item, 'prompt')
      if (prompt.length > 500) throw new Error('question prompt is too long')
      const rawChoices = Array.isArray(item.choices) ? item.choices : []
      if (rawChoices.length > 12) throw new Error('a question can contain at most 12 choices')
      const values = new Set<string>()
      const choices = rawChoices.map((rawChoice) => {
        const choice = record(rawChoice)
        const value = textArg(choice, 'value')
        if (value.length > 120 || values.has(value)) throw new Error('choice values must be unique and at most 120 characters')
        values.add(value)
        return {
          value,
          label: textArg(choice, 'label'),
          ...(typeof choice.description === 'string' && choice.description.trim() ? { description: choice.description.trim().slice(0, 500) } : {}),
          ...(choice.disabled === true ? { disabled: true } : {}),
        }
      })
      const input = record(item.input)
      const freeform = typeof input.label === 'string' && input.label.trim()
        ? { label: input.label.trim().slice(0, 120), ...(typeof input.placeholder === 'string' ? { placeholder: input.placeholder.trim().slice(0, 160) } : {}) }
        : undefined
      if (choices.length === 0 && !freeform) throw new Error('each question requires choices or a freeform input')
      return {
        name,
        prompt,
        ...(typeof item.description === 'string' && item.description.trim() ? { description: item.description.trim().slice(0, 1_000) } : {}),
        ...(item.required === true ? { required: true } : {}),
        ...(item.multiple === true ? { multiple: true } : {}),
        choices,
        ...(freeform ? { input: freeform } : {}),
      }
    })
    const title = textArg(args, 'title', false).slice(0, 160) || 'Agent 提问'
    const channelId = textArg(args, 'channelId', false) || work.channelId
    const payload: LingxiMessageV1 = {
      version: 1,
      kind: 'questionnaire',
      clientMsgNo: `questionnaire-${action.idempotencyKey}`,
      body: title,
      refs: { runId: action.runId, agentId: work.agentId },
      data: {
        questionnaire: {
          title,
          items,
          ...(typeof args.submitLabel === 'string' && args.submitLabel.trim() ? { submitLabel: args.submitLabel.trim().slice(0, 80) } : {}),
        },
      },
    }
    return {
      ok: true,
      value: await wukongClient().sendMessage(channelId, Number(args.channelType ?? 2), work.agentId, payload),
      directive: { type: 'defer', reason: 'user' },
    }
  }
  if (method === 'handoff') {
    const targetAgentId = textArg(args, 'toAgentId')
    const payload: LingxiMessageV1 = {
      version: 1, kind: 'handoff', clientMsgNo: `handoff-${action.idempotencyKey}`,
      body: textArg(args, 'note', false),
      refs: { runId: action.runId, fromAgentId: work.agentId, toAgentId: targetAgentId },
      data: { title: textArg(args, 'title'), status: 'pending' },
    }
    const sent = await wukongClient().sendMessage(work.channelId, Number(args.channelType ?? 2), work.agentId, payload)
    await pool.query(
      `INSERT INTO agent_work_items
         (id, company_id, authorization_user_id, agent_id, channel_id, thread_root_client_msg_no, trigger_client_msg_no, reason, priority)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'handoff',150)
       ON CONFLICT (agent_id, trigger_client_msg_no, reason) DO NOTHING`,
      [randomUUID(), work.companyId, authorizationUserId(work), targetAgentId,
        work.channelId, payload.clientMsgNo, payload.clientMsgNo],
    )
    return { ok: true, value: sent }
  }
  if (method === 'react') throw new Error('reactions are sent by the WuKong client SDK and are not a host-side chat action')
  throw new Error(`unsupported chat action: ${method}`)
}

function stableId(prefix: string, key: string): string {
  return `${prefix}-${createHash('sha256').update(key).digest('hex').slice(0, 32)}`
}

async function executeRoutine(work: AgentWorkItem, method: string, args: Record<string, unknown>, action: HostAction): Promise<HostActionResult> {
  if (method === 'list') {
    const { rows } = await pool.query(`SELECT * FROM agent_routines WHERE company_id=$1 AND agent_id=$2 ORDER BY created_at DESC`, [work.companyId, work.agentId])
    return { ok: true, value: rows }
  }
  if (method === 'pause' || method === 'activate') {
    const { rows } = await pool.query(
      `UPDATE agent_routines SET status=$1, updated_at=NOW() WHERE id=$2 AND company_id=$3 AND agent_id=$4 RETURNING *`,
      [method === 'pause' ? 'paused' : 'active', textArg(args, 'routineId'), work.companyId, work.agentId],
    )
    if (!rows[0]) throw new Error('routine not found')
    return { ok: true, value: rows[0] }
  }
  if (method === 'create') {
    const id = stableId('routine', action.idempotencyKey)
    const { rows } = await pool.query(
      `INSERT INTO agent_routines
         (id, company_id, agent_id, channel_id, kind, title, instructions, schedule, timezone, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,'paused',$10)
       ON CONFLICT (id) DO UPDATE SET updated_at=agent_routines.updated_at RETURNING *`,
      [id, work.companyId, work.agentId, work.channelId, textArg(args, 'kind'), textArg(args, 'title'),
        textArg(args, 'instructions'), JSON.stringify(record(args.schedule)),
        textArg(args, 'timezone', false) || 'Asia/Shanghai', authorizationUserId(work)],
    )
    return { ok: true, value: rows[0] }
  }
  throw new Error(`unsupported routine action: ${method}`)
}

async function executePoll(work: AgentWorkItem, method: string, args: Record<string, unknown>, action: HostAction): Promise<HostActionResult> {
  const { pollApplication } = await import('../modules/polls/index.js')
  if (method === 'create') {
    const rawOptions = Array.isArray(args.options) ? args.options.map(String) : []
    return {
      ok: true,
      value: await pollApplication.create({
        conversationId: textArg(args, 'channelId', false) || work.channelId,
        companyId: work.companyId,
        actorId: work.agentId,
        question: textArg(args, 'question'),
        mode: args.mode === 'multi' ? 'multi' : 'single',
        options: rawOptions,
        expiresInMinutes: typeof args.expiresInMinutes === 'number' ? args.expiresInMinutes : null,
        idempotencyKey: action.idempotencyKey,
      }),
    }
  }
  const messageId = textArg(args, 'messageId')
  if (method === 'vote') {
    const optionIds = Array.isArray(args.optionIds) ? args.optionIds.map(String) : []
    return {
      ok: true,
      value: await pollApplication.vote({
        messageId, companyId: work.companyId, actorId: work.agentId,
        voterKind: 'agent', optionIds,
      }),
    }
  }
  if (method === 'close') return { ok: true, value: await pollApplication.close({ messageId, companyId: work.companyId, actorId: work.agentId, reason: 'manual' }) }
  if (method === 'show') {
    return { ok: true, value: await pollApplication.show(work.companyId, messageId) }
  }
  throw new Error(`unsupported poll action: ${method}`)
}

async function executeResearch(_work: AgentWorkItem, method: string, args: Record<string, unknown>): Promise<HostActionResult> {
  if (method === 'search') return { ok: true, value: await searchResearch(textArg(args, 'query'), Number(args.limit ?? 8)) }
  if (method === 'read') return { ok: true, value: await readResearch(textArg(args, 'url')) }
  throw new Error(`unsupported research action: ${method}`)
}

async function executeCanvas(
  work: AgentWorkItem,
  method: string,
  args: Record<string, unknown>,
  action: HostAction,
): Promise<HostActionResult> {
  const canvasId = textArg(args, 'canvasId', false) || work.canvasId
  const members = (): CanvasMemberInput[] => {
    if (!Array.isArray(args.members)) throw new Error('members must be an array')
    return args.members.map((raw) => {
      const member = record(raw)
      return {
        agentId: textArg(member, 'agentId'), assignment: textArg(member, 'assignment'),
        ...(Array.isArray(member.dependsOnAgentIds) ? { dependsOnAgentIds: member.dependsOnAgentIds.map(String) } : {}),
        ...(member.executionRole === 'verifier' ? { executionRole: 'verifier' as const } : {}),
        ...(typeof member.verifiesAgentId === 'string' ? { verifiesAgentId: member.verifiesAgentId } : {}),
      }
    })
  }
  if (method === 'available_agents') return { ok: true, value: await listCanvasAvailableAgents(work.companyId) }
  if (method === 'start_workspace') {
    const snapshot = await startCanvasWorkspace({
      companyId: work.companyId, initiatorAgentId: work.agentId, conversationId: work.channelId,
      triggerClientMsgNo: work.triggerClientMsgNo, title: textArg(args, 'title'), goal: textArg(args, 'goal'),
      members: members(), idempotencyKey: action.idempotencyKey,
      authorizationUserId: authorizationUserId(work),
    })
    const card: LingxiMessageV1 = {
      version: 1, kind: 'canvas', clientMsgNo: `canvas-card-${snapshot.id}`,
      body: snapshot.title, refs: { canvasId: snapshot.id, runId: action.runId, agentId: work.agentId },
      data: { canvasId: snapshot.id, title: snapshot.title, goal: snapshot.goal, status: snapshot.status,
        members: snapshot.assignments.map((item) => ({ agentId: item.agentId, assignment: item.assignment, color: item.color, status: item.status })),
        frameCount: 0, suppressAgentWake: true },
    }
    const { rows: bindings } = await pool.query<{ profile: Record<string, unknown> }>(
      `SELECT profile FROM im_channel_bindings WHERE channel_id=$1 AND company_id=$2`, [work.channelId, work.companyId],
    )
    await wukongClient().sendMessage(work.channelId, Number(bindings[0]?.profile?.channelType ?? 2), work.agentId, card)
    return { ok: true, value: snapshot, directive: { type: 'defer', reason: 'canvas', data: { canvasId: snapshot.id } } }
  }
  if (method === 'add_agents') {
    if (!canvasId) throw new Error('canvasId is required')
    return { ok: true, value: await addCanvasWorkspaceAgents({ companyId: work.companyId, canvasId, actorId: work.agentId, members: members() }) }
  }
  if (method === 'get') {
    return { ok: true, value: await getCanvasSnapshot(work.companyId, work.agentId, canvasId) }
  }
  if (method === 'submit_report') {
    if (!canvasId) throw new Error('canvasId is required for a Canvas report')
    const evidenceRefs=Array.isArray(args.evidenceRefs)?args.evidenceRefs.map(record).map((ref)=>({kind:textArg(ref,'kind') as 'frame'|'message'|'document'|'source'|'attempt'|'report',id:textArg(ref,'id')})):[]
    return { ok:true,value:await submitCanvasReport({
      companyId:work.companyId,workId:work.id,agentId:work.agentId,canvasId,executionRole:work.executionRole,
      finding:textArg(args,'finding'),evidenceRefs,confidence:Number(args.confidence),
      ...(Array.isArray(args.unresolved)?{unresolved:args.unresolved.map(String)}:{}),
      ...(typeof args.nextStep==='string'?{nextStep:args.nextStep}:{}),
      ...(typeof args.verifiesReportId==='string'?{verifiesReportId:args.verifiesReportId}:{}),
      ...(Array.isArray(args.disconfirmingChecks)?{disconfirmingChecks:args.disconfirmingChecks.map(String)}:{}),
      ...(args.verdict==='supported'||args.verdict==='rejected'||args.verdict==='inconclusive'?{verdict:args.verdict}:{}),
      ...(Array.isArray(args.consumedReportIds)?{consumedReportIds:args.consumedReportIds.map(String)}:{}),
      ...(Array.isArray(args.conflictResolution)?{conflictResolution:args.conflictResolution}:{}),
    }) }
  }
  if (method === 'handoff') {
    if (!canvasId) throw new Error('canvasId is required for a Canvas handoff')
    const frameIds = Array.isArray(args.frameIds) ? args.frameIds.map(String) : []
    return {
      ok: true,
      value: await handoffCanvasWork({
        companyId: work.companyId,
        canvasId,
        fromAgentId: work.agentId,
        toAgentId: textArg(args, 'toAgentId'),
        task: textArg(args, 'task'),
        context: textArg(args, 'context', false),
        frameIds,
        idempotencyKey: action.idempotencyKey,
      }),
    }
  }
  if (method === 'create_frame') {
    if (!canvasId) throw new Error('canvasId is required for task Canvas frames')
    return {
      ok: true,
      value: await createCanvasFrame({
        companyId: work.companyId, actorId: work.agentId, actorKind: 'agent',
        idempotencyKey: action.idempotencyKey, canvasId, frame: args,
      }),
    }
  }
  if (method === 'set_status') {
    return {
      ok: true,
      value: await setCanvasStatus({
        companyId: work.companyId, actorId: work.agentId, actorKind: 'agent',
        canvasId, status: textArg(args, 'status'), frameId: typeof args.frameId === 'string' ? args.frameId : null,
      }),
    }
  }
  const frameId = textArg(args, 'frameId')
  if (method === 'update_frame') {
    const { frameId: _frameId, ...patch } = args
    return {
      ok: true,
      value: await updateCanvasFrame({
        companyId: work.companyId, actorId: work.agentId, actorKind: 'agent', frameId, patch,
      }),
    }
  }
  if (method === 'append_content') {
    return {
      ok: true,
      value: await appendCanvasFrameContent({
        companyId: work.companyId, actorId: work.agentId, actorKind: 'agent', frameId,
        content: textArg(args, 'content'),
      }),
    }
  }
  if (method === 'delete_frame') {
    return {
      ok: true,
      value: await deleteCanvasFrame({
        companyId: work.companyId, actorId: work.agentId, actorKind: 'agent', frameId,
      }),
    }
  }
  throw new Error(`unsupported canvas action: ${method}`)
}

export function actionRequiresApproval(action: string): boolean { return APPROVAL_REQUIRED.has(action) || teacherActionRequiresApproval(action) }

export async function executeLearningAction(work: AgentWorkItem, action: HostAction): Promise<HostActionResult> {
  const args = record(action.args)
  const [namespace, method] = action.action.split('.')
  if (!namespace || !method) throw new Error('action must use namespace.method')
  if (namespace === 'teacher') return { ok: true, value: await executeTeacherAction(work, method, args) }
  const learningContext = await loadLearningTurnContext(work)
  if (learningContext?.activeMission?.status === 'PLANNING') {
    const planningAllowed = new Set([
      'learning.current', 'learning.get_learner_state', 'learning.list_knowledge_units',
      'learning.list_due', 'learning.get_mission', 'learning.get_activity',
      'learning.add_steps', 'learning.finish_planning',
      'knowledge.list_sources',
      'presentations.get',
      'chat.ask', 'polls.create', 'polls.show',
    ])
    if (!planningAllowed.has(action.action)) {
      throw new Error(
        `planning gate blocked ${action.action}: finish the current Mission board with ` +
        'learning.add_steps, then call learning.finish_planning before execution',
      )
    }
  }
  if (namespace === 'chat') return executeChat(work, method, args, action)
  if (namespace === 'routines') return executeRoutine(work, method, args, action)
  if (namespace === 'polls') return executePoll(work, method, args, action)
  if (namespace === 'research') return executeResearch(work, method, args)
  if (namespace === 'canvas') return executeCanvas(work, method, args, action)
  if (namespace === 'knowledge') return executeKnowledge(work, method, args, action)
  if (namespace === 'presentations') return executePresentation(work, method, args, action)
  if (namespace === 'learning') return executeEducation(work, method, args)
  if (namespace === 'memory') {
    const rawScope = String(args.scope ?? 'course')
    const scopeType: MemoryScopeType = rawScope === 'learner' || rawScope === 'agent_role' ? rawScope : 'course'
    const scopeId = scopeType === 'course' ? work.channelId : scopeType === 'agent_role' ? work.agentId : textArg(args, 'learnerId')
    if (scopeType === 'learner') {
      const { rows } = await pool.query(
        `SELECT 1 FROM participants p JOIN im_channel_bindings b ON b.company_id=p.company_id
          WHERE p.id=$1 AND p.company_id=$2 AND p.kind='human' AND b.channel_id=$3 AND b.profile->'members' ? p.id`,
        [scopeId, work.companyId, work.channelId],
      )
      if (!rows[0]) throw new Error('learnerId is not a human member of this learning conversation')
    }
    if (method === 'recall' || method === 'list') return { ok: true, value: await recallMemories({
      companyId: work.companyId, agentId: work.agentId, scopeType, scopeId,
      query: typeof args.query === 'string' ? args.query : '', limit: Number(args.limit ?? 12), conversationId: work.channelId,
    }) }
    if (method === 'note') return { ok: true, value: await writeExplicitMemory({
      companyId: work.companyId, agentId: work.agentId, scopeType, scopeId,
      body: textArg(args, 'body'), kind: typeof args.kind === 'string' ? args.kind : undefined,
      sourceEventId: work.triggerClientMsgNo,
    }) }
    if (method === 'verify') return { ok: true, value: {
      verified: await verifyExplicitMemory({ companyId: work.companyId, id: textArg(args, 'id') }),
    } }
    throw new Error(`unsupported memory action: ${method}`)
  }
  const projectId = new Set(['email', 'documents', 'calendar']).has(namespace)
    ? (await pool.query<{ project_id: string }>(
      `SELECT project_id FROM conversations WHERE id=$1 AND company_id=$2`,
      [work.channelId, work.companyId],
    )).rows[0]?.project_id
    : undefined
  const result = await runStructuredLearningAction(action.action, args, work.agentId, { idempotencyKey: action.idempotencyKey, ...(projectId ? { projectId } : {}) })
  if (result.ok && namespace === 'calendar' && new Set(['list', 'get', 'create', 'update']).has(method)) {
    return { ok: true, value: JSON.parse(result.text) }
  }
  return result.ok ? { ok: true, value: { text: result.text, sideEffects: result.sideEffects ?? [] } } : { ok: false, error: result.text }
}
