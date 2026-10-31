import { createHash } from 'node:crypto'
import { publishArtifactProgress } from './progress.js'
import { artifactExecutionConversation } from './execution.js'
import type { AgentExecutionRole } from '../../agents/contracts.js'
import type { Queryable } from '../../db/queryable.js'
import type { ArtifactEvent } from '../../redis.js'
import { createEvidenceRecordInTransaction, createEvidenceWithLinksInTransaction } from '../evidence/public.js'
import { observeArtifactEvidence } from './evidence.js'
import type {
  ArtifactActivityKind,
  ArtifactActivity,
  ArtifactActorKind,
  ArtifactAssignmentReport,
  ArtifactEvidenceRef,
  ArtifactReportVerdict,
} from './contracts.js'
import type { ReportRow } from './repository.js'
import {
  assignmentVerifierId,
  artifactById,
  completeArtifactWorkState,
  insertReport,
  lockReportWork,
  missingEvidenceRefs,
  reportIdentity,
} from './repository.js'

type Transaction = <T>(work: (db: Queryable) => Promise<T>) => Promise<T>
type PublishArtifact = (
  companyId: string,
  event: Omit<ArtifactEvent, 'type' | 'companyId' | 'timestamp'>,
) => Promise<void>
type LogActivity = (input: {
  companyId: string; artifactId: string; actorId: string; actorKind: ArtifactActorKind
  action: ArtifactActivityKind; path?: string | null; detail?: Record<string, unknown>; idempotencyKey?: string
}) => Promise<ArtifactActivity>

export interface ArtifactReportApplicationContext {
  db: Queryable
  transaction: Transaction
  toReport(row: ReportRow): ArtifactAssignmentReport
  publishArtifact: PublishArtifact
  publishAssignments(companyId: string, artifactId: string): Promise<void>
  logActivity: LogActivity
  missingChannelMessageIds(input: {
    companyId: string; actorId: string; channelId: string; messageIds: string[]
  }): Promise<string[]>
}

export function createArtifactReportApplication(context: ArtifactReportApplicationContext) {
  const { db, transaction, toReport, publishArtifact, publishAssignments, logActivity, missingChannelMessageIds } = context

function validateEvidenceRefShape(refs: ArtifactEvidenceRef[]): void {
  if (refs.length > 64) throw new Error('evidenceRefs may contain at most 64 items')
  for (const ref of refs) {
    if (!ref || typeof ref.id !== 'string' || !ref.id.trim()) throw new Error('every evidence reference requires an id')
  }
}

async function validateEvidenceRefs(client: Queryable, input: { companyId:string;artifactId:string;refs:ArtifactEvidenceRef[] }): Promise<void> {
  const missing = await missingEvidenceRefs(client, input)
  if (missing[0]) throw new Error(`evidence reference is outside the current Artifact scope: ${missing[0].kind}:${missing[0].id}`)
}

async function validateMessageEvidenceRefs(input: {
  companyId: string; artifactId: string; agentId: string; refs: ArtifactEvidenceRef[]
}): Promise<void> {
  const messageIds = input.refs.filter((ref) => ref.kind === 'message').map((ref) => ref.id)
  if (messageIds.length === 0) return
  const artifact = await artifactById(db, input.companyId, input.artifactId)
  const conversationId = artifact && artifactExecutionConversation(artifact)
  if (!conversationId) {
    throw new Error(`evidence reference is outside the current Artifact scope: message:${messageIds[0]}`)
  }
  const missing = await missingChannelMessageIds({
    companyId: input.companyId,
    actorId: input.agentId,
    channelId: conversationId,
    messageIds,
  })
  if (missing[0]) throw new Error(`evidence reference is outside the current Artifact scope: message:${missing[0]}`)
}

async function submitArtifactReport(input: {
  companyId:string;workId:string;agentId:string;artifactId:string;executionRole:AgentExecutionRole
  finding:string;evidenceRefs:ArtifactEvidenceRef[];confidence:number;unresolved?:string[];nextStep?:string
  verifiesReportId?:string;disconfirmingChecks?:string[];verdict?:ArtifactReportVerdict
  consumedReportIds?:string[];conflictResolution?:unknown[]
  principalId: string; requestVersion: number; actionId: string; signal?: AbortSignal
}): Promise<ArtifactAssignmentReport> {
  if (!['specialist','verifier'].includes(input.executionRole)) throw new Error('coordinator work cannot submit an assignment report')
  const confidence=Number(input.confidence)
  if (!Number.isFinite(confidence)||confidence<0||confidence>1) throw new Error('confidence must be between 0 and 1')
  const finding=input.finding.trim()
  if (!finding) throw new Error('finding is required')
  validateEvidenceRefShape(input.evidenceRefs)
  await validateMessageEvidenceRefs({
    companyId: input.companyId, artifactId: input.artifactId, agentId: input.agentId, refs: input.evidenceRefs,
  })
  return transaction(async (client) => {
    const work = await lockReportWork(client, {
      workId: input.workId, companyId: input.companyId, agentId: input.agentId, artifactId: input.artifactId,
    })
    if (!work||work.execution_role!==input.executionRole) throw new Error('report execution role does not match the current durable work item')
    if (work.principal_id !== input.principalId || Number(work.request_version) !== input.requestVersion) throw new Error('Artifact report request or principal changed')
    if (!work.project_id) throw new Error('Artifact report requires a Project scope')
    await validateEvidenceRefs(client,{companyId:input.companyId,artifactId:input.artifactId,refs:input.evidenceRefs})
    let verifiesReportId:string|null=null
    if (input.executionRole==='verifier') {
      if (!input.verifiesReportId||!input.verdict||!input.disconfirmingChecks?.length) throw new Error('verifier reports require a builder report, verdict and disconfirming checks')
      const source = await reportIdentity(client, input.companyId, input.artifactId, input.verifiesReportId)
      if (!source) throw new Error('verified report is outside the current Artifact')
      if (source.author_agent_id===input.agentId) throw new Error('builder and verifier must be different agents')
      if (source.execution_role !== 'specialist') throw new Error('verifier must check a specialist report')
      const verifiesAssignmentId = work.artifact_assignment_id
        ? await assignmentVerifierId(client,input.artifactId,work.artifact_assignment_id,input.agentId)
        : null
      if (!verifiesAssignmentId||verifiesAssignmentId!==source.assignment_id) throw new Error('verifier report does not match its assigned builder report')
      verifiesReportId=input.verifiesReportId
    } else if (input.verifiesReportId||input.verdict||input.disconfirmingChecks?.length) throw new Error('only verifier reports may set verification fields')
    const consumed=(input.consumedReportIds??[]).map(String)
    if (consumed.length || input.conflictResolution?.length) throw new Error('report aggregation is retired; reference evidence directly')
    const id=`report-${createHash('sha256').update(JSON.stringify([input.workId,input.requestVersion,input.actionId,'learning_report_v1'])).digest('hex').slice(0,28)}`
    const refs: ArtifactEvidenceRef[] = [...input.evidenceRefs, ...consumed.map(id => ({ kind: 'report' as const, id }))]
    const uniqueRefs = [...new Map(refs.map((ref) => [`${ref.kind}:${ref.id}`, ref])).values()]
    validateEvidenceRefShape(uniqueRefs)
    const sourceEvidenceIds: string[] = []
    for (const ref of uniqueRefs) {
      const observation = await observeArtifactEvidence(client, { companyId: input.companyId, projectId: work.project_id,
        artifactId: input.artifactId, conversationId: work.conversation_id, principalId: input.principalId, ...(input.signal ? { signal: input.signal } : {}) }, ref)
      const evidenceId = `evidence-${createHash('sha256').update(JSON.stringify([
        input.companyId, work.project_id, ref.kind, ref.id, observation,
      ])).digest('hex')}`
      await createEvidenceRecordInTransaction(client, {
        id: evidenceId,
        companyId: input.companyId,
        projectId: work.project_id,
        level: 'L1',
        derivation: 'OBSERVED',
        kind: 'ARTIFACT_SOURCE_REFERENCE',
        data: { sourceKind: ref.kind, sourceId: ref.id, observation: JSON.stringify(observation) },
        createdBy: { type: 'SYSTEM' },
      })
      sourceEvidenceIds.push(evidenceId)
    }
    const reportEvidenceId = `evidence-${id}`
    await createEvidenceWithLinksInTransaction(client, {
      id: reportEvidenceId,
      companyId: input.companyId,
      projectId: work.project_id,
      level: 'L2',
      derivation: 'OBSERVED',
      kind: 'ARTIFACT_REPORT',
      data: { reportId: id, artifactId: input.artifactId, executionRole: input.executionRole, workId: input.workId, requestVersion: input.requestVersion },
      createdBy: { type: 'AGENT', id: input.agentId },
    }, sourceEvidenceIds.map((targetId) => ({
      relation: 'DERIVED_FROM' as const,
      targetLevel: 'L1' as const,
      targetKind: 'EVIDENCE_RECORD' as const,
      targetId,
    })))
    return toReport(await insertReport(client, {
      id, companyId: input.companyId, artifactId: input.artifactId, assignmentId: work.artifact_assignment_id,
      agentId: input.agentId, executionRole: input.executionRole, finding,
      evidenceId: reportEvidenceId, sourceEvidenceIds,
      confidence, unresolved: input.unresolved ?? [], nextStep: input.nextStep?.trim() || null,
      verifiesReportId, disconfirmingChecks: input.disconfirmingChecks ?? [], verdict: input.verdict ?? null,
      consumedReportIds: consumed, conflictResolution: input.conflictResolution ?? [],
      workId: input.workId, requestVersion: input.requestVersion,
    }))
  })
}

async function completeArtifactWork(input: {
  workId: string; companyId: string; status: 'completed' | 'failed' | 'cancelled'; resultText?: string; error?: string
}): Promise<void> {
  const state = await transaction(async client => {
    const state = await completeArtifactWorkState(client, input)
    if (state.artifactId) await publishArtifactProgress(client,input.companyId,state.artifactId)
    return state
  })
  if (!state.artifactId) return
  if (state.workspace) {
    await publishArtifact(input.companyId, {
      kind: 'workspace.updated',
      artifactId: state.artifactId,
      conversationId: state.workspace.conversation_id ?? undefined,
      workspace: {
        id: state.artifactId,
        status: state.workspace.status,
        title: state.workspace.title,
        goal: state.workspace.goal,
      },
    })
    return
  }
  await publishAssignments(input.companyId, state.artifactId)
  if (state.completion) {
    await logActivity({
      companyId: input.companyId,
      artifactId: state.artifactId,
      actorId: state.completion.agentId,
      actorKind: 'agent',
      path: state.completion.path,
      action: state.completion.status === 'completed'
        ? 'task_completed'
        : state.completion.status === 'failed' ? 'task_failed' : 'task_cancelled',
      detail: { status: state.completion.status, result: input.resultText, error: input.error },
    })
  }
  const artifact = await artifactById(db, input.companyId, state.artifactId)
  if (artifact) {
    await publishArtifact(input.companyId, {
      kind: 'workspace.updated',
      artifactId: state.artifactId,
      conversationId: artifactExecutionConversation(artifact) ?? undefined,
      workspace: { id: state.artifactId, status: artifact.status, title: artifact.title, goal: artifact.goal },
    })
  }
}
  return { completeArtifactWork, submitArtifactReport }
}
