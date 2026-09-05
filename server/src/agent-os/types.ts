import type {
  HostAction as LingxiOSHostAction,
  HostActionResult as LingxiOSHostActionResult,
  PromptContext,
} from '../../../third_party/lingxios/src/protocol/types.js'

export { AGENT_OS_PROTOCOL_VERSION } from '../../../third_party/lingxios/src/protocol/constants.js'
export type { ModelItem } from '../../../third_party/lingxios/src/protocol/types.js'
export const PROMPT_CONTRACT_VERSION = 'prompt-v7' as const
export const KNOWLEDGE_CONTRACT_VERSION = 'native-v3' as const

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

export interface PromptContextV1 extends PromptContext {
  version: 2
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
  homeEpoch?: number
  companyId: string
  authorizationUserId?: string
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
  capabilities?: string[]
  messages: AgentContextMessage[]
  /** Retrieved for this turn only. Never frozen into PromptContext/session. */
  knowledgeContext?: Array<{
    sourceId: string
    sourceTitle: string
    chunkId: string
    excerpt: string
    sourceUrl?: string
    position: number
    page?: number
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

export type HostAction = LingxiOSHostAction
export type HostActionResult = LingxiOSHostActionResult

export interface ApprovalResolution {
  approvalId: string
  approved: boolean
  result?: unknown
  error?: string
}

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
