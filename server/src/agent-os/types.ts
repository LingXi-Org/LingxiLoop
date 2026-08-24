export const AGENT_OS_PROTOCOL_VERSION = 1 as const

export type AgentWorkReason = 'message' | 'mention' | 'handoff' | 'routine' | 'resume' | 'canvas_worker' | 'canvas_summary'

export interface AgentWorkItem {
  id: string
  fence: number
  companyId: string
  agentId: string
  channelId: string
  threadRootClientMsgNo?: string
  triggerClientMsgNo: string
  reason: AgentWorkReason
  leaseToken: string
  canvasId?: string
  canvasAssignmentId?: string
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
  summary?: string
  pendingApproval?: ApprovalResolution
  canvas?: {
    id: string
    title: string
    goal: string
    status: string
    initiatorAgentId: string | null
    assignment?: unknown
    assignments: unknown[]
    frames: unknown[]
  }
  canvasRoster?: Array<{ id: string; name: string; role: string; status: string }>
}

export interface HostHeartbeat {
  ok: boolean
  cancelRequested?: boolean
  steer?: Array<{ id: string; text: string; createdAt: string }>
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
  revision: number
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
  | 'artifact'
  | 'canvas'

export interface LingxiMessageV1 {
  version: 1
  kind: LingxiMessageKind
  clientMsgNo: string
  body?: string
  replyToClientMsgNo?: string
  refs?: Record<string, string>
  data?: Record<string, unknown>
}
