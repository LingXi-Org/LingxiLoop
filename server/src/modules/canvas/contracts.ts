import type { CanvasActivityKind } from '../../../../src/lib/canvasEventKinds.js'
import { z } from 'zod'
import type { AgentExecutionRole } from '../../agent-os/types.js'

export const CANVAS_FRAME_TYPES = ['html', 'markdown', 'document', 'image', 'artifact'] as const
export type CanvasFrameType = typeof CANVAS_FRAME_TYPES[number]
export type CanvasActorKind = 'user' | 'agent'
export type CanvasWorkspaceStatus = 'active' | 'summarizing' | 'completed' | 'stopped' | 'failed'
export type CanvasAssignmentStatus = 'queued' | 'blocked' | 'working' | 'waiting' | 'completed' | 'failed' | 'cancelled'
export type CanvasAssignmentExecutionRole = Extract<AgentExecutionRole, 'specialist' | 'verifier'>
export type CanvasReportVerdict = 'supported' | 'rejected' | 'inconclusive'

export interface CanvasEvidenceRef {
  kind: 'frame' | 'message' | 'document' | 'source' | 'attempt' | 'report'
  id: string
}

export interface CanvasAssignmentReport {
  id: string
  canvasId: string
  assignmentId: string | null
  authorAgentId: string
  executionRole: Exclude<AgentExecutionRole, 'coordinator'>
  schemaVersion: 'learning_report_v1'
  finding: string
  evidenceId: string
  sourceEvidenceIds: string[]
  confidence: number
  unresolved: string[]
  nextStep: string | null
  verifiesReportId: string | null
  disconfirmingChecks: string[]
  verdict: CanvasReportVerdict | null
  consumedReportIds: string[]
  conflictResolution: unknown[]
  createdAt: string
}

export interface CanvasFrame {
  id: string
  canvasId: string
  type: CanvasFrameType
  title: string
  x: number
  y: number
  width: number
  height: number
  content: string
  data: Record<string, unknown>
  revision: number
  createdBy: string
  updatedBy: string
  createdAt: string
  updatedAt: string
}

export interface CanvasPresence {
  participantId: string
  participantKind: CanvasActorKind
  status: string
  frameId: string | null
  color?: string | null
  cursorX?: number | null
  cursorY?: number | null
  lastSeenAt: string
}

export interface CanvasAgentAssignment {
  id: string
  canvasId: string
  agentId: string
  assignment: string
  color: string
  status: CanvasAssignmentStatus
  workArea: { x: number; y: number; width: number; height: number }
  activeFrameId: string | null
  cursor: { x: number; y: number } | null
  workId: string | null
  dependsOnAgentIds: string[]
  executionRole: CanvasAssignmentExecutionRole
  verifiesAssignmentId: string | null
  progressFingerprint: string | null
  noProgressCount: number
  result: string | null
  error: string | null
  startedAt: string | null
  completedAt: string | null
  updatedAt: string
}

export interface CanvasComment {
  id: string
  canvasId: string
  frameId: string | null
  authorId: string
  authorKind: CanvasActorKind
  body: string
  createdAt: string
}

export interface CanvasActivity {
  id: string
  canvasId: string
  frameId: string | null
  actorId: string
  actorKind: CanvasActorKind
  action: CanvasActivityKind
  detail: Record<string, unknown>
  createdAt: string
}

export interface CanvasSnapshot {
  id: string
  title: string
  companyId: string
  projectId: string | null
  conversationId: string | null
  triggerClientMsgNo: string | null
  goal: string
  initiatorAgentId: string | null
  status: CanvasWorkspaceStatus
  origin: string
  summary: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
  frames: CanvasFrame[]
  assignments: CanvasAgentAssignment[]
  presence: CanvasPresence[]
  comments: CanvasComment[]
  activity: CanvasActivity[]
  reports: CanvasAssignmentReport[]
}

export interface CanvasWorkspaceSummary {
  id: string
  title: string
  goal: string
  conversationId: string | null
  initiatorAgentId: string | null
  status: CanvasWorkspaceStatus
  origin: string
  frameCount: number
  assignmentCount: number
  updatedAt: string
  createdAt: string
}

export interface CanvasMemberInput {
  agentId: string
  assignment: string
  dependsOnAgentIds?: string[]
  executionRole?: CanvasAssignmentExecutionRole
  verifiesAgentId?: string
}

const identifierSchema = z.string().trim().min(1).max(240)
const finiteNumberSchema = z.number().finite()

export const canvasConversationQuerySchema = z.object({
  conversationId: identifierSchema,
})

export const canvasAssignmentRequestSchema = z.object({
  agentId: identifierSchema,
  assignment: z.string().trim().min(1).max(4_000),
})

export const canvasSteerRequestSchema = z.object({
  text: z.string().trim().min(1).max(4_000),
})

export const canvasFrameCreateRequestSchema = z.object({
  canvasId: identifierSchema,
  type: z.enum(CANVAS_FRAME_TYPES).optional(),
  title: z.string().max(200).optional(),
  x: finiteNumberSchema.optional(),
  y: finiteNumberSchema.optional(),
  width: finiteNumberSchema.optional(),
  height: finiteNumberSchema.optional(),
  content: z.string().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
}).strict()

export const canvasFrameUpdateRequestSchema = z.object({
  type: z.enum(CANVAS_FRAME_TYPES).optional(),
  title: z.string().max(200).optional(),
  x: finiteNumberSchema.optional(),
  y: finiteNumberSchema.optional(),
  width: finiteNumberSchema.optional(),
  height: finiteNumberSchema.optional(),
  content: z.string().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
  baseRevision: z.number().int().nonnegative().optional(),
}).strict()

export const canvasAppendRequestSchema = z.object({
  content: z.string().min(1).max(64 * 1024),
})

export const canvasStatusRequestSchema = z.object({
  canvasId: identifierSchema,
  status: z.string().trim().max(120),
  frameId: identifierSchema.nullish(),
  cursorX: finiteNumberSchema.nullish(),
  cursorY: finiteNumberSchema.nullish(),
}).strict()

export const canvasCommentRequestSchema = z.object({
  canvasId: identifierSchema,
  frameId: identifierSchema.nullish(),
  body: z.string().trim().min(1).max(8_000),
}).strict()
