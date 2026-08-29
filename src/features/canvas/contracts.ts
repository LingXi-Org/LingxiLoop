import type { CanvasActivityKind } from '@/lib/canvasEventKinds'

export type CanvasFrameType = 'html' | 'markdown' | 'document' | 'image' | 'artifact'
export type CanvasWorkspaceStatus = 'active' | 'summarizing' | 'completed' | 'stopped' | 'failed'
export type CanvasAssignmentStatus = 'queued' | 'blocked' | 'working' | 'waiting' | 'completed' | 'failed' | 'cancelled'
export type AgentExecutionRole = 'coordinator' | 'specialist' | 'verifier' | 'reporter'
export type CanvasAssignmentExecutionRole = 'specialist' | 'verifier'

export interface CanvasFrame {
  id: string; canvasId: string; type: CanvasFrameType; title: string
  x: number; y: number; width: number; height: number; content: string
  data: Record<string, unknown>; revision: number; createdBy: string; updatedBy: string
  createdAt: string; updatedAt: string
}

export interface CanvasPresence {
  participantId: string; participantKind: 'user' | 'agent'; status: string; frameId: string | null
  color?: string | null; cursorX?: number | null; cursorY?: number | null; lastSeenAt: string
}

export interface CanvasAssignmentReport {
  id: string; canvasId: string; assignmentId: string | null; authorAgentId: string
  executionRole: Exclude<AgentExecutionRole, 'coordinator'>; schemaVersion: 'learning_report_v1'
  finding: string; evidenceRefs: Array<{ kind: 'frame' | 'message' | 'document' | 'source' | 'attempt' | 'report'; id: string }>
  confidence: number; unresolved: string[]; nextStep: string | null; verifiesReportId: string | null
  disconfirmingChecks: string[]; verdict: 'supported' | 'rejected' | 'inconclusive' | null
  consumedReportIds: string[]; conflictResolution: unknown[]; createdAt: string
}

export interface CanvasAgentAssignment {
  id: string; canvasId: string; agentId: string; assignment: string; color: string
  status: CanvasAssignmentStatus; workArea: { x: number; y: number; width: number; height: number }
  activeFrameId: string | null; cursor: { x: number; y: number } | null; workId: string | null
  dependsOnAgentIds: string[]; executionRole: CanvasAssignmentExecutionRole; verifiesAssignmentId: string | null
  progressFingerprint?: string | null; noProgressCount?: number; result: string | null; error: string | null
  startedAt: string | null; completedAt: string | null; updatedAt: string
}

export interface CanvasWorkspaceSummary {
  id: string; title: string; goal: string; conversationId: string | null; initiatorAgentId: string | null
  status: CanvasWorkspaceStatus; origin: string; frameCount: number; assignmentCount: number
  updatedAt: string; createdAt: string
}

export interface CanvasComment {
  id: string; canvasId: string; frameId: string | null; authorId: string
  authorKind: 'user' | 'agent'; body: string; createdAt: string
}

export interface CanvasActivity {
  id: string; canvasId: string; frameId: string | null; actorId: string; actorKind: 'user' | 'agent'
  action: CanvasActivityKind; detail: Record<string, unknown>; createdAt: string
}

export interface CanvasSnapshot {
  id: string; title: string; companyId: string; conversationId: string | null
  triggerClientMsgNo: string | null; goal: string; initiatorAgentId: string | null
  status: CanvasWorkspaceStatus; origin: string; summary: string | null; createdBy: string
  createdAt: string; updatedAt: string; frames: CanvasFrame[]; assignments: CanvasAgentAssignment[]
  presence: CanvasPresence[]; comments: CanvasComment[]; activity: CanvasActivity[]; reports: CanvasAssignmentReport[]
}
