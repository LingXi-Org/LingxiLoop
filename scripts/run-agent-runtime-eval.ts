#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import {
  AgentRuntime,
  ApprovalPendingError,
  type KernelExecutionOptions,
  type KernelExecutor,
  type HostPort,
} from '../third_party/lingxios/src/index.js'
import type {
  AssistantMessage,
  HeartbeatResult,
  KernelExecution,
  ModelItem,
  RunEvent,
  SessionRecord,
  TurnContext,
  WorkCompletion,
  WorkItem,
} from '../third_party/lingxios/src/protocol/types.js'
import { type AgentModelDriver, type ModelTurnResult, ScriptedModelDriver } from '../server/src/agent-os/model-driver.js'
import { assembleAgentSystemPrompt } from '../server/src/agent-os/prompt-assembly.js'
import { LingxiLoopRuntimePolicy } from '../server/src/agent-os/runtime.js'
import { toLingxiOSWork } from '../server/src/agent-os/protocol-adapter.js'
import type {
  AgentContext,
  AgentWorkItem,
  HostAction,
  HostActionResult,
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
    capabilities,
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
      version: 2,
      epoch: 0,
      assembledAt: '2026-08-26T00:00:00.000Z',
      systemInstructions: assembleAgentSystemPrompt({
        persona,
        capabilities,
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
  runtimeContext.capabilities = capabilities
  runtimeContext.promptContextCandidate = {
    ...runtimeContext.promptContextCandidate!,
    systemInstructions: assembleAgentSystemPrompt({
      persona: runtimeContext.persona,
      capabilities,
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
  forbiddenItemFragments?: string[]
}

class ContractCheckingModel implements AgentModelDriver {
  private readonly delegate: ScriptedModelDriver
  private index = 0

  constructor(private readonly turns: CheckedTurn[]) {
    this.delegate = new ScriptedModelDriver(turns.map((turn) => turn.result))
  }

  async run(args: Parameters<AgentModelDriver['run']>[0]): Promise<ModelTurnResult> {
    const expected = this.turns[this.index]
    if (!expected) throw new Error('runtime Eval model received an unexpected extra turn')
    for (const fragment of expected.instructionFragments ?? ['Eval deterministic tutor', 'host.knowledge', 'host.canvas']) {
      if (!args.instructions.includes(fragment)) throw new Error(`runtime Eval prompt contract lost fragment: ${fragment}`)
    }
    for (const fragment of expected.forbiddenInstructionFragments ?? []) {
      if (args.instructions.includes(fragment)) throw new Error(`runtime Eval prompt contract exposed forbidden fragment: ${fragment}`)
    }
    const serialized = JSON.stringify(args.items)
    for (const fragment of expected.itemFragments) {
      if (!serialized.includes(fragment)) throw new Error(`runtime Eval model input lost fragment: ${fragment}`)
    }
    for (const fragment of expected.forbiddenItemFragments ?? []) {
      if (serialized.includes(fragment)) throw new Error(`runtime Eval model input exposed forbidden fragment: ${fragment}`)
    }
    const unexpectedTool = expected.result.output.find((item) => 'type' in item
      && item.type === 'function_call'
      && item.name !== 'ipython')
    if (unexpectedTool && 'name' in unexpectedTool) {
      throw new Error(`runtime Eval model exposed a non-IPython tool: ${unexpectedTool.name}`)
    }
    this.index += 1
    return await this.delegate.run(args)
  }

  async compact(args: { instructions: string; items: readonly ModelItem[]; signal?: AbortSignal }) {
    return await this.delegate.compact(args)
  }

  async structured() {
    return await this.delegate.structured()
  }

  assertComplete(): void {
    if (this.index !== this.turns.length) {
      throw new Error(`runtime Eval model consumed ${this.index}/${this.turns.length} scripted turns`)
    }
  }
}

function coreContext(value: AgentContext): TurnContext {
  const coreWork = toLingxiOSWork(value.work)
  return {
    work: coreWork,
    persona: value.persona,
    capabilities: value.capabilities ?? [],
    messages: value.messages.map((message) => ({
      ref: message.clientMsgNo,
      authorId: message.authorId,
      authorName: message.authorName,
      authorKind: message.authorKind,
      body: message.body,
      createdAt: message.createdAt,
      ...(message.replyToClientMsgNo ? { replyToRef: message.replyToClientMsgNo } : {}),
    })),
    ...(value.promptContextCandidate ? { promptContextCandidate: value.promptContextCandidate } : {}),
    ...(value.pendingApproval ? { pendingApproval: value.pendingApproval } : {}),
    dynamic: { product: {
      ...(value.knowledgeContext ? { knowledgeContext: value.knowledgeContext } : {}),
      ...(value.knowledgeSourceCount === undefined ? {} : { knowledgeSourceCount: value.knowledgeSourceCount }),
      ...(value.knowledgeIngestionFailure ? { knowledgeIngestionFailure: value.knowledgeIngestionFailure } : {}),
      ...(value.learningContext ? { learningContext: value.learningContext } : {}),
      ...(value.teacherContext ? { teacherContext: value.teacherContext } : {}),
      ...(value.learnerId ? { learnerId: value.learnerId } : {}),
      ...(value.canvas ? { canvas: value.canvas } : {}),
      canvasRoster: value.canvasRoster ?? [],
    } },
  }
}

class EvalHost implements HostPort {
  readonly contexts = new Map<string, AgentContext>()
  readonly sessions = new Map<string, SessionRecord>()
  readonly actions: HostAction[] = []
  readonly events: RunEvent[] = []
  readonly messages: AssistantMessage[] = []
  readonly outcomes = new Map<string, WorkCompletion>()
  actionHandler: (action: HostAction) => Promise<HostActionResult> = async () => ({ ok: true, value: null })

  async claimWork(): Promise<WorkItem | null> { return null }
  async heartbeat(): Promise<HeartbeatResult> { return { ok: true } }
  async yieldWork(): Promise<void> {}
  async loadContext(work: WorkItem): Promise<TurnContext> {
    const value = this.contexts.get(work.id)
    if (!value) throw new Error(`missing context for work ${work.id}`)
    return coreContext(value)
  }
  async loadSession(_work: WorkItem, key: string): Promise<SessionRecord | null> {
    return structuredClone(this.sessions.get(key) ?? null)
  }
  async saveSession(_work: WorkItem, session: SessionRecord): Promise<void> {
    const current = this.sessions.get(session.key)
    if ((current?.revision ?? 0) !== session.revision) throw new Error('session revision conflict')
    session.revision += 1
    this.sessions.set(session.key, structuredClone(session))
  }
  async executeAction(_work: WorkItem, action: HostAction): Promise<HostActionResult> {
    this.actions.push(structuredClone(action))
    return this.actionHandler(action)
  }
  async emitEvent(_work: WorkItem, event: RunEvent): Promise<void> { this.events.push(structuredClone(event)) }
  async commitMessage(_work: WorkItem, message: AssistantMessage): Promise<void> { this.messages.push(structuredClone(message)) }
  async completeWork(work: WorkItem, outcome: WorkCompletion): Promise<void> { this.outcomes.set(work.id, { ...outcome }) }
}

class HostBridgeKernel implements KernelExecutor {
  constructor(
    private readonly host: EvalHost,
    private readonly actionResults: Map<string, HostActionResult>,
  ) {}

  async execute(
    workItem: WorkItem,
    runId: string,
    cellId: string,
    code: string,
    _signal?: AbortSignal,
    options?: KernelExecutionOptions,
  ): Promise<KernelExecution> {
    const actionName = code.includes('host.chat.ask') ? 'chat.ask'
      : code.includes('host.email.send') ? 'email.send'
        : code.includes('host.calendar.create') ? 'calendar.create'
        : code.includes('host.teacher.list_learners') ? 'teacher.list_learners'
          : code.includes('host.teacher.review_evaluation') ? 'teacher.review_evaluation'
        : code.includes('host.teacher.publish_objective') ? 'teacher.publish_objective'
          : code.includes('host.learning.propose_evaluation') ? 'learning.propose_evaluation'
            : code.includes('host.learning.add_steps') ? 'learning.add_steps'
              : code.includes('host.learning.finish_planning') ? 'learning.finish_planning'
                : code.includes('host.canvas.submit_report') ? 'canvas.submit_report'
                  : ''
    if (!actionName) throw new Error(`runtime Eval received unsupported IPython code: ${code}`)
    const namespace = actionName.split('.')[0]
    if (options?.capabilities && !options.capabilities.some((grant) => grant.name === namespace)) {
      throw new Error(`runtime Eval rejected ${actionName} outside the scoped IPython namespaces`)
    }
    let args: Record<string, unknown>
    if (actionName === 'chat.ask') {
      for (const argument of ['title=', 'items=', 'name', 'prompt', 'input']) {
        if (!code.includes(argument)) throw new Error(`runtime Eval requires chat.ask ${argument}`)
      }
      args = {
        title: '请补充学习目标',
        items: [{
          name: 'goal',
          prompt: '你的学习目标是什么？',
          required: true,
          input: { label: '学习目标' },
        }],
      }
    } else if (actionName === 'email.send') args = { to: ['learner@example.invalid'], subject: 'Course summary', body: 'Grounded summary' }
    else if (actionName === 'calendar.create') args = { title: '线性代数复习', at: '2026-09-04T19:30:00+08:00' }
    else if (actionName === 'teacher.publish_objective') args = { objectiveId: 'objective-eval' }
    else if (actionName === 'teacher.list_learners') args = { attentionOnly: true }
    else if (actionName === 'teacher.review_evaluation') {
      args = { evaluationId: 'evaluation-eval', decision: 'reject', reason: 'Teacher evidence override' }
    }
    else if (actionName === 'learning.propose_evaluation') {
      for (const argument of ['attemptId=', 'demonstratedLevel=', 'confidence=', 'rubricResults=', '"label"', '"score"', '"weight"']) {
        if (!code.includes(argument)) throw new Error(`runtime Eval requires learning.propose_evaluation ${argument}`)
      }
      args = {
        attemptId: 'attempt-eval',
        demonstratedLevel: 2,
        confidence: 0.9,
        rubricResults: [{ label: 'Concept accuracy', score: 2, weight: 1, note: 'Core idea is correct.' }],
      }
    } else if (actionName === 'learning.add_steps') {
      if (!code.includes('missionId=') || !code.includes('description') || !code.includes('successCriteria')) {
        throw new Error('runtime Eval requires the exact learning.add_steps SDK arguments')
      }
      args = {
        missionId: 'mission-eval',
        steps: [{ kind: 'CHECK', description: 'Explain the retrieval check', successCriteria: 'Names the evidence source' }],
      }
    } else if (actionName === 'learning.finish_planning') {
      if (!code.includes('missionId=')) throw new Error('runtime Eval requires the exact learning.finish_planning SDK argument')
      args = { missionId: 'mission-eval' }
    }
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
    await options?.onHostAction?.({ stage: 'started', action })
    const result = await this.host.executeAction(workItem, action)
    this.actionResults.set(action.idempotencyKey, structuredClone(result))
    await options?.onHostAction?.({ stage: 'completed', action, result })
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
      directives: result.directive ? [result.directive] : [],
    }
  }
}

function eventData(event: RunEvent | undefined): Record<string, unknown> {
  return record(event?.data)
}

function runtimeTrace(events: RunEvent[], actions: HostAction[], input: string): EvalTraceEvent[] {
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

function citationsFromEvents(events: RunEvent[]): EvalCitationObservation[] {
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
  const host = new EvalHost()
  const actionResults = new Map<string, HostActionResult>()
  let input = ''
  let turns: CheckedTurn[] = []
  const runtimeContext = context(item, '')
  if (scenario === 'approval-boundary') {
    runtimeContext.capabilities = ['email']
    runtimeContext.promptContextCandidate!.capabilities = ['email']
  } else if (scenario === 'calendar-create-approval') {
    runtimeContext.capabilities = ['calendar']
    runtimeContext.promptContextCandidate!.capabilities = ['calendar']
  } else if (scenario === 'planning-gate' || scenario === 'score-breakdown-evaluation' || scenario === 'question-card-required' || scenario === 'self-introduction-boundary') {
    runtimeContext.capabilities = ['learning']
    runtimeContext.promptContextCandidate!.capabilities = ['learning']
  }

  if (scenario === 'self-introduction-boundary') {
    input = '请简单介绍一下你自己。'
    runtimeContext.persona = {
      name: 'Eval Tutor',
      role: '学习助手',
      instructions: 'Eval deterministic tutor. Keep the learner focused.',
    }
    runtimeContext.learnerId = 'learner-secret-eval'
    runtimeContext.promptContextCandidate = {
      ...runtimeContext.promptContextCandidate!,
      persona: runtimeContext.persona,
      memories: {
        learner: [{
          id: 'memory-secret-eval',
          scopeType: 'learner',
          scopeId: 'learner-secret-eval',
          body: '用户正在学习线性代数',
          kind: 'learning_state',
          origin: 'explicit',
          pinned: true,
          sourceEventIds: ['event-secret-eval'],
          version: 1,
          confidence: 1,
          updatedAt: '2026-08-26T00:00:00.000Z',
        }],
        course: [],
        agentRole: [],
      },
    }
    runtimeContext.learningContext = {
      project: { id: 'project-secret-eval', kind: 'PERSONAL_LEARNING', title: '我的学习', status: 'ACTIVE' },
      roomPurpose: 'study',
      actorRole: 'learner',
      learnerId: 'learner-secret-eval',
      knowledgeUnits: [],
      due: [],
      pendingTeacherReviews: 0,
    }
    turns = [{
      instructionFragments: [
        'Your product-visible identity is "Eval Tutor"',
        'For greetings, self-introductions, and generic questions',
        'Projects, courses, Missions, memories, teacher state, Canvas work, and learner progress belong to the user or product',
      ],
      itemFragments: [input, 'Relevant memory for THIS TURN ONLY', '用户正在学习线性代数', 'Authorized learning state', '我的学习'],
      forbiddenItemFragments: ['project-secret-eval', 'learner-secret-eval', 'memory-secret-eval', 'event-secret-eval'],
      result: {
        output: [{ role: 'assistant', content: '我是 Eval Tutor，LingxiLoop 中的 AI 学习助手，可以帮助你梳理目标、理解知识并完成练习。' }],
        text: '我是 Eval Tutor，LingxiLoop 中的 AI 学习助手，可以帮助你梳理目标、理解知识并完成练习。',
        usage: { inputTokens: 36, outputTokens: 24 },
      },
    }]
  } else if (scenario === 'question-card-required') {
    input = '为我规划学习'
    turns = [{
      instructionFragments: ['MUST call host.chat.ask', 'If you are about to write a blocking question', 'For a vague request such as', 'turn ends automatically'],
      itemFragments: [input],
      result: {
        output: [{
          type: 'function_call',
          callId: 'runtime-question-card',
          name: 'ipython',
          arguments: JSON.stringify({ code: 'host.chat.ask(title="请补充学习目标", items=[{"name":"goal","prompt":"你的学习目标是什么？","required":True,"input":{"label":"学习目标"}}])' }),
        }],
        text: '',
        usage: { inputTokens: 32, outputTokens: 14 },
      },
    }]
    host.actionHandler = async (action) => action.action === 'chat.ask'
      ? { ok: true, value: { clientMsgNo: 'questionnaire-eval' }, directive: { type: 'defer', reason: 'user' } }
      : { ok: false, error: `unexpected action ${action.action}` }
  } else if (scenario === 'auto-grounding') {
    input = 'Explain retrieval grounding using the uploaded handbook.'
    turns = [{
      itemFragments: [input, 'AUTO_EVIDENCE_SECRET', 'document-id=S1'],
      result: {
        output: [{ role: 'assistant', content: '[结论：RAG 回答必须保留可追溯证据。](#cite-S1)[因为检索片段可能不完整，所以引用来源能降低幻觉。](#cite-S1)[本次结论来自课程手册。](#cite-S1)[你能解释为什么证据引用会降低幻觉吗？](#cite-S1)' }],
        text: '[结论：RAG 回答必须保留可追溯证据。](#cite-S1)[因为检索片段可能不完整，所以引用来源能降低幻觉。](#cite-S1)[本次结论来自课程手册。](#cite-S1)[你能解释为什么证据引用会降低幻觉吗？](#cite-S1)',
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
  } else if (scenario === 'hybrid-grounding') {
    input = 'Use the automatically retrieved runtime handbook before answering.'
    runtimeContext.knowledgeSourceCount = 1
    runtimeContext.knowledgeContext = [{
      sourceId: 'source-hybrid',
      chunkId: 'chunk-hybrid',
      marker: 'S1',
      sourceTitle: 'Runtime Handbook',
      excerpt: 'HYBRID_SECRET_EXCERPT: lexical and vector candidates are fused before answering.',
      position: 0,
    }]
    turns = [{
      itemFragments: [input, 'HYBRID_SECRET_EXCERPT', 'document-id=S1'],
      result: {
        output: [{ role: 'assistant', content: '[混合检索会在回答前融合关键词与语义候选。](#cite-S1)[因此既保留专有词匹配，也获得上下文消歧。](#cite-S1)' }],
        text: '[混合检索会在回答前融合关键词与语义候选。](#cite-S1)[因此既保留专有词匹配，也获得上下文消歧。](#cite-S1)',
        usage: { inputTokens: 58, outputTokens: 20 },
      },
    }]
  } else if (scenario === 'approval-boundary') {
    input = 'Send the course summary by email.'
    turns = [{
      instructionFragments: ['Eval deterministic tutor', 'host.email'],
      itemFragments: [input],
      result: {
        output: [{
          type: 'function_call',
          callId: 'runtime-email',
          name: 'ipython',
          arguments: JSON.stringify({ code: 'host.email.send(to=["learner@example.invalid"], subject="Course summary", body="Grounded summary")' }),
        }],
        text: '',
        usage: { inputTokens: 28, outputTokens: 10 },
      },
    }]
    host.actionHandler = async (action) => action.action === 'email.send'
      ? { ok: false, approval: { id: 'approval-runtime-email', status: 'PENDING' } }
      : { ok: false, error: `unexpected action ${action.action}` }
  } else if (scenario === 'calendar-create-approval') {
    input = 'Schedule a linear algebra review for Friday at 19:30.'
    turns = [{
      instructionFragments: ['host.calendar', 'Creating an event always stops for human confirmation'],
      itemFragments: [input],
      result: {
        output: [{
          type: 'function_call',
          callId: 'runtime-calendar-create',
          name: 'ipython',
          arguments: JSON.stringify({ code: 'host.calendar.create(title="线性代数复习", at="2026-09-04T19:30:00+08:00")' }),
        }],
        text: '',
        usage: { inputTokens: 30, outputTokens: 12 },
      },
    }]
    host.actionHandler = async (action) => action.action === 'calendar.create'
      ? { ok: false, approval: { id: 'approval-runtime-calendar', status: 'PENDING' } }
      : { ok: false, error: `unexpected action ${action.action}` }
  } else if (scenario === 'pulse-approval-boundary') {
    input = 'Publish the prepared retrieval objective.'
    configureTeacherContext(runtimeContext, item)
    turns = [{
      instructionFragments: ['Pulse deterministic teacher agent', 'host.teacher', 'product-managed Pulse Agent'],
      forbiddenInstructionFragments: ['host.turn', 'host.learning is the only', 'host.canvas is preloaded', 'host.email'],
      itemFragments: [input, 'Authorized teacher state', 'Runtime Course'],
      forbiddenItemFragments: ['course-eval', 'eval-teacher', 'project-eval'],
      result: {
        output: [{
          type: 'function_call',
          callId: 'runtime-pulse-publish',
          name: 'ipython',
          arguments: JSON.stringify({ code: 'host.teacher.publish_objective(objective_id="objective-eval")' }),
        }],
        text: '',
        usage: { inputTokens: 36, outputTokens: 12 },
      },
    }]
    host.actionHandler = async (action) => action.action === 'teacher.publish_objective'
      ? { ok: false, approval: { id: 'approval-runtime-pulse', status: 'PENDING' } }
      : { ok: false, error: `unexpected action ${action.action}` }
  } else if (scenario === 'forbidden-inferred-percentage') {
    input = 'What percentage of learners have mastered retrieval?'
    configureTeacherContext(runtimeContext, item)
    turns = [{
      instructionFragments: ['Never invent learner evidence', 'risk labels, statistics'],
      itemFragments: [input, 'Authorized teacher state'],
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
        instructionFragments: ['host.teacher', 'Aggregate before learner drill-down'],
        itemFragments: [input, 'Authorized teacher state'],
        result: {
          output: [{
            type: 'function_call',
            callId: 'runtime-attention-list',
            name: 'ipython',
            arguments: JSON.stringify({ code: 'host.teacher.list_learners(attention_only=True)' }),
          }],
          text: '',
          usage: { inputTokens: 34, outputTokens: 10 },
        },
      },
      {
        instructionFragments: ['host.teacher', 'Aggregate before learner drill-down'],
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
      itemFragments: [input, 'Authorized teacher state'],
      result: {
        output: [{
          type: 'function_call',
          callId: 'runtime-teacher-override',
          name: 'ipython',
          arguments: JSON.stringify({
            code: 'host.teacher.review_evaluation(evaluation_id="evaluation-eval", decision="reject", reason="Teacher evidence override")',
          }),
        }],
        text: '',
        usage: { inputTokens: 38, outputTokens: 14 },
      },
    }]
    host.actionHandler = async (action) => action.action === 'teacher.review_evaluation'
      ? { ok: false, approval: { id: 'approval-runtime-override', status: 'PENDING' } }
      : { ok: false, error: `unexpected action ${action.action}` }
  } else if (scenario === 'score-breakdown-evaluation') {
    input = 'Grade the recorded learner attempt against its rubric.'
    turns = [
      {
        instructionFragments: ['Eval deterministic tutor', 'propose_evaluation(attemptId=', 'rubricResults is required'],
        itemFragments: [input],
        result: {
          output: [{
            type: 'function_call',
            callId: 'runtime-score-breakdown',
            name: 'ipython',
            arguments: JSON.stringify({
              code: 'host.learning.propose_evaluation(attemptId="attempt-eval", demonstratedLevel=2, confidence=0.9, rubricResults=[{"label":"Concept accuracy","score":2,"weight":1,"note":"Core idea is correct."}])',
            }),
          }],
          text: '',
          usage: { inputTokens: 40, outputTokens: 18 },
        },
      },
      {
        instructionFragments: ['Eval deterministic tutor', 'rubricResults is required'],
        itemFragments: ['ACCEPTED', 'evaluation-eval', 'function_call_output'],
        result: {
          output: [{ role: 'assistant', content: '判分已记录：2.0 / 4，评估已判定。' }],
          text: '判分已记录：2.0 / 4，评估已判定。',
          usage: { inputTokens: 48, outputTokens: 14 },
        },
      },
    ]
    host.actionHandler = async (action) => action.action === 'learning.propose_evaluation'
      ? { ok: true, value: { evaluationId: 'evaluation-eval', status: 'ACCEPTED', decisions: [] } }
      : { ok: false, error: `unexpected action ${action.action}` }
  } else if (scenario === 'planning-gate') {
    input = 'Start the retrieval mission now.'
    runtimeContext.learningContext = {
      project: { id: 'project-eval', kind: 'INSTITUTIONAL_COURSE', title: 'Runtime Course', status: 'ACTIVE' },
      courseId: 'course-eval',
      roomPurpose: 'study',
      actorRole: 'learner',
      learnerId: 'eval-learner',
      activeMission: {
        id: 'mission-eval',
        projectId: 'project-eval',
        learnerId: 'eval-learner',
        conversationId: item.channelId,
        triggerClientMsgNo: item.triggerClientMsgNo,
        goal: 'Explain retrieval grounding',
        successCriteria: 'Explain and check the evidence source',
        kind: 'STUDY',
        coordinatorAgentId: item.agentId,
        status: 'PLANNING',
        steps: [],
        createdAt: '2026-08-26T00:00:00.000Z',
        updatedAt: '2026-08-26T00:00:00.000Z',
      },
      knowledgeUnits: [],
      due: [],
      pendingTeacherReviews: 0,
    }
    turns = [
      {
        instructionFragments: ['Eval deterministic tutor', 'host.learning'],
        itemFragments: [input, 'status', 'PLANNING'],
        result: {
          output: [{ role: 'assistant', content: 'Mission planning is complete.' }],
          text: 'Mission planning is complete.',
          usage: { inputTokens: 30, outputTokens: 8 },
        },
      },
      {
        instructionFragments: ['Eval deterministic tutor', 'host.learning'],
        itemFragments: ['Planning gate:', 'host.learning.add_steps'],
        result: {
          output: [{
            type: 'function_call',
            callId: 'runtime-learning-add-steps',
            name: 'ipython',
            arguments: JSON.stringify({ code: 'host.learning.add_steps(missionId="mission-eval", steps=[{"kind":"CHECK","description":"Explain the retrieval check","successCriteria":"Names the evidence source"}])' }),
          }],
          text: '',
          usage: { inputTokens: 46, outputTokens: 12 },
        },
      },
      {
        instructionFragments: ['Eval deterministic tutor', 'host.learning'],
        itemFragments: ['step-eval-check', 'PLANNING'],
        result: {
          output: [{
            type: 'function_call',
            callId: 'runtime-learning-finish-planning',
            name: 'ipython',
            arguments: JSON.stringify({ code: 'host.learning.finish_planning(missionId="mission-eval")' }),
          }],
          text: '',
          usage: { inputTokens: 52, outputTokens: 10 },
        },
      },
      {
        instructionFragments: ['Eval deterministic tutor', 'host.learning'],
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
          kind: 'CHECK',
          description: 'Explain the retrieval check',
          successCriteria: 'Names the evidence source',
          status: 'OPEN',
          position: 0,
        }]
        return { ok: true, value: { missionId: mission.id, steps: mission.steps } }
      }
      if (action.action === 'learning.finish_planning') {
        if (!mission.steps.some((step) => step.kind === 'CHECK')) return { ok: false, error: 'planning requires a check step' }
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
        itemFragments: ['Completion gate:', 'learning_report_v1', 'host.canvas.submit_report'],
        result: {
          output: [{
            type: 'function_call',
            callId: 'runtime-canvas-report',
            name: 'ipython',
            arguments: JSON.stringify({ code: 'host.canvas.submit_report(finding="Runtime gate verified", evidenceRefs=[{"kind":"source","id":"source-eval"}], confidence=0.94)' }),
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
  await new AgentRuntime(host, model, new HostBridgeKernel(host, actionResults), {
    policy: new LingxiLoopRuntimePolicy(),
    heartbeatMs: 60_000,
    maxHops: 4,
    promptContractVersion: 'prompt-v7',
  }).runWork(toLingxiOSWork(item))
  const latencyMs = Math.max(0, Date.now() - startedAt)
  const outcome = host.outcomes.get(item.id)
  if (!outcome) throw new Error(`${testCase.caseId} did not complete through the Agent OS host`)
  if (outcome.status === 'failed') throw new Error(
    `${testCase.caseId} failed in Agent OS: ${outcome.error ?? 'unknown error'}; actions=${host.actions.map((action) => action.action).join(',')}; mission=${runtimeContext.learningContext?.activeMission?.status ?? 'none'}`,
  )
  model.assertComplete()
  const answer = outcome.resultText ?? host.messages.find((message) => message.runId === item.id)?.body ?? ''
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
