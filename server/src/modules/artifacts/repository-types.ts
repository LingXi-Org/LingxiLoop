import type { ArtifactActorKind, ArtifactAssignmentExecutionRole, ArtifactAssignmentStatus, ArtifactReportVerdict, ArtifactWorkspaceStatus } from './contracts.js'
import type { ArtifactKind } from './kinds.js'

export interface ArtifactRow {
  shared_state_thread_key?: string | null
  execution_conversation_id?: string | null
  id: string; company_id: string; project_id: string; kind: ArtifactKind; title: string; conversation_id: string | null
  seq: string | number; trigger_client_msg_no: string | null; goal: string; initiator_agent_id: string | null
  status: ArtifactWorkspaceStatus; origin: string; summary: string | null
  created_by: string; authorization_user_id: string | null; created_at: string; updated_at: string
}

export interface AssignmentRow {
  id: string; artifact_id: string; agent_id: string; assignment: string; color: string
  status: ArtifactAssignmentStatus; active_path: string | null; work_id: string | null
  result: string | null; error: string | null; started_at: string | null; completed_at: string | null
  updated_at: string; execution_role: ArtifactAssignmentExecutionRole; verifies_assignment_id: string | null
}

export interface ReportRow {
  id: string; artifact_id: string; assignment_id: string | null; author_agent_id: string
  execution_role: 'specialist' | 'verifier' | 'reporter'; schema_version: 'learning_report_v1'
  finding: string; evidence_id: string; source_evidence_ids: string[]; confidence: number | string; unresolved: string[]
  next_step: string | null; verifies_report_id: string | null; disconfirming_checks: string[]
  verdict: ArtifactReportVerdict | null; consumed_report_ids: string[]; conflict_resolution: unknown[]; created_at: string
}

export interface ActivityRow {
  id: string; artifact_id: string; path: string | null; actor_id: string
  actor_kind: ArtifactActorKind; action: string; detail: Record<string, unknown>; created_at: string
}
