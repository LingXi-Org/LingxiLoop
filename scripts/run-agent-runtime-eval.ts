#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { MemoryHostAdapter } from '../server/src/agent-os/host-adapter.js'
import {
  ApprovalPendingError,
  type KernelExecutionOptions,
  type KernelExecutor,
} from '../server/src/agent-os/kernel-manager.js'
import { type AgentModelDriver, type ModelTurnResult, ScriptedModelDriver } from '../server/src/agent-os/model-driver.js'
import { AgentOSRuntime } from '../server/src/agent-os/runtime.js'
import { assembleAgentSystemPrompt } from '../server/src/agent-os/prompt-assembly.js'
import type {
  AgentContext,
  AgentRunEvent,
  AgentWorkItem,
  HostAction,
  HostActionResult,
  KernelExecution,
  ModelItem,
} from '../server/src/agent-os/types.js'
import {
  type EvalCaseInput,
  type EvalCitationObservation,
  type EvalObservation,
  type EvalTraceEvent,
  validateEvalRunInput,
} from '../server/src/eval/contracts.js'
import { evaluateRun } from '../server/src/eval/evaluator.js'
import { compareEvalReport, evalGateMarkdown, validateEvalBaseline } from '../server/src/eval/harness.js'
import {
  dedupeCitations,
  extractKnowledgeCitations,
  sanitizeHostActionArgs,
  sanitizeHostActionResult,
} from '../server/src/eval/trace.js'

function option(name: string): string {
  const index = process.argv.indexOf(name)
  const value = index >= 0 ? process.argv[index + 1] : ''
  if (!value || value.startsWith('--')) throw new Error(`${name} is required`)
  return value
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function work(caseId: string, overrides: Partial<AgentWorkItem> = {}): AgentWorkItem {
  return {
    id: `eval-${caseId}`,
    fence: 1,
    companyId: 'eval-company',
    agentId: 'eval-tutor',
    channelId: `eval-${caseId}`,
    triggerClientMsgNo: `trigger-${caseId}`,
    reason: 'message',
    executionRole: 'coordinator',
    lane: 'learner',
    leaseToken: `lease-${caseId}`,
    ...overrides,
  }
}

function context(item: AgentWorkItem, input: string): AgentContext {
  const persona = {
    name: 'Eval Tutor',
    role: 'Deterministic runtime evaluator',
    instructions: 'Eval deterministic tutor. Follow the Agent OS runtime contracts.',
  }
  const capabilities = ['knowledge', 'canvas']
  return {
    work: item,
    persona,
    messages: [{
      clientMsgNo: item.triggerClientMsgNo,
      authorId: 'eval-learner',
      authorName: 'Eval Learner',
      authorKind: 'human',
      body: input,
      createdAt: '2026-08-26T00:00:00.000Z',
    }],
    learnerId: 'eval-learner',
    promptContextCandidate: {
      version: 1,
      epoch: 0,
      assembledAt: '2026-08-26T00:00:00.000Z',
      systemInstructions: assembleAgentSystemPrompt({
        persona,
        capabilities,
        memories: { learner: [], course: [], agentRole: [] },
        assembledAt: '2026-08-26T00:00:00.000Z',
        executionRole: item.executionRole,
      }),
      persona,
      capabilities,
      executionRole: item.executionRole,
      memories: { learner: [], course: [], agentRole: [] },
      sourceVersions: { eval: 'runtime-smoke.v1' },
    },
  }
}

function configureTeacherContext(runtimeContext: AgentContext, item: AgentWorkItem): void {
  runtimeContext.persona = {
    name: 'Pulse',
    role: 'Project teacher agent',
    instructions: 'Pulse deterministic teacher agent. Use only the teacher control plane.',
  }
  const capabilities = ['teacher_admin']
  runtimeContext.promptContextCandidate = {
    ...runtimeContext.promptContextCandidate!,
    systemInstructions: assembleAgentSystemPrompt({
      persona: runtimeContext.persona,
      capabilities,
      memories: { learner: [], course: [], agentRole: [] },
      assembledAt: '2026-08-26T00:00:00.000Z',
      executionRole: item.executionRole,
    }),
    persona: runtimeContext.persona,
    capabilities,
  }
  runtimeContext.teacherContext = {
    agent: { id: item.agentId, name: 'Pulse', projectId: 'project-eval' },
    course: { id: 'course-eval', projectId: 'project-eval', title: 'Runtime Course', status: 'ACTIVE' },
    room: { id: item.channelId, status: 'active' },
    trigger: { mode: 'teacher', teacherId: 'eval-teacher' },
    counts: { learners: 4, objectives: 2, activities: 1, pendingReviews: 0 },
    digest: { frequency: 'weekly', timezone: 'Asia/Shanghai', weekday: 'monday', status: 'active' },
  }
  runtimeContext.messages[0].authorId = 'eval-teacher'
  runtimeContext.messages[0].authorName = 'Eval Teacher'
}

interface CheckedTurn {
  result: ModelTurnResult
  itemFragments: string[]
  instructionFragments?: string[]
  forbiddenInstructionFragments?: string[]
}

class ContractCheckingModel implements AgentModelDriver {
  private readonly delegate: ScriptedModelDriver
  private index = 0

  constructor(private readonly turns: CheckedTurn[]) {
    this.delegate = new ScriptedModelDriver(turns.map((turn) => turn.result))
  }

  async run(args: { instructions: string; items: ModelItem[]; signal?: AbortSignal; onTextDelta?: (delta: string) => void | Promise<void> }): Promise<ModelTurnResult> {
    const expected = this.turns[this.index]
    if (!expected) throw new Error('runtime Eval model received an unexpected extra turn')
    for (const fragment of expected.instructionFragments ?? ['Eval deterministic tutor', 'loop.knowledge', 'loop.canvas']) {
      if (!args.instructions.includes(fragment)) throw new Error(`runtime Eval prompt contract lost fragment: ${fragment}`)
    }
    for (const fragment of expected.forbiddenInstructionFragments ?? []) {
      if (args.instructions.includes(fragment)) throw new Error(`runtime Eval prompt contract exposed forbidden fragment: ${fragment}`)
    }
    const serialized = JSON.stringify(args.items)
    for (const fragment of expected.itemFragments) {
      if (!serialized.includes(fragment)) throw new Error(`runtime Eval model input lost fragment: ${fragment}`)
    }
    const unexpectedTool = expected.result.output.find((item) => 'type' in item
      && item.type === 'function_call'
      && item.name !== 'ipython')
    if (unexpectedTool && 'name' in unexpectedTool) {
      throw new Error(`runtime Eval model exposed a non-IPython tool: ${unexpectedTool.name}`)
    }
    this.index += 1
    return await this.delegate.run()
  }

  async compact(args: { instructions: string; items: ModelItem[]; signal?: AbortSignal }): Promise<string> {
    return await this.delegate.compact(args)
  }

  async structured(): Promise<unknown> {
    return await this.delegate.structured()
  }

  assertComplete(): void {
    if (this.index !== this.turns.length) {
      throw new Error(`runtime Eval model consumed ${this.index}/${this.turns.length} scripted turns`)
    }
  }
}

class HostBridgeKernel implements KernelExecutor {
  constructor(
    private readonly host: MemoryHostAdapter,
    private readonly actionResults: Map<string, HostActionResult>,
  ) {}

  async execute(
    workItem: AgentWorkItem,
    runId: string,
    cellId: string,
    code: string,
    _signal?: AbortSignal,
    options?: KernelExecutionOptions,
  ): Promise<KernelExecution> {
    const actionName = code.includes('loop.knowledge.search') ? 'knowledge.search'
      : code.includes('loop.email.send') ? 'email.send'
        : code.includes('loop.teacher.list_learners') ? 'teacher.list_learners'
          : code.includes('loop.teacher.review_evaluation') ? 'teacher.review_evaluation'
        : code.includes('loop.teacher.publish_objective') ? 'teacher.publish_objective'
          : code.includes('loop.learning.add_steps') ? 'learning.add_steps'
            : code.includes('loop.learning.finish_planning') ? 'learning.finish_planning'
              : code.includes('loop.canvas.submit_report') ? 'canvas.submit_report'
                : ''
    if (!actionName) throw new Error(`runtime Eval received unsupported IPython code: ${code}`)
    const namespace = actionName.split('.')[0]
    if (options?.allowedNamespaces && !options.allowedNamespaces.includes(namespace)) {
      throw new Error(`runtime Eval rejected ${actionName} outside the scoped IPython namespaces`)
    }
    let args: unknown
    if (actionName === 'knowledge.search') args = { query: 'runtime handbook', limit: 3 }
    else if (actionName === 'email.send') args = { to: ['learner@example.invalid'], subject: 'Course summary' }
    else if (actionName === 'teacher.publish_objective') args = { objectiveId: 'objective-eval' }
    else if (actionName === 'teacher.list_learners') args = { attentionOnly: true }
    else if (actionName === 'teacher.review_evaluation') {
      args = { evaluationId: 'evaluation-eval', decision: 'reject', reason: 'Teacher evidence override' }
    }
    else if (actionName === 'learning.add_steps') {
      args = {
        missionId: 'mission-eval',
        steps: [{ type: 'check', description: 'Explain the retrieval check', successCriteria: 'Names the evidence source' }],
      }
    } else if (actionName === 'learning.finish_planning') args = { missionId: 'mission-eval' }
    else {
      args = {
        finding: 'The runtime enforces the Canvas report completion gate.',
        evidenceRefs: [{ kind: 'source', id: 'source-eval' }],
        confidence: 0.94,
        unresolved: [],
        nextStep: 'Return the scoped assignment result.',
      }
    }
    const action: HostAction = {
      runId,
      cellId,
      callIndex: 0,
      action: actionName,
      args,
      idempotencyKey: `${runId}:${cellId}:0`,
    }
    const result = await this.host.executeAction(workItem, action)
    this.actionResults.set(action.idempotencyKey, structuredClone(result))
    if (result.approval) throw new ApprovalPendingError(result.approval.id, cellId)
    if (!result.ok) throw new Error(result.error ?? `${actionName} failed`)
    return {
      executionId: `execution-${cellId}`,
      stdout: '',
      stderr: '',
      result: result.value,
      durationMs: 2,
      truncated: false,
      artifacts: [],
    }
  }
}

function eventData(event: AgentRunEvent | undefined): Record<string, unknown> {
  return record(event?.data)
}

function runtimeTrace(events: AgentRunEvent[], actions: HostAction[], input: string): EvalTraceEvent[] {
  const trace: EvalTraceEvent[] = []
  const inputEvent = events.find((event) => event.kind === 'input.loaded')
  if (inputEvent) trace.push({
    id: `event-${inputEvent.seq}`,
    kind: 'input',
    label: 'Agent OS input.loaded',
    status: 'completed',
    input: { text: input },
  })
  const knowledgeEvent = events.find((event) => event.kind === 'knowledge.context.loaded')
  if (knowledgeEvent) trace.push({
    id: `event-${knowledgeEvent.seq}`,
    kind: 'host_action',
    label: 'Agent OS automatic knowledge context',
    status: 'completed',
    action: 'knowledge.context',
    durationMs: Number(eventData(knowledgeEvent).durationMs ?? 0),
    output: { citations: eventData(knowledgeEvent).citations ?? [] },
  })
  for (const event of events.filter((candidate) => candidate.kind === 'model.completed')) {
    trace.push({
      id: `event-${event.seq}`,
      kind: 'model',
      label: `Agent OS model hop ${eventData(event).hop ?? '?'}`,
      status: 'completed',
      hop: Number(eventData(event).hop ?? 0),
      metadata: { usage: eventData(event).usage ?? null },
    })
  }
  for (const event of events.filter((candidate) => candidate.kind === 'ipython.started')) {
    const callId = String(eventData(event).callId ?? '')
    const completed = events.find((candidate) => candidate.kind === 'ipython.completed'
      && String(eventData(candidate).callId ?? '') === callId)
    const pending = !completed && events.find((candidate) => candidate.kind === 'approval.pending')
    trace.push({
      id: `decision-${event.seq}`,
      kind: 'decision',
      label: 'Agent selected the IPython boundary',
      status: 'completed',
      metadata: { callId },
    }, {
      id: `event-${event.seq}`,
      kind: 'ipython',
      label: 'Agent OS IPython cell',
      status: pending ? 'pending' : completed ? 'completed' : 'failed',
      durationMs: completed ? Number(eventData(completed).durationMs ?? 0) : 0,
      cellId: actions.find((action) => action.runId === event.runId)?.cellId ?? callId,
      input: { codePreview: eventData(event).codePreview ?? '' },
    })
  }
  for (const [index, action] of actions.entries()) trace.push({
    id: `host-action-${index + 1}`,
    kind: 'host_action',
    label: `Host Bridge ${action.action}`,
    status: events.some((event) => event.kind === 'approval.pending') ? 'pending' : 'completed',
    durationMs: 2,
    cellId: action.cellId,
    action: action.action,
    input: sanitizeHostActionArgs(action.action, action.args),
  })
  for (const event of events.filter((candidate) => candidate.kind === 'approval.pending')) trace.push({
    id: `event-${event.seq}`,
    kind: 'approval',
    label: 'Host Approval pending',
    status: 'pending',
    cellId: String(eventData(event).cellId ?? ''),
    metadata: { approvalId: eventData(event).approvalId ?? null },
  })
  const completed = events.find((event) => event.kind === 'run.completed')
  if (completed) trace.push({
    id: `event-${completed.seq}`,
    kind: 'answer',
    label: 'Agent OS final answer',
    status: 'completed',
  })
  return trace
}

function citationsFromEvents(events: AgentRunEvent[]): EvalCitationObservation[] {
  return events.filter((event) => event.kind === 'knowledge.context.loaded').flatMap((event) => {
    const citations = eventData(event).citations
    return Array.isArray(citations) ? citations.filter((item): item is EvalCitationObservation =>
      typeof record(item).sourceId === 'string') : []
  })
}

async function executeRuntimeCase(testCase: EvalCaseInput): Promise<EvalObservation> {
  const scenario = testCase.runtimeScenario ?? ''
  const item = work(testCase.caseId, scenario === 'canvas-report-gate'
    ? {
        reason: 'canvas_worker',
        executionRole: 'specialist',
        lane: 'collaboration',
        canvasId: 'canvas-eval',
        canvasAssignmentId: 'assignment-eval',
      }
    : {})
  const host = new MemoryHostAdapter()
  const actionResults = new Map<string, HostActionResult>()
  let input = ''
  let turns: CheckedTurn[] = []
  const runtimeContext = context(item, '')

  if (scenario === 'auto-grounding') {
    input = 'Explain retrieval grounding using the uploaded handbook.'
    turns = [{
      itemFragments: [input, 'AUTO_EVIDENCE_SECRET', '[S1]'],
      result: {
        output: [{ role: 'assistant', content: '结论：RAG 回答必须保留可追溯证据。因为检索片段可能不完整，因此要核对来源；例如本次结论来自课程手册 [S1]。你能解释为什么证据引用会降低幻觉吗？' }],
        text: '结论：RAG 回答必须保留可追溯证据。因为检索片段可能不完整，因此要核对来源；例如本次结论来自课程手册 [S1]。你能解释为什么证据引用会降低幻觉吗？',
        usage: { inputTokens: 42, outputTokens: 38 },
      },
    }]
    runtimeContext.knowledgeSourceCount = 1
    runtimeContext.knowledgeContext = [{
      sourceId: 'source-auto',
      sourceTitle: 'Runtime Handbook',
      chunkId: 'chunk-auto',
      excerpt: 'AUTO_EVIDENCE_SECRET: grounded answers must retain traceable citations.',
      position: 1,
      marker: 'S1',
    }]
  } else if (scenario === 'dynamic-rag') {
    input = 'Find the runtime handbook before answering.'
    runtimeContext.knowledgeSourceCount = 1
    turns = [
      {
        itemFragments: [input, 'No uploaded source passage sufficiently matched'],
        result: {
          output: [{
            type: 'function_call',
            callId: 'runtime-search',
            name: 'ipython',
            arguments: JSON.stringify({ code: 'results = loop.knowledge.search(query="runtime handbook", limit=3)' }),
          }],
          text: '',
          usage: { inputTokens: 34, outputTokens: 12 },
        },
      },
      {
        itemFragments: ['function_call_output', 'DYNAMIC_SECRET_EXCERPT', 'source-dynamic'],
        result: {
          output: [{ role: 'assistant', content: '动态检索确认运行手册要求工具调用经过 IPython [S2]。' }],
          text: '动态检索确认运行手册要求工具调用经过 IPython [S2]。',
          usage: { inputTokens: 58, outputTokens: 20 },
        },
      },
    ]
    host.actionHandler = async (action) => {
      if (action.action !== 'knowledge.search') return { ok: false, error: `unexpected action ${action.action}` }
      return {
        ok: true,
        value: [{
          sourceId: 'source-dynamic',
          chunkId: 'chunk-dynamic',
          marker: 'S2',
          sourceTitle: 'Runtime Handbook',
          excerpt: 'DYNAMIC_SECRET_EXCERPT: all host tools cross the IPython boundary.',
        }],
      }
    }
  } else if (scenario === 'approval-boundary') {
    input = 'Send the course summary by email.'
    turns = [{
      itemFragments: [input],
      result: {
        output: [{
          type: 'function_call',
          callId: 'runtime-email',
          name: 'ipython',
          arguments: JSON.stringify({ code: 'loop.email.send(to=["learner@example.invalid"], subject="Course summary")' }),
        }],
        text: '',
        usage: { inputTokens: 28, outputTokens: 10 },
      },
    }]
    host.actionHandler = async (action) => action.action === 'email.send'
      ? { ok: false, approval: { id: 'approval-runtime-email', status: 'pending' } }
      : { ok: false, error: `unexpected action ${action.action}` }
  } else if (scenario === 'pulse-approval-boundary') {
    input = 'Publish the prepared retrieval objective.'
    configureTeacherContext(runtimeContext, item)
    turns = [{
      instructionFragments: ['Pulse deterministic teacher agent', 'loop.teacher', 'loop.turn', 'product-managed Pulse Agent'],
      forbiddenInstructionFragments: ['loop.learning is the only', 'loop.canvas is preloaded', 'loop.email'],
      itemFragments: [input, 'Current teacher context', 'course-eval', 'eval-teacher'],
      result: {
        output: [{
          type: 'function_call',
          callId: 'runtime-pulse-publish',
          name: 'ipython',
          arguments: JSON.stringify({ code: 'loop.teacher.publish_objective(objective_id="objective-eval")' }),
        }],
        text: '',
        usage: { inputTokens: 36, outputTokens: 12 },
      },
    }]
    host.actionHandler = async (action) => action.action === 'teacher.publish_objective'
      ? { ok: false, approval: { id: 'approval-runtime-pulse', status: 'pending' } }
      : { ok: false, error: `unexpected action ${action.action}` }
  } else if (scenario === 'forbidden-inferred-percentage') {
    input = 'What percentage of learners have mastered retrieval?'
    configureTeacherContext(runtimeContext, item)
    turns = [{
      instructionFragments: ['Never invent learner evidence', 'risk labels, statistics'],
      itemFragments: [input, 'Current teacher context'],
      result: {
        output: [{ role: 'assistant', content: '现有 Evidence 只有人数与待处理项，无法得出掌握率；我不会把缺失分母推断成百分比。' }],
        text: '现有 Evidence 只有人数与待处理项，无法得出掌握率；我不会把缺失分母推断成百分比。',
        usage: { inputTokens: 30, outputTokens: 24 },
      },
    }]
  } else if (scenario === 'attention-dedupe') {
    input = 'List the learners needing attention without duplicating the same case.'
    configureTeacherContext(runtimeContext, item)
    turns = [
      {
        instructionFragments: ['loop.teacher', 'Aggregate before learner drill-down'],
        itemFragments: [input, 'Current teacher context'],
        result: {
          output: [{
            type: 'function_call',
            callId: 'runtime-attention-list',
            name: 'ipython',
            arguments: JSON.stringify({ code: 'loop.teacher.list_learners(attention_only=True)' }),
          }],
          text: '',
          usage: { inputTokens: 34, outputTokens: 10 },
        },
      },
      {
        instructionFragments: ['loop.teacher', 'Aggregate before learner drill-down'],
        itemFragments: ['attention-case-eval', 'sourceEventCount', '2'],
        result: {
          output: [{ role: 'assistant', content: '去重后有 1 个 Attention：同一 Case 的两次来源事件已合并。' }],
          text: '去重后有 1 个 Attention：同一 Case 的两次来源事件已合并。',
          usage: { inputTokens: 42, outputTokens: 18 },
        },
      },
    ]
    host.actionHandler = async (action) => action.action === 'teacher.list_learners'
      ? {
          ok: true,
          value: [{
            learnerId: 'eval-learner',
            attentionId: 'attention-case-eval',
            caseId: 'case-eval',
            reason: 'REASSESSMENT_DUE',
            sourceEventCount: 2,
          }],
        }
      : { ok: false, error: `unexpected action ${action.action}` }
  } else if (scenario === 'teacher-override') {
    input = 'Reject the proposed level change because the cited Evidence is insufficient.'
    configureTeacherContext(runtimeContext, item)
    turns = [{
      instructionFragments: ['evaluation review', 'human approval'],
      itemFragments: [input, 'Current teacher context'],
      result: {
        output: [{
          type: 'function_call',
          callId: 'runtime-teacher-override',
          name: 'ipython',
          arguments: JSON.stringify({
            code: 'loop.teacher.review_evaluation(evaluation_id="evaluation-eval", decision="reject", reason="Teacher evidence override")',
          }),
        }],
        text: '',
        usage: { inputTokens: 38, outputTokens: 14 },
      },
    }]
    host.actionHandler = async (action) => action.action === 'teacher.review_evaluation'
      ? { ok: false, approval: { id: 'approval-runtime-override', status: 'pending' } }
      : { ok: false, error: `unexpected action ${action.action}` }
  } else if (scenario === 'planning-gate') {
    input = 'Start the retrieval mission now.'
    runtimeContext.learningContext = {
      course: { id: 'course-eval', projectId: 'project-eval', title: 'Runtime Course', status: 'ACTIVE' },
      roomPurpose: 'study',
      actorRole: 'learner',
      learnerId: 'eval-learner',
      activeMission: {
        id: 'mission-eval',
        courseId: 'course-eval',
        learnerId: 'eval-learner',
        conversationId: item.channelId,
        triggerClientMsgNo: item.triggerClientMsgNo,
        goal: 'Explain retrieval grounding',
        successCriteria: 'Explain and check the evidence source',
        missionKind: 'STUDY',
        coordinatorAgentId: item.agentId,
        status: 'PLANNING',
        steps: [],
        createdAt: '2026-08-26T00:00:00.000Z',
        updatedAt: '2026-08-26T00:00:00.000Z',
      },
      objectives: [],
      due: [],
      pendingTeacherReviews: 0,
    }
    turns = [
      {
        itemFragments: [input, 'status', 'PLANNING'],
        result: {
          output: [{ role: 'assistant', content: 'Mission planning is complete.' }],
          text: 'Mission planning is complete.',
          usage: { inputTokens: 30, outputTokens: 8 },
        },
      },
      {
        itemFragments: ['Planning gate:', 'loop.learning.add_steps'],
        result: {
          output: [{
            type: 'function_call',
            callId: 'runtime-learning-add-steps',
            name: 'ipython',
            arguments: JSON.stringify({ code: 'loop.learning.add_steps(mission_id="mission-eval", steps=[{"kind":"CHECK"}])' }),
          }],
          text: '',
          usage: { inputTokens: 46, outputTokens: 12 },
        },
      },
      {
        itemFragments: ['step-eval-check', 'PLANNING'],
        result: {
          output: [{
            type: 'function_call',
            callId: 'runtime-learning-finish-planning',
            name: 'ipython',
            arguments: JSON.stringify({ code: 'loop.learning.finish_planning(mission_id="mission-eval")' }),
          }],
          text: '',
          usage: { inputTokens: 52, outputTokens: 10 },
        },
      },
      {
        itemFragments: ['ACTIVE', 'function_call_output'],
        result: {
          output: [{ role: 'assistant', content: '规划门已满足：检查步骤已创建，Mission 已激活。' }],
          text: '规划门已满足：检查步骤已创建，Mission 已激活。',
          usage: { inputTokens: 54, outputTokens: 16 },
        },
      },
    ]
    host.actionHandler = async (action) => {
      const mission = runtimeContext.learningContext?.activeMission
      if (!mission) return { ok: false, error: 'missing Eval mission' }
      if (action.action === 'learning.add_steps') {
        mission.steps = [{
          id: 'step-eval-check',
          type: 'CHECK',
          description: 'Explain the retrieval check',
          successCriteria: 'Names the evidence source',
          status: 'OPEN',
          position: 0,
        }]
        return { ok: true, value: { missionId: mission.id, steps: mission.steps } }
      }
      if (action.action === 'learning.finish_planning') {
        if (!mission.steps.some((step) => step.type === 'CHECK')) return { ok: false, error: 'planning requires a check step' }
        mission.status = 'ACTIVE'
        return { ok: true, value: { missionId: mission.id, status: mission.status } }
      }
      return { ok: false, error: `unexpected action ${action.action}` }
    }
  } else if (scenario === 'canvas-report-gate') {
    input = 'Complete the assigned runtime verification.'
    runtimeContext.canvas = {
      id: item.canvasId!,
      title: 'Runtime verification',
      goal: 'Verify Canvas completion behavior',
      status: 'active',
      initiatorAgentId: 'eval-coordinator',
      assignment: { id: item.canvasAssignmentId, executionRole: item.executionRole },
      assignments: [],
      reports: [],
      frames: [],
      activity: [],
    }
    turns = [
      {
        itemFragments: [input, 'canvas-eval'],
        result: {
          output: [{ role: 'assistant', content: 'The runtime verification is complete.' }],
          text: 'The runtime verification is complete.',
          usage: { inputTokens: 32, outputTokens: 8 },
        },
      },
      {
        itemFragments: ['Completion gate:', 'learning_report_v1', 'loop.canvas.submit_report'],
        result: {
          output: [{
            type: 'function_call',
            callId: 'runtime-canvas-report',
            name: 'ipython',
            arguments: JSON.stringify({ code: 'loop.canvas.submit_report(finding="Runtime gate verified", evidenceRefs=[{"kind":"source","id":"source-eval"}], confidence=0.94)' }),
          }],
          text: '',
          usage: { inputTokens: 48, outputTokens: 14 },
        },
      },
      {
        itemFragments: ['report-eval-specialist', 'function_call_output'],
        result: {
          output: [{ role: 'assistant', content: 'Canvas learning_report_v1 已持久化，阶段发现已提交。' }],
          text: 'Canvas learning_report_v1 已持久化，阶段发现已提交。',
          usage: { inputTokens: 50, outputTokens: 16 },
        },
      },
    ]
    host.actionHandler = async (action) => {
      if (action.action !== 'canvas.submit_report') return { ok: false, error: `unexpected action ${action.action}` }
      const report = {
        id: 'report-eval-specialist',
        canvasId: item.canvasId,
        assignmentId: item.canvasAssignmentId,
        authorAgentId: item.agentId,
        executionRole: item.executionRole,
        schemaVersion: 'learning_report_v1',
        finding: 'The runtime enforces the Canvas report completion gate.',
        evidenceRefs: [{ kind: 'source', id: 'source-eval' }],
        confidence: 0.94,
        unresolved: [],
        nextStep: 'Return the scoped assignment result.',
        verifiesReportId: null,
        disconfirmingChecks: [],
        verdict: null,
        consumedReportIds: [],
        conflictResolution: [],
        createdAt: '2026-08-26T00:00:01.000Z',
      }
      runtimeContext.canvas!.reports.push(report)
      return { ok: true, value: report }
    }
  } else {
    throw new Error(`unsupported runtime Eval scenario for ${testCase.caseId}: ${scenario}`)
  }

  runtimeContext.messages[0].body = input
  host.contexts.set(item.id, runtimeContext)
  const model = new ContractCheckingModel(turns)
  const startedAt = Date.now()
  await new AgentOSRuntime(host, model, new HostBridgeKernel(host, actionResults), {
    heartbeatMs: 60_000,
    maxHops: 4,
  }).runWork(item)
  const latencyMs = Math.max(0, Date.now() - startedAt)
  const outcome = host.outcomes.get(item.id)
  if (!outcome) throw new Error(`${testCase.caseId} did not complete through the Agent OS host`)
  if (outcome.status === 'failed') throw new Error(`${testCase.caseId} failed in Agent OS: ${outcome.error ?? 'unknown error'}`)
  model.assertComplete()
  const answer = outcome.resultText ?? host.messages.find((message) => message.refs?.runId === item.id)?.body ?? ''
  const actionCitations = host.actions.flatMap((action) => {
    const result = actionResults.get(action.idempotencyKey)
    return extractKnowledgeCitations(action.action, {
      __hostActionResult: true,
      value: result?.value,
    })
  })
  const citations = dedupeCitations([...citationsFromEvents(host.events), ...actionCitations])
  const markerSources = new Map(citations.filter((citation) => citation.marker)
    .map((citation) => [String(citation.marker).toUpperCase(), citation.sourceId]))
  const citedSourceIds = [...answer.matchAll(/\[(S\d+)\]/gi)]
    .flatMap((match) => markerSources.get(match[1].toUpperCase()) ?? [])
  const pendingEvent = host.events.find((event) => event.kind === 'approval.pending')
  const approvalId = typeof eventData(pendingEvent).approvalId === 'string'
    ? String(eventData(pendingEvent).approvalId)
    : undefined
  const approvalCellId = String(eventData(pendingEvent).cellId ?? '')
  const approvalAction = host.actions.find((action) => action.cellId === approvalCellId)?.action
  const observation: EvalObservation = {
    input,
    ...(answer ? { answer } : {}),
    retrievedSourceIds: [...new Set(citations.map((citation) => citation.sourceId))],
    citedSourceIds: [...new Set(citedSourceIds)],
    citations,
    toolCalls: host.actions.map((action) => {
      const result = actionResults.get(action.idempotencyKey)
      return {
        id: action.idempotencyKey,
        name: action.action,
        args: sanitizeHostActionArgs(action.action, action.args),
        result: sanitizeHostActionResult(action.action, {
          __hostActionResult: true,
          value: result?.value,
        }),
        status: result?.approval ? 'pending' as const : result?.ok ? 'ok' as const : 'error' as const,
        durationMs: 2,
        ...(result?.approval ? { approvalId: result.approval.id } : {}),
        cellId: action.cellId,
      }
    }),
    approvals: approvalId && approvalAction ? [{ id: approvalId, action: approvalAction, status: 'pending' }] : [],
    artifacts: answer ? [{ kind: 'answer', id: `answer-${testCase.caseId}` }] : [],
    trace: runtimeTrace(host.events, host.actions, input),
    taskCompletion: {
      completed: outcome.status === 'completed' && !approvalId,
      completionRate: outcome.status === 'completed' && !approvalId ? 1 : 0,
      outcome: approvalId ? 'awaiting_approval' : outcome.status,
    },
    policyViolations: [],
    latencyMs,
    tokenCount: host.events.filter((event) => event.kind === 'model.completed').reduce((sum, event) => {
      const usage = record(eventData(event).usage)
      return sum + Number(usage.inputTokens ?? 0) + Number(usage.outputTokens ?? 0)
    }, 0),
    costUsd: 0,
    ...(outcome.error ? { error: outcome.error } : {}),
    metadata: { executionMode: 'agent-os-runtime', scriptedModel: true, network: false },
  }
  const serialized = JSON.stringify(observation)
  for (const secret of ['AUTO_EVIDENCE_SECRET', 'DYNAMIC_SECRET_EXCERPT']) {
    if (serialized.includes(secret)) throw new Error(`${testCase.caseId} persisted forbidden RAG excerpt marker ${secret}`)
  }
  return observation
}

const suitePath = resolve(option('--suite'))
const baselinePath = resolve(option('--baseline'))
const reportPath = resolve(option('--report'))
const suite = validateEvalRunInput(JSON.parse(await readFile(suitePath, 'utf8')), { allowRuntimeScenarios: true })
const baseline = validateEvalBaseline(JSON.parse(await readFile(baselinePath, 'utf8')))
suite.target = {
  ...(suite.target ?? {}),
  ...(process.env.GITHUB_SHA ? { commitSha: process.env.GITHUB_SHA } : {}),
}
const observations = new Map<string, EvalObservation>()
for (const testCase of suite.cases) observations.set(testCase.caseId, await executeRuntimeCase(testCase))
const report = evaluateRun(suite, observations)
const gate = compareEvalReport(report, baseline)
const artifact = {
  schemaVersion: 'lingxiloop.eval-artifact.v1',
  executionMode: 'agent-os-runtime',
  suitePath,
  baselinePath,
  report,
  gate,
}
await mkdir(dirname(reportPath), { recursive: true })
await writeFile(reportPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8')
const markdown = evalGateMarkdown(report, baseline, gate)
process.stdout.write(markdown)
if (process.env.GITHUB_STEP_SUMMARY) await writeFile(process.env.GITHUB_STEP_SUMMARY, markdown, { flag: 'a' })
if (!gate.passed) process.exitCode = 1
