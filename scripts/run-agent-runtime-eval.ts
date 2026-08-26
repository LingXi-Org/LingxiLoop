#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { MemoryHostAdapter } from '../server/src/agent-os/host-adapter.js'
import { ApprovalPendingError, type KernelExecutor } from '../server/src/agent-os/kernel-manager.js'
import { type AgentModelDriver, type ModelTurnResult, ScriptedModelDriver } from '../server/src/agent-os/model-driver.js'
import { AgentOSRuntime } from '../server/src/agent-os/runtime.js'
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

function work(caseId: string): AgentWorkItem {
  return {
    id: `eval-${caseId}`,
    fence: 1,
    companyId: 'eval-company',
    agentId: 'eval-tutor',
    channelId: `eval-${caseId}`,
    triggerClientMsgNo: `trigger-${caseId}`,
    reason: 'message',
    lane: 'learner',
    leaseToken: `lease-${caseId}`,
  }
}

function context(item: AgentWorkItem, input: string): AgentContext {
  return {
    work: item,
    persona: {
      name: 'Eval Tutor',
      role: 'Deterministic runtime evaluator',
      instructions: 'Eval deterministic tutor. Follow the Agent OS runtime contracts.',
    },
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
      systemInstructions: 'Eval deterministic tutor. Follow the Agent OS runtime contracts.',
      persona: { name: 'Eval Tutor', role: 'Deterministic runtime evaluator', instructions: 'Use evidence and approval boundaries.' },
      capabilities: ['knowledge', 'canvas'],
      memories: { learner: [], course: [], agentRole: [] },
      sourceVersions: { eval: 'runtime-smoke.v1' },
    },
  }
}

interface CheckedTurn {
  result: ModelTurnResult
  itemFragments: string[]
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
    for (const fragment of ['Eval deterministic tutor', 'loop.knowledge', 'loop.canvas']) {
      if (!args.instructions.includes(fragment)) throw new Error(`runtime Eval prompt contract lost fragment: ${fragment}`)
    }
    const serialized = JSON.stringify(args.items)
    for (const fragment of expected.itemFragments) {
      if (!serialized.includes(fragment)) throw new Error(`runtime Eval model input lost fragment: ${fragment}`)
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

  async execute(workItem: AgentWorkItem, runId: string, cellId: string, code: string): Promise<KernelExecution> {
    const actionName = code.includes('loop.knowledge.search') ? 'knowledge.search'
      : code.includes('loop.email.send') ? 'email.send'
        : ''
    if (!actionName) throw new Error(`runtime Eval received unsupported IPython code: ${code}`)
    const action: HostAction = {
      runId,
      cellId,
      callIndex: 0,
      action: actionName,
      args: actionName === 'knowledge.search'
        ? { query: 'runtime handbook', limit: 3 }
        : { to: ['learner@example.invalid'], subject: 'Course summary' },
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
  const item = work(testCase.caseId)
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
  model.assertComplete()

  const outcome = host.outcomes.get(item.id)
  if (!outcome) throw new Error(`${testCase.caseId} did not complete through the Agent OS host`)
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
    approvals: approvalId ? [{ id: approvalId, action: 'email.send', status: 'pending' }] : [],
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
