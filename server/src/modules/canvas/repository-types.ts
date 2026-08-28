import type { CanvasActorKind, CanvasAssignmentExecutionRole, CanvasAssignmentStatus, CanvasEvidenceRef, CanvasFrameType, CanvasReportVerdict, CanvasWorkspaceStatus } from './contracts.js'

export interface FrameRow {
  id: string; canvas_id: string; type: CanvasFrameType; title: string
  x: number | string; y: number | string; width: number | string; height: number | string
  content: string; data: Record<string, unknown> | null; revision: number | string
  created_by: string; updated_by: string; created_at: string; updated_at: string
}

export interface CanvasRow {
  id: string; company_id: string; project_id: string | null; title: string; conversation_id: string | null
  trigger_client_msg_no: string | null; goal: string; initiator_agent_id: string | null
  status: CanvasWorkspaceStatus; origin: string; summary: string | null
  created_by: string; created_at: string; updated_at: string
}

export interface AssignmentRow {
  id: string; canvas_id: string; agent_id: string; assignment: string; color: string
  status: CanvasAssignmentStatus; work_x: number | string; work_y: number | string
  work_width: number | string; work_height: number | string; active_frame_id: string | null
  cursor_x: number | string | null; cursor_y: number | string | null; work_id: string | null
  result: string | null; error: string | null; started_at: string | null; completed_at: string | null
  updated_at: string; execution_role: CanvasAssignmentExecutionRole; verifies_assignment_id: string | null
  progress_fingerprint: string | null; no_progress_count: number | string | null
}

export interface ReportRow {
  id: string; canvas_id: string; assignment_id: string | null; author_agent_id: string
  execution_role: 'specialist' | 'verifier' | 'reporter'; schema_version: 'learning_report_v1'
  finding: string; evidence_refs: CanvasEvidenceRef[]; confidence: number | string; unresolved: string[]
  next_step: string | null; verifies_report_id: string | null; disconfirming_checks: string[]
  verdict: CanvasReportVerdict | null; consumed_report_ids: string[]; conflict_resolution: unknown[]; created_at: string
}

export interface ActivityRow {
  id: string; canvas_id: string; frame_id: string | null; actor_id: string
  actor_kind: CanvasActorKind; action: string; detail: Record<string, unknown>; created_at: string
}

export interface PresenceRow {
  participant_id: string; participant_kind: CanvasActorKind; status: string
  frame_id: string | null; color: string | null; cursor_x: number | string | null
  cursor_y: number | string | null; last_seen_at: string
}

export interface CommentRow {
  id: string; canvas_id: string; frame_id: string | null; author_id: string
  author_kind: CanvasActorKind; body: string; created_at: string
}

