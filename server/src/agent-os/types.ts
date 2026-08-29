export const AGENT_OS_PROTOCOL_VERSION = 1 as const

export type AgentWorkReason = 'message' | 'mention' | 'handoff' | 'routine' | 'resume' | 'canvas_worker' | 'canvas_summary' | 'memory_synthesis'
export type WorkLane = 'learner' | 'approval' | 'collaboration' | 'background'
export type AgentExecutionRole = 'coordinator' | 'specialist' | 'verifier' | 'reporter'

export type MemoryScopeType = 'learner' | 'course' | 'agent_role'
export interface PromptMemoryV1 {
  id: string
  scopeType: MemoryScopeType
  scopeId: string
  body: string
  kind: string
  origin: 'explicit' | 'synthesized'
  pinned: boolean
  sourceEventIds: string[]
  version: number
  confidence: number
  validUntil?: string
  updatedAt: string
}

export interface PromptContextV1 {
  version: 1
  epoch: number
  assembledAt: string
  systemInstructions: string
  persona: { name: string; role: string; instructions: string }
  capabilities: string[]
  executionRole: AgentExecutionRole
  memories: {
    learner: PromptMemoryV1[]
    course: PromptMemoryV1[]
    agentRole: PromptMemoryV1[]
  }
  sourceVersions: Record<string, string>
}

export interface MemorySynthesisChange {
  action: 'create' | 'update' | 'expire'
  scopeType: MemoryScopeType
  scopeId: string
  id?: string
  expectedVersion?: number
  content?: string
  kind?: string
  sourceEventIds: string[]
  validUntil?: string
}

export interface MemorySynthesisBatch {
  evidence: Array<{
    id: string
    learnerId: string
    conversationId: string
    userEventId: string
    assistantEventId: string
    user: string
    assistant: string
    occurredAt: string
  }>
  currentMemories: PromptMemoryV1[]
}

export interface AgentWorkItem {
  id: string
  fence: number
  companyId: string
  agentId: string
  channelId: string
  threadRootClientMsgNo?: string
  triggerClientMsgNo: string
  reason: AgentWorkReason
  executionRole: AgentExecutionRole
  lane: WorkLane
  createdAt?: string
  availableAt?: string
  attempts?: number
  preemptions?: number
  leaseToken: string
  canvasId?: string
  canvasAssignmentId?: string
  progressFingerprint?: string
  noProgressCount?: number
}

export interface AgentContextMessage {
  clientMsgNo: string
  authorId: string
  authorName: string
  authorKind: 'human' | 'agent' | 'system'
  body: string
  createdAt: string
  replyToClientMsgNo?: string
}

export interface AgentContext {
  work: AgentWorkItem
  persona: {
    name: string
    role: string
    instructions: string
  }
  messages: AgentContextMessage[]
  /** Retrieved for this turn only. Never frozen into PromptContext/session. */
  knowledgeContext?: Array<{
    sourceId: string
    sourceTitle: string
    chunkId: string
    excerpt: string
    sourceUrl?: string
    position: number
    marker: string
  }>
  knowledgeSourceCount?: number
  /** Degraded attachment ingestion detail for the triggering message. */
  knowledgeIngestionFailure?: string
  /** Fresh course state for this turn only. Never frozen into PromptContext/session. */
  learningContext?: import('../modules/learning/runtime.js').LearningTurnContext
  /** Fresh teacher-room state for Pulse only. Never frozen into PromptContext/session. */
  teacherContext?: import('../modules/learning/runtime.js').TeacherTurnContext
  summary?: string
  learnerId?: string
  promptContextCandidate?: PromptContextV1
  pendingApproval?: ApprovalResolution
  canvas?: {
    id: string
    title: string
    goal: string
    status: string
    initiatorAgentId: string | null
    assignment?: unknown
    assignments: unknown[]
    reports: unknown[]
    frames: unknown[]
    activity: unknown[]
  }
  canvasRoster?: Array<{ id: string; name: string; role: string; status: string }>
}

export interface HostHeartbeat {
  ok: boolean
  cancelRequested?: boolean
  steer?: Array<{ id: string; text: string; createdAt: string }>
  preemptRequested?: boolean
}

export interface HostAction {
  runId: string
  cellId: string
  callIndex: number
  action: string
  args: unknown
  idempotencyKey: string
}

export type AgentRunStage = 'started' | 'delta' | 'completed' | 'failed' | 'cancelled'

export interface AgentRunEvent {
  runId: string
  seq: number
  kind: string
  stage: AgentRunStage
  visibility: 'user' | 'internal'
  data: unknown
}

export interface HostActionResult {
  ok: boolean
  value?: unknown
  error?: string
  approval?: {
    id: string
    status: 'pending'
  }
  directive?: { type: 'defer_to_canvas'; canvasId: string }
}

export interface ApprovalResolution {
  approvalId: string
  approved: boolean
  result?: unknown
  error?: string
}

export interface KernelExecution {
  executionId: string
  stdout: string
  stderr: string
  result: unknown
  durationMs: number
  truncated: boolean
  artifacts: Array<{ path: string; size: number; mime: string; sha256: string }>
  directives?: Array<{ type: 'defer_to_canvas'; canvasId: string }>
}

export interface AgentSessionRecord {
  key: string
  companyId: string
  agentId: string
  channelId: string
  threadRootClientMsgNo?: string
  summary?: string
  history: ModelItem[]
  /** Durable work ids whose dynamic turn input is already present in history. */
  appliedWorkIds?: string[]
  revision: number
  compactionEpoch: number
  promptContext?: PromptContextV1
}

export type ModelItem =
  | { role: 'user' | 'assistant' | 'system'; content: string }
  | { type: 'function_call'; callId: string; name: 'ipython'; arguments: string }
  | { type: 'function_call_output'; callId: string; output: string }

export type LingxiMessageKind =
  | 'text'
  | 'attachment'
  | 'system'
  | 'tool_activity'
  | 'approval'
  | 'handoff'
  | 'poll'
  | 'questionnaire'
  | 'artifact'
  | 'canvas'
  | 'learning_mission'

export interface LingxiMessageV1 {
  version: 1
  kind: LingxiMessageKind
  clientMsgNo: string
  body?: string
  replyToClientMsgNo?: string
  refs?: Record<string, string | string[]>
  data?: Record<string, unknown>
}
