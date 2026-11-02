import { z } from 'zod'
import type { AgentExecutionRole } from '../../agents/contracts.js'
import type { ArtifactKind } from './kinds.js'
import type { ListedFile } from './store.js'

export type ArtifactActorKind = 'user' | 'agent'
export type ArtifactWorkspaceStatus = 'active' | 'summarizing' | 'completed' | 'stopped' | 'failed'
export type ArtifactAssignmentStatus = 'queued' | 'blocked' | 'working' | 'waiting' | 'completed' | 'failed' | 'cancelled'
export type ArtifactAssignmentExecutionRole = Extract<AgentExecutionRole, 'specialist' | 'verifier'>
export type ArtifactReportVerdict = 'supported' | 'rejected' | 'inconclusive'
export const ARTIFACT_ACTIVITY_KINDS = ['workspace_started', 'workspace_updated', 'files_published', 'comment_created',
  'assignment_created', 'assignment_updated', 'handoff', 'task_completed', 'task_failed', 'task_cancelled'] as const
export type ArtifactActivityKind = typeof ARTIFACT_ACTIVITY_KINDS[number]
export const parseArtifactActivityKind = (value: string): ArtifactActivityKind =>
  (ARTIFACT_ACTIVITY_KINDS as readonly string[]).includes(value) ? value as ArtifactActivityKind : 'workspace_updated'

export interface ArtifactEvidenceRef {
  kind: 'file' | 'message' | 'document' | 'source' | 'attempt' | 'report'
  id: string
}

export interface ArtifactAssignmentReport {
  id: string
  artifactId: string
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
  verdict: ArtifactReportVerdict | null
  consumedReportIds: string[]
  conflictResolution: unknown[]
  createdAt: string
}

export interface ArtifactAgentAssignment {
  id: string
  artifactId: string
  agentId: string
  assignment: string
  color: string
  status: ArtifactAssignmentStatus
  activePath: string | null
  workId: string | null
  dependsOnAgentIds: string[]
  executionRole: ArtifactAssignmentExecutionRole
  verifiesAssignmentId: string | null
  result: string | null
  error: string | null
  startedAt: string | null
  completedAt: string | null
  updatedAt: string
}

export interface ArtifactActivity {
  id: string
  artifactId: string
  path: string | null
  actorId: string
  actorKind: ArtifactActorKind
  action: ArtifactActivityKind
  detail: Record<string, unknown>
  createdAt: string
}

export interface ArtifactSummary {
  id: string
  kind: ArtifactKind
  title: string
  projectId: string
  conversationId: string | null
  status: ArtifactWorkspaceStatus
  fileCount: number
  assignmentCount: number
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface ArtifactSnapshot extends Omit<ArtifactSummary, 'fileCount' | 'assignmentCount'> {
  companyId: string
  triggerClientMsgNo: string | null
  goal: string
  initiatorAgentId: string | null
  origin: string
  summary: string | null
  ver: string
  seq: number
  files: Record<string, ListedFile>
  assignments: ArtifactAgentAssignment[]
  activity: ArtifactActivity[]
  reports: ArtifactAssignmentReport[]
}

export interface ArtifactMemberInput {
  agentId: string
  assignment: string
  executionRole?: ArtifactAssignmentExecutionRole
  verifiesAgentId?: string
}

const identifierSchema = z.string().trim().min(1).max(240)
const titleSchema = z.string().trim().min(1).max(200)
/** A path under the artifact's `project/` folder; the kind's layout decides which ones are writable. */
const projectPathSchema = z.string().min(1).max(512).refine(path => !path.startsWith('/') && !path.includes('\\') && !path.split('/').includes('..'), 'invalid project path')

export const artifactCreateRequestSchema = z.object({ title: titleSchema }).strict()
export const artifactUpdateRequestSchema = z.object({ title: titleSchema }).strict()
export const artifactAssignmentRequestSchema = z.object({
  agentId: identifierSchema,
  assignment: z.string().trim().min(1).max(4_000),
}).strict()
export const artifactSteerRequestSchema = z.object({ text: z.string().trim().min(1).max(4_000) }).strict()

const memberSchema = z.object({ agentId: identifierSchema, assignment: z.string().trim().min(1).max(4_000),
  executionRole: z.enum(['specialist','verifier']).optional(),
  verifiesAgentId: identifierSchema.optional() }).strict()
const reportStrings = z.array(z.string().trim().min(1).max(4_000)).max(32)
const reportSchema = z.object({ finding: z.string().trim().min(1).max(16_000),
  evidenceRefs: z.array(z.object({ kind: z.enum(['file','message','document','source','attempt','report']), id: identifierSchema }).strict()).max(64),
  confidence: z.number().min(0).max(1), unresolved: reportStrings.optional(), nextStep: z.string().trim().min(1).max(4_000).optional(),
}).strict()
const reportFits = (value: unknown) => Buffer.byteLength(JSON.stringify(value)) <= 32_768
/** Slides tools may name one deck of this conversation; design always uses the conversation's canvas. */
const target = { artifactId: identifierSchema.optional() }

export const agentArtifactSchemas = {
  current: z.object({ ...target }).strict(),
  create: z.object({ title: titleSchema }).strict(),
  read_file: z.object({ ...target, path: projectPathSchema }).strict(),
  write_files: z.object({ ...target, files: z.record(projectPathSchema, z.union([
    z.object({ content: z.string().max(4 * 1024 * 1024), ifMatch: z.string().regex(/^[0-9a-f]{64}$/).nullable().optional() }).strict(),
    z.object({ delete: z.literal(true), ifMatch: z.string().regex(/^[0-9a-f]{64}$/).optional() }).strict(),
  ])).refine(files => Object.keys(files).length >= 1 && Object.keys(files).length <= 32, 'write 1 to 32 files') }).strict(),
  edit_file: z.object({ ...target, path: projectPathSchema, oldString: z.string().min(1).max(256 * 1024),
    newString: z.string().max(256 * 1024), replaceAll: z.boolean().optional() }).strict(),
  import_asset: z.object({ ...target, attachmentId: z.string().min(1).max(2000) }).strict(),
  check: z.object({ ...target }).strict(),
  read_reference: z.object({ page: z.string().regex(/^[a-z0-9-]+\.(md|json)$/) }).strict(),
  design_systems: z.object({ ...target }).strict(),
  install_design_system: z.object({ ...target, namespace: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/), title: titleSchema,
    source: z.string().min(1).max(1000), version: z.string().max(100).optional(),
    files: z.record(z.string().regex(/^(?!.*(?:^|\/)\.\.?\/)[a-zA-Z0-9_./-]+\.(?:json|css|html|md)$/), z.string().max(2 * 1024 * 1024))
      .refine(files => Object.keys(files).length > 0 && Object.keys(files).length <= 30, 'install 1 to 30 text files'),
    ifMatch: z.string().regex(/^[0-9a-f]{64}$/),
  }).strict(),
  comments: z.object({ ...target, all: z.boolean().optional() }).strict(),
  comment_reply: z.object({ ...target, commentId: z.string().min(1).max(64), text: z.string().trim().min(1).max(10_000), resolve: z.boolean().optional() }).strict(),
  comment_resolve: z.object({ ...target, commentId: z.string().min(1).max(64), reopen: z.boolean().optional() }).strict(),
  available_agents: z.object({}).strict(),
  start_workspace: z.object({ ...target, title: titleSchema, goal: z.string().trim().min(1).max(8_000),
    members: z.array(memberSchema).min(1).max(32) }).strict(),
  stop_workspace: z.object({ ...target }).strict(),
  stop_assignment: z.object({ ...target, agentId: identifierSchema }).strict(),
  submit_report: reportSchema.extend(target).strict().refine(reportFits, 'report exceeds 32768 bytes'),
  submit_verification: reportSchema.extend({ ...target, verifiesReportId: identifierSchema,
    disconfirmingChecks: reportStrings.min(1), verdict: z.enum(['supported','rejected','inconclusive']),
  }).strict().refine(reportFits, 'report exceeds 32768 bytes'),
}

export const artifactStateUpdateSchema = z.object({ operationId: z.string().min(1).max(200),changes: z.array(z.union([
  z.object({ field: z.string().min(1).max(200),expectedVersion: z.number().int().nonnegative(),value: z.unknown() }).strict(),
  z.object({ field: z.string().min(1).max(200),expectedVersion: z.number().int().nonnegative(),delete: z.literal(true) }).strict(),
])).min(1).max(64) }).strict()

export const artifactCollaborationQuerySchema = z.object({ afterSeq: z.coerce.number().int().nonnegative().safe().default(0) }).strict()
