import { createHash, randomUUID } from 'node:crypto'
import { type CanvasActivityKind, parseCanvasActivityKind } from '../../../../src/lib/canvasEventKinds.js'
import type { CanvasEvent } from '../../redis.js'
import type {
  CanvasActivity,
  CanvasActorKind,
  CanvasAssignmentReport,
} from './contracts.js'
import {
  canvasEventScope,
  findCanvas,
  insertActivity,
  type CanvasRow,
  type ReportRow,
} from './repository.js'
import type { CanvasInfrastructure } from './infrastructure.js'
import { createCanvasAssignmentsApplication } from './assignments-application.js'
import { createCanvasCollaborationApplication } from './collaboration-application.js'
import { createCanvasFrameApplication } from './frames-application.js'
import { createCanvasReportApplication } from './reports-application.js'
import { createCanvasWorkspacesApplication } from './workspaces-application.js'

export function createCanvasApplication(infrastructure: CanvasInfrastructure) {
  const { db, transaction, withCanvasFence, publishEvent } = infrastructure

  async function publishCanvas(
    companyId: string,
    event: Omit<CanvasEvent, 'type' | 'companyId' | 'timestamp'>,
  ): Promise<void> {
    const scope = await canvasEventScope(db, companyId, event.canvasId)
    await publishEvent({
      type: 'canvas.changed',
      companyId,
      ...(scope?.conversation_id ? { conversationId: scope.conversation_id } : {}),
      ...(scope?.project_id ? { workspaceId: scope.project_id } : {}),
      timestamp: new Date().toISOString(),
      ...event,
    })
  }

  function toReport(row: ReportRow): CanvasAssignmentReport {
    return {
      id: row.id,
      canvasId: row.canvas_id,
      assignmentId: row.assignment_id,
      authorAgentId: row.author_agent_id,
      executionRole: row.execution_role,
      schemaVersion: row.schema_version,
      finding: row.finding,
      evidenceRefs: row.evidence_refs ?? [],
      confidence: Number(row.confidence),
      unresolved: row.unresolved ?? [],
      nextStep: row.next_step,
      verifiesReportId: row.verifies_report_id,
      disconfirmingChecks: row.disconfirming_checks ?? [],
      verdict: row.verdict,
      consumedReportIds: row.consumed_report_ids ?? [],
      conflictResolution: row.conflict_resolution ?? [],
      createdAt: row.created_at,
    }
  }

  async function requireCanvas(
    companyId: string,
    canvasId: string,
    projectId?: string,
  ): Promise<CanvasRow> {
    const row = await findCanvas(db, companyId, canvasId, projectId)
    if (!row) throw new Error('canvas not found')
    return row
  }

  async function resolveCanvas(
    companyId: string,
    _actorId: string,
    canvasId?: string,
    projectId?: string,
  ): Promise<CanvasRow> {
    if (!canvasId) throw new Error('canvasId is required')
    return requireCanvas(companyId, canvasId, projectId)
  }

  async function resolveCanvasRead(
    companyId: string,
    canvasId?: string,
    projectId?: string,
  ): Promise<CanvasRow> {
    if (!canvasId) throw new Error('canvasId is required')
    return requireCanvas(companyId, canvasId, projectId)
  }

  async function logActivity(input: {
    companyId: string
    canvasId: string
    actorId: string
    actorKind: CanvasActorKind
    action: CanvasActivityKind
    frameId?: string | null
    detail?: Record<string, unknown>
    idempotencyKey?: string
  }): Promise<CanvasActivity> {
    const id = input.idempotencyKey
      ? `activity-${createHash('sha256').update(input.idempotencyKey).digest('hex').slice(0, 32)}`
      : `activity-${randomUUID()}`
    const row = await insertActivity(db, {
      id,
      canvasId: input.canvasId,
      frameId: input.frameId ?? null,
      actorId: input.actorId,
      actorKind: input.actorKind,
      action: input.action,
      detail: input.detail ?? {},
    })
    const activity: CanvasActivity = {
      id: row.id,
      canvasId: row.canvas_id,
      frameId: row.frame_id,
      actorId: row.actor_id,
      actorKind: row.actor_kind,
      action: parseCanvasActivityKind(row.action),
      detail: row.detail ?? {},
      createdAt: row.created_at,
    }
    await publishCanvas(input.companyId, {
      kind: 'activity.created',
      canvasId: input.canvasId,
      activity,
    })
    return activity
  }

  const frameApplication = createCanvasFrameApplication({
    db,
    transaction,
    resolveCanvas,
    publishCanvas,
    logActivity,
  })

  const workspaceApplication = createCanvasWorkspacesApplication({
    db,
    transaction,
    resolveCanvasRead,
    toReport,
    publishCanvas,
  })

  const assignmentApplication = createCanvasAssignmentsApplication({
    db,
    transaction,
    withCanvasFence,
    getCanvasSnapshot: workspaceApplication.getCanvasSnapshot,
    publishCanvas,
    logActivity,
  })

  const collaborationApplication = createCanvasCollaborationApplication({
    db,
    resolveCanvas,
    requireFrame: frameApplication.requireFrame,
    publishCanvas,
    publishAssignments: assignmentApplication.publishAssignments,
    logActivity,
  })

  const reportApplication = createCanvasReportApplication({
    db,
    transaction,
    toReport,
    publishCanvas,
    publishAssignments: assignmentApplication.publishAssignments,
    logActivity,
  })

  return {
    addCanvasComment: collaborationApplication.addCanvasComment,
    addCanvasWorkspaceAgents: assignmentApplication.addCanvasWorkspaceAgents,
    appendCanvasFrameContent: frameApplication.appendCanvasFrameContent,
    assertCanvasWorkReportReady: reportApplication.assertCanvasWorkReportReady,
    assignCanvasWorkspaceWork: assignmentApplication.assignCanvasWorkspaceWork,
    completeCanvasWork: reportApplication.completeCanvasWork,
    createCanvasFrame: frameApplication.createCanvasFrame,
    deleteCanvasFrame: frameApplication.deleteCanvasFrame,
    ensureConversationCanvas: workspaceApplication.ensureConversationCanvas,
    getCanvasSnapshot: workspaceApplication.getCanvasSnapshot,
    getConversationCanvas: workspaceApplication.getConversationCanvas,
    handoffCanvasWork: assignmentApplication.handoffCanvasWork,
    listCanvasAvailableAgents: collaborationApplication.listCanvasAvailableAgents,
    listCanvasWorkspaces: workspaceApplication.listCanvasWorkspaces,
    setCanvasStatus: collaborationApplication.setCanvasStatus,
    startCanvasWorkspace: workspaceApplication.startCanvasWorkspace,
    steerCanvasAssignment: assignmentApplication.steerCanvasAssignment,
    stopCanvasAssignment: assignmentApplication.stopCanvasAssignment,
    stopCanvasWorkspace: workspaceApplication.stopCanvasWorkspace,
    submitCanvasReport: reportApplication.submitCanvasReport,
    updateCanvasFrame: frameApplication.updateCanvasFrame,
  }
}
