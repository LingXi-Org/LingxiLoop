import { createHash, randomUUID } from 'node:crypto'
import { runStructuredLearningAction } from '../agents/cli.js'
import { pool } from '../db/pool.js'
import { wukongClient } from '../im/wukong.js'
import { advanceAgentReadReceipt } from '../im/read-receipts.js'
import {
  addKnowledgeFile,
  addKnowledgeText,
  addKnowledgeUrl,
  askKnowledgeForAgent,
  createKnowledgeInsight,
  createKnowledgeNote,
  deleteKnowledgeInsight,
  deleteKnowledgeNote,
  deleteKnowledgeSourceForAgent,
  getKnowledgeNote,
  getKnowledgeSourceForAgent,
  listKnowledgeInsights,
  listKnowledgeNotes,
  listKnowledgeSourcesForAgent,
  retryKnowledgeSourceForAgent,
  searchKnowledgeForAgent,
  sendKnowledgeSourceChatMessage,
  setKnowledgeSourceEnabled,
  startKnowledgeSourceChat,
  updateKnowledgeNote,
  updateKnowledgeInsight,
  updateKnowledgeSourceForAgent,
  unlinkKnowledgeSourceForAgent,
} from '../knowledge/agent-knowledge.js'
import {
  addCanvasWorkspaceAgents,
  appendCanvasFrameContent,
  createCanvasFrame,
  deleteCanvasFrame,
  getCanvasSnapshot,
  handoffCanvasWork,
  listCanvasAvailableAgents,
  setCanvasStatus,
  submitCanvasReport,
  startCanvasWorkspace,
  updateCanvasFrame,
  type CanvasMemberInput,
} from '../modules/canvas/index.js'
import { readResearch, searchResearch } from './research.js'
import { recallMemories, verifyExplicitMemory, writeExplicitMemory } from './memory-service.js'
import type { AgentWorkItem, HostAction, HostActionResult, LingxiMessageV1, MemoryScopeType } from './types.js'
import {
  addMissionSteps,
  completeMission,
  createObjectives,
  draftActivity,
  finishMissionPlanning,
  getActivity,
  getMission,
  loadLearningTurnContext,
  proposeEvaluation,
  recordAttempt,
  startMission,
  updateMissionStep,
  executeTeacherAction,
  teacherActionRequiresApproval,
  type LearningActivityType,
  type LearningEvaluationMode,
  type LearningStepStatus,
  type LearningStepType,
} from '../modules/learning/runtime.js'

const APPROVAL_REQUIRED = new Set([
  'email.send', 'email.reply',
  'routines.create', 'routines.activate',
  'documents.delete', 'boards.delete', 'calendar.delete',
  'knowledge.update_source', 'knowledge.set_source_enabled', 'knowledge.unlink_source', 'knowledge.delete_source',
  'knowledge.update_note', 'knowledge.delete_note', 'knowledge.update_insight', 'knowledge.delete_insight',
])

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function textArg(args: Record<string, unknown>, name: string, required = true): string {
  const value = typeof args[name] === 'string' ? args[name].trim() : ''
  if (required && !value) throw new Error(`${name} is required`)
  return value
}

async function executeEducation(work: AgentWorkItem, method: string, args: Record<string, unknown>): Promise<HostActionResult> {
  const context = await loadLearningTurnContext(work)
  if (!context) throw new Error('current conversation is not bound to a learning course')
  if (method === 'current' || method === 'get_learner_state') return { ok: true, value: context }
  if (method === 'list_objectives') return { ok: true, value: context.objectives }
  if (method === 'list_due') return { ok: true, value: context.due }
  if (method === 'get_mission') {
    const missionId = textArg(args, 'missionId', false)
    if (!missionId) return { ok: true, value: context.activeMission ?? null }
    if (!context.learnerId) throw new Error('current learning room has no learner scope')
    return {
      ok: true,
      value: await getMission(missionId, work.companyId, context.course.id, context.learnerId, work.channelId),
    }
  }
  if (method === 'get_activity') return {
    ok: true,
    value: await getActivity(textArg(args, 'activityId'), work.companyId, context.course.id),
  }
  if (method === 'start_mission') return { ok: true, value: await startMission(work, {
    goal: textArg(args, 'goal'), successCriteria: textArg(args, 'successCriteria'),
    ...(typeof args.missionKind === 'string' ? { missionKind: args.missionKind as 'study'|'research'|'project' } : {}),
    ...(typeof args.sourceClientMsgNo === 'string' ? { sourceClientMsgNo: args.sourceClientMsgNo } : {}),
    ...(args.explicit === true ? { explicit: true } : {}),
  }) }
  if (method === 'add_steps') {
    const steps = Array.isArray(args.steps) ? args.steps.map((item) => record(item)).map((item) => ({
      type: textArg(item, 'type') as LearningStepType,
      description: textArg(item, 'description'), successCriteria: textArg(item, 'successCriteria'),
      ...(typeof item.objectiveId === 'string' ? { objectiveId: item.objectiveId } : {}),
    })) : []
    return { ok: true, value: await addMissionSteps(work, textArg(args, 'missionId'), steps) }
  }
  if (method === 'finish_planning') return { ok: true, value: await finishMissionPlanning(work, textArg(args, 'missionId')) }
  if (method === 'update_step') return { ok: true, value: await updateMissionStep(work, {
    missionId: textArg(args, 'missionId'), stepId: textArg(args, 'stepId'), status: textArg(args, 'status') as LearningStepStatus,
    ...(typeof args.outcome === 'string' ? { outcome: args.outcome } : {}),
    ...(typeof args.sourceReportId==='string'?{sourceReportId:args.sourceReportId}:{}),
    ...(typeof args.attemptId==='string'?{attemptId:args.attemptId}:{}),
  }) }
  if (method === 'complete_mission') return { ok: true, value: await completeMission(work, textArg(args, 'missionId')) }
  if (method === 'draft_objectives') {
    const objectives = Array.isArray(args.objectives) ? args.objectives.map((item) => record(item)).map((item) => ({
      title: textArg(item, 'title'), successCriteria: textArg(item, 'successCriteria'),
      ...(item.targetLevel !== undefined ? { targetLevel: Number(item.targetLevel) } : {}),
      ...(Array.isArray(item.prerequisiteIds) ? { prerequisiteIds: item.prerequisiteIds.map(String) } : {}),
    })) : []
    return { ok: true, value: await createObjectives({
      companyId: work.companyId,
      courseId: context.course.id,
      actorId: work.agentId,
      actorKind: 'agent',
      objectives,
    }) }
  }
  if (method === 'draft_activity') return { ok: true, value: await draftActivity({
    companyId: work.companyId, courseId: context.course.id, actorId: work.agentId, actorKind: 'agent',
    title: textArg(args, 'title'), instructions: textArg(args, 'instructions'),
    type: textArg(args, 'type') as LearningActivityType,
    ...(typeof args.evaluationMode === 'string' ? { evaluationMode: args.evaluationMode as LearningEvaluationMode } : {}),
    ...(args.targetLevel !== undefined ? { targetLevel: Number(args.targetLevel) } : {}),
    ...(Array.isArray(args.rubric) ? { rubric: args.rubric } : {}),
    ...(Array.isArray(args.objectiveIds) ? { objectiveIds: args.objectiveIds.map(String) } : {}),
    ...(typeof args.dueAt === 'string' ? { dueAt: args.dueAt } : {}),
  }) }
  if (method === 'record_attempt') return { ok: true, value: await recordAttempt(work, {
    ...(typeof args.activityId === 'string' ? { activityId: args.activityId } : {}),
    ...(typeof args.missionStepId === 'string' ? { missionStepId: args.missionStepId } : {}),
    evidenceClientMsgNos: Array.isArray(args.evidenceClientMsgNos) ? args.evidenceClientMsgNos.map(String) : [],
    documentIds: Array.isArray(args.documentIds) ? args.documentIds.map(String) : [],
    canvasFrameIds: Array.isArray(args.canvasFrameIds) ? args.canvasFrameIds.map(String) : [],
    assistance: args.assistance === 'hint' || args.assistance === 'guided' ? args.assistance : 'none',
  }) }
  if (method === 'propose_evaluation') return { ok: true, value: await proposeEvaluation(work, {
    attemptId: textArg(args, 'attemptId'), demonstratedLevel: Number(args.demonstratedLevel), confidence: Number(args.confidence),
    ...(Array.isArray(args.rubricResults) ? { rubricResults: args.rubricResults } : {}),
    ...(typeof args.feedback === 'string' ? { feedback: args.feedback } : {}),
    ...(typeof args.sourceReportId === 'string' ? { sourceReportId: args.sourceReportId } : {}),
    ...(typeof args.verifierReportId === 'string' ? { verifierReportId: args.verifierReportId } : {}),
  }) }
  throw new Error(`unsupported learning action: ${method}`)
}

async function executeKnowledge(work: AgentWorkItem, method: string, args: Record<string, unknown>): Promise<HostActionResult> {
  if (method === 'list_sources') return { ok: true, value: await listKnowledgeSourcesForAgent(work) }
  if (method === 'get_source') return { ok: true, value: await getKnowledgeSourceForAgent(work, textArg(args, 'sourceId')) }
  if (method === 'search') return { ok: true, value: await searchKnowledgeForAgent(work, textArg(args, 'query'), Math.max(1, Math.min(20, Number(args.limit ?? 8)))) }
  if (method === 'ask') return { ok: true, value: await askKnowledgeForAgent(work, textArg(args, 'question')) }
  if (method === 'add_text') return { ok: true, value: await addKnowledgeText(work, { title: textArg(args, 'title'), text: textArg(args, 'text') }) }
  if (method === 'add_url') return { ok: true, value: await addKnowledgeUrl(work, { title: textArg(args, 'title', false) || textArg(args, 'url'), url: textArg(args, 'url') }) }
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
    }) }
  }
  if (method === 'retry_ingestion') return { ok: true, value: await retryKnowledgeSourceForAgent(work, textArg(args, 'sourceId')) }
  if (method === 'update_source') return { ok: true, value: await updateKnowledgeSourceForAgent(work, textArg(args, 'sourceId'), {
    ...(typeof args.title === 'string' ? { title: args.title } : {}),
    ...(Array.isArray(args.topics) ? { topics: args.topics.map(String).slice(0, 50) } : {}),
  }) }
  if (method === 'set_source_enabled') return { ok: true, value: await setKnowledgeSourceEnabled(work, textArg(args, 'sourceId'), args.enabled === true) }
  if (method === 'unlink_source') return { ok: true, value: await unlinkKnowledgeSourceForAgent(work, textArg(args, 'sourceId')) }
  if (method === 'delete_source') return { ok: true, value: await deleteKnowledgeSourceForAgent(work, textArg(args, 'sourceId')) }
  if (method === 'list_notes') return { ok: true, value: await listKnowledgeNotes(work) }
  if (method === 'get_note') return { ok: true, value: await getKnowledgeNote(work, textArg(args, 'noteId')) }
  if (method === 'create_note') return { ok: true, value: await createKnowledgeNote(work, { title: textArg(args, 'title', false) || undefined, content: textArg(args, 'content') }) }
  if (method === 'update_note') return { ok: true, value: await updateKnowledgeNote(work, textArg(args, 'noteId'), {
    ...(typeof args.title === 'string' ? { title: args.title } : {}), ...(typeof args.content === 'string' ? { content: args.content } : {}),
  }) }
  if (method === 'delete_note') return { ok: true, value: await deleteKnowledgeNote(work, textArg(args, 'noteId')) }
  if (method === 'list_insights') return { ok: true, value: await listKnowledgeInsights(work, textArg(args, 'sourceId')) }
  if (method === 'create_insight') return { ok: true, value: await createKnowledgeInsight(work, textArg(args, 'sourceId'), textArg(args, 'transformation')) }
  if (method === 'update_insight') return { ok: true, value: await updateKnowledgeInsight(work, textArg(args, 'insightId'), {
    ...(typeof args.insightType === 'string' ? { insightType: args.insightType } : {}),
    ...(typeof args.content === 'string' ? { content: args.content } : {}),
  }) }
  if (method === 'delete_insight') return { ok: true, value: await deleteKnowledgeInsight(work, textArg(args, 'insightId')) }
  if (method === 'start_source_chat') return { ok: true, value: await startKnowledgeSourceChat(work, textArg(args, 'sourceId'), textArg(args, 'title', false) || undefined) }
  if (method === 'send_source_chat_message') return { ok: true, value: await sendKnowledgeSourceChatMessage(work, textArg(args, 'sessionId'), textArg(args, 'message')) }
  throw new Error(`unsupported knowledge action: ${method}`)
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
    return { ok: true, value: await wukongClient().sendMessage(channelId, Number(args.channelType ?? 2), work.agentId, payload) }
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
         (id, company_id, agent_id, channel_id, thread_root_client_msg_no, trigger_client_msg_no, reason, priority)
       VALUES ($1,$2,$3,$4,$5,$6,'handoff',150)
       ON CONFLICT (agent_id, trigger_client_msg_no, reason) DO NOTHING`,
      [randomUUID(), work.companyId, targetAgentId, work.channelId, payload.clientMsgNo, payload.clientMsgNo],
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
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,'paused',$3)
       ON CONFLICT (id) DO UPDATE SET updated_at=agent_routines.updated_at RETURNING *`,
      [id, work.companyId, work.agentId, work.channelId, textArg(args, 'kind'), textArg(args, 'title'),
        textArg(args, 'instructions'), JSON.stringify(record(args.schedule)), textArg(args, 'timezone', false) || 'Asia/Shanghai'],
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
    return { ok: true, value: snapshot, directive: { type: 'defer_to_canvas', canvasId: snapshot.id } }
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
  if (learningContext?.activeMission?.status === 'planning') {
    const planningAllowed = new Set([
      'learning.current', 'learning.get_learner_state', 'learning.list_objectives',
      'learning.list_due', 'learning.get_mission', 'learning.get_activity',
      'learning.add_steps', 'learning.finish_planning',
      'knowledge.list_sources', 'knowledge.get_source', 'knowledge.search',
      'knowledge.ask', 'knowledge.list_notes', 'knowledge.get_note',
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
  if (namespace === 'turn') return { ok: true, value: { status: method, ...args } }
  if (namespace === 'research') return executeResearch(work, method, args)
  if (namespace === 'canvas') return executeCanvas(work, method, args, action)
  if (namespace === 'knowledge') return executeKnowledge(work, method, args)
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
  const projectId = new Set(['email', 'documents', 'boards', 'calendar']).has(namespace)
    ? (await pool.query<{ project_id: string }>(
      `SELECT project_id FROM conversations WHERE id=$1 AND company_id=$2`,
      [work.channelId, work.companyId],
    )).rows[0]?.project_id
    : undefined
  const result = await runStructuredLearningAction(action.action, args, work.agentId, { idempotencyKey: action.idempotencyKey, ...(projectId ? { projectId } : {}) })
  return result.ok ? { ok: true, value: { text: result.text, sideEffects: result.sideEffects ?? [] } } : { ok: false, error: result.text }
}
