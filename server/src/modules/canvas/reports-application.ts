import { createHash } from 'node:crypto'
import type { CanvasActivityKind } from '../../../../src/lib/canvasEventKinds.js'
import type { AgentExecutionRole } from '../../agent-os/types.js'
import type { Queryable } from '../../db/queryable.js'
import type { CanvasEvent } from '../../redis.js'
import type {
  CanvasActivity,
  CanvasActorKind,
  CanvasAssignmentReport,
  CanvasEvidenceRef,
  CanvasReportVerdict,
} from './contracts.js'
import type { ReportRow } from './repository.js'
import {
  assignmentVerifierId,
  canvasById,
  completeCanvasWorkState,
  existingReportIds,
  insertReport,
  lockReportWork,
  missingEvidenceRefs,
  reportExists,
  reportIdentity,
  workReportContext,
} from './repository.js'

type Transaction = <T>(work: (db: Queryable) => Promise<T>) => Promise<T>
type PublishCanvas = (
  companyId: string,
  event: Omit<CanvasEvent, 'type' | 'companyId' | 'timestamp'>,
) => Promise<void>
type LogActivity = (input: {
  companyId: string; canvasId: string; actorId: string; actorKind: CanvasActorKind
  action: CanvasActivityKind; frameId?: string | null; detail?: Record<string, unknown>; idempotencyKey?: string
}) => Promise<CanvasActivity>

export interface CanvasReportApplicationContext {
  db: Queryable
  transaction: Transaction
  toReport(row: ReportRow): CanvasAssignmentReport
  publishCanvas: PublishCanvas
  publishAssignments(companyId: string, canvasId: string): Promise<void>
  logActivity: LogActivity
}

export function createCanvasReportApplication(context: CanvasReportApplicationContext) {
  const { db, transaction, toReport, publishCanvas, publishAssignments, logActivity } = context

async function validateEvidenceRefs(client: Queryable, input: { companyId:string;canvasId:string;refs:CanvasEvidenceRef[] }): Promise<void> {
  if (input.refs.length > 64) throw new Error('evidenceRefs may contain at most 64 items')
  for (const ref of input.refs) {
    if (!ref || typeof ref.id !== 'string' || !ref.id.trim()) throw new Error('every evidence reference requires an id')
  }
  const missing = await missingEvidenceRefs(client, input)
  if (missing[0]) throw new Error(`evidence reference is outside the current Canvas scope: ${missing[0].kind}:${missing[0].id}`)
}

async function submitCanvasReport(input: {
  companyId:string;workId:string;agentId:string;canvasId:string;executionRole:AgentExecutionRole
  finding:string;evidenceRefs:CanvasEvidenceRef[];confidence:number;unresolved?:string[];nextStep?:string
  verifiesReportId?:string;disconfirmingChecks?:string[];verdict?:CanvasReportVerdict
  consumedReportIds?:string[];conflictResolution?:unknown[]
}): Promise<CanvasAssignmentReport> {
  if (!['specialist','verifier','reporter'].includes(input.executionRole)) throw new Error('coordinator work cannot submit an assignment report')
  const confidence=Number(input.confidence)
  if (!Number.isFinite(confidence)||confidence<0||confidence>1) throw new Error('confidence must be between 0 and 1')
  const finding=input.finding.trim()
  if (!finding) throw new Error('finding is required')
  return transaction(async (client) => {
    const work = await lockReportWork(client, {
      workId: input.workId, companyId: input.companyId, agentId: input.agentId, canvasId: input.canvasId,
    })
    if (!work||work.execution_role!==input.executionRole) throw new Error('report execution role does not match the current durable work item')
    await validateEvidenceRefs(client,{companyId:input.companyId,canvasId:input.canvasId,refs:input.evidenceRefs})
    let verifiesReportId:string|null=null
    if (input.executionRole==='verifier') {
      if (!input.verifiesReportId||!input.verdict) throw new Error('verifier reports require verifiesReportId and verdict')
      const source = await reportIdentity(client, input.companyId, input.canvasId, input.verifiesReportId)
      if (!source) throw new Error('verified report is outside the current Canvas')
      if (source.author_agent_id===input.agentId) throw new Error('builder and verifier must be different agents')
      const verifiesAssignmentId = work.canvas_assignment_id
        ? await assignmentVerifierId(client,input.canvasId,work.canvas_assignment_id,input.agentId)
        : null
      if (!verifiesAssignmentId||verifiesAssignmentId!==source.assignment_id) throw new Error('verifier report does not match its assigned builder report')
      verifiesReportId=input.verifiesReportId
    } else if (input.verifiesReportId||input.verdict) throw new Error('only verifier reports may set verification fields')
    const consumed=(input.consumedReportIds??[]).map(String)
    if (input.executionRole==='reporter') {
      if (!consumed.length) throw new Error('reporter reports must consume at least one persisted report')
      const persisted = await existingReportIds(client,input.companyId,input.canvasId,consumed)
      if (new Set(persisted).size!==new Set(consumed).size) throw new Error('reporter consumed report is outside the current Canvas')
    } else if (consumed.length) throw new Error('only reporter reports may consume reportIds')
    const id=`report-${createHash('sha256').update(`${input.workId}:learning_report_v1`).digest('hex').slice(0,28)}`
    return toReport(await insertReport(client, {
      id, companyId: input.companyId, canvasId: input.canvasId, assignmentId: work.canvas_assignment_id,
      agentId: input.agentId, executionRole: input.executionRole, finding, evidenceRefs: input.evidenceRefs,
      confidence, unresolved: input.unresolved ?? [], nextStep: input.nextStep?.trim() || null,
      verifiesReportId, disconfirmingChecks: input.disconfirmingChecks ?? [], verdict: input.verdict ?? null,
      consumedReportIds: consumed, conflictResolution: input.conflictResolution ?? [],
    }))
  })
}

async function assertCanvasWorkReportReady(workId:string,companyId:string):Promise<void> {
  const work = await workReportContext(db, workId, companyId)
  if (!work?.canvas_id) return
  const ready = work.reason==='canvas_summary'
    ? await reportExists(db, { canvasId: work.canvas_id, reporter: true })
    : await reportExists(db, { assignmentId: work.canvas_assignment_id ?? undefined })
  if (!ready) throw new Error(work.reason==='canvas_summary'
    ? 'reporter work requires a learning_report_v1 submission before completion'
    : 'canvas worker requires a learning_report_v1 submission before completion')
}

async function completeCanvasWork(input: {
  workId: string; companyId: string; status: 'completed' | 'failed' | 'cancelled'; resultText?: string; error?: string
}): Promise<void> {
  const state = await transaction((client) => completeCanvasWorkState(client, input))
  if (!state.canvasId) return
  if (state.workspace) {
    await publishCanvas(input.companyId, {
      kind: 'workspace.updated',
      canvasId: state.canvasId,
      conversationId: state.workspace.conversation_id ?? undefined,
      workspace: {
        id: state.canvasId,
        status: state.workspace.status,
        title: state.workspace.title,
        goal: state.workspace.goal,
      },
    })
    return
  }
  await publishAssignments(input.companyId, state.canvasId)
  if (state.completion) {
    await logActivity({
      companyId: input.companyId,
      canvasId: state.canvasId,
      actorId: state.completion.agentId,
      actorKind: 'agent',
      frameId: state.completion.frameId,
      action: state.completion.status === 'completed'
        ? 'task_completed'
        : state.completion.status === 'failed' ? 'task_failed' : 'task_cancelled',
      detail: { status: state.completion.status, result: input.resultText, error: input.error },
    })
  }
  const canvas = await canvasById(db, input.companyId, state.canvasId)
  if (canvas) {
    await publishCanvas(input.companyId, {
      kind: 'workspace.updated',
      canvasId: state.canvasId,
      conversationId: canvas.conversation_id ?? undefined,
      workspace: { id: state.canvasId, status: canvas.status, title: canvas.title, goal: canvas.goal },
    })
  }
}
  return { assertCanvasWorkReportReady, completeCanvasWork, submitCanvasReport }
}

