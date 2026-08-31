import { createHash } from 'node:crypto'
import { parseCanvasActivityKind } from '../../../../src/lib/canvasEventKinds.js'
import type { Queryable } from '../../db/queryable.js'
import type { CanvasEvent } from '../../redis.js'
import type {
  CanvasActivity,
  CanvasAssignmentReport,
  CanvasMemberInput,
  CanvasSnapshot,
  CanvasWorkspaceSummary,
} from './contracts.js'
import { insertCanvasMembers, toAssignment } from './assignments-application.js'
import { toFrame } from './frames-application.js'
import {
  conversationCanvasId,
  ensureConversationCanvasId,
  insertActivity,
  insertAgentWorkspace,
  listAssignments,
  listWorkspaceRows,
  snapshotRows,
  stopCanvasWorkspaceState,
  type CanvasRow,
  type ReportRow,
} from './repository.js'

type Transaction = <T>(work: (db: Queryable) => Promise<T>) => Promise<T>
type PublishCanvas = (
  companyId: string,
  event: Omit<CanvasEvent, 'type' | 'companyId' | 'timestamp'>,
) => Promise<void>

export interface CanvasWorkspacesApplicationContext {
  db: Queryable
  transaction: Transaction
  resolveCanvasRead(companyId: string, canvasId?: string, projectId?: string): Promise<CanvasRow>
  toReport(row: ReportRow): CanvasAssignmentReport
  publishCanvas: PublishCanvas
}

export function createCanvasWorkspacesApplication(context: CanvasWorkspacesApplicationContext) {
  const { db, transaction, resolveCanvasRead, toReport, publishCanvas } = context

  async function listCanvasWorkspaces(
    companyId: string,
    conversationId?: string,
    projectId?: string,
  ): Promise<CanvasWorkspaceSummary[]> {
    const rows = await listWorkspaceRows(db, companyId, conversationId, projectId)
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      goal: row.goal,
      conversationId: row.conversation_id,
      initiatorAgentId: row.initiator_agent_id,
      status: row.status,
      origin: row.origin,
      frameCount: Number(row.frame_count),
      assignmentCount: Number(row.assignment_count),
      updatedAt: row.updated_at,
      createdAt: row.created_at,
    }))
  }

  async function getCanvasSnapshot(
    companyId: string,
    actorId: string,
    canvasId?: string,
    projectId?: string,
  ): Promise<CanvasSnapshot> {
    void actorId
    const canvas = await resolveCanvasRead(companyId, canvasId, projectId)
    const snapshot = await snapshotRows(db, canvas.id)
    return {
      id: canvas.id,
      title: canvas.title,
      companyId,
      projectId: canvas.project_id,
      conversationId: canvas.conversation_id,
      triggerClientMsgNo: canvas.trigger_client_msg_no,
      goal: canvas.goal,
      initiatorAgentId: canvas.initiator_agent_id,
      status: canvas.status,
      origin: canvas.origin,
      summary: canvas.summary,
      createdBy: canvas.created_by,
      createdAt: canvas.created_at,
      updatedAt: canvas.updated_at,
      frames: snapshot.frames.map(toFrame),
      assignments: snapshot.assignments.map((row) => toAssignment(
        row,
        snapshot.dependencies
          .filter((item) => item.agent_id === row.agent_id)
          .map((item) => item.depends_on_agent_id),
      )),
      presence: snapshot.presence.map((row) => ({
        participantId: row.participant_id,
        participantKind: row.participant_kind,
        status: row.status,
        frameId: row.frame_id,
        color: row.color,
        cursorX: row.cursor_x === null ? null : Number(row.cursor_x),
        cursorY: row.cursor_y === null ? null : Number(row.cursor_y),
        lastSeenAt: row.last_seen_at,
      })),
      comments: snapshot.comments.map((row) => ({
        id: row.id,
        canvasId: row.canvas_id,
        frameId: row.frame_id,
        authorId: row.author_id,
        authorKind: row.author_kind,
        body: row.body,
        createdAt: row.created_at,
      })),
      activity: snapshot.activity.map((row) => ({
        id: row.id,
        canvasId: row.canvas_id,
        frameId: row.frame_id,
        actorId: row.actor_id,
        actorKind: row.actor_kind,
        action: parseCanvasActivityKind(row.action),
        detail: row.detail ?? {},
        createdAt: row.created_at,
      })),
      reports: snapshot.reports.map(toReport),
    }
  }

  async function ensureConversationCanvas(
    companyId: string,
    conversationId: string,
    actorId: string,
  ): Promise<CanvasSnapshot> {
    const id = stableCanvasId(`${companyId}:${conversationId}`)
    const canvasId = await ensureConversationCanvasId(db, { id, companyId, conversationId, actorId })
    if (!canvasId) throw Object.assign(new Error('conversation not found'), { status: 404 })
    return getCanvasSnapshot(companyId, actorId, canvasId)
  }

  async function getConversationCanvas(
    companyId: string,
    conversationId: string,
    actorId: string,
  ): Promise<CanvasSnapshot | null> {
    const canvasId = await conversationCanvasId(db, companyId, conversationId)
    return canvasId ? getCanvasSnapshot(companyId, actorId, canvasId) : null
  }

  async function startCanvasWorkspace(input: {
    companyId: string
    initiatorAgentId: string
    conversationId: string
    triggerClientMsgNo: string
    title: string
    goal: string
    members: CanvasMemberInput[]
    idempotencyKey: string
    authorizationUserId: string | null
  }): Promise<CanvasSnapshot> {
    const id = `canvas-${createHash('sha256').update(input.idempotencyKey).digest('hex').slice(0, 28)}`
    const created = await transaction(async (transactionDb) => {
      const canvas = await insertAgentWorkspace(transactionDb, {
        id,
        companyId: input.companyId,
        title: input.title.trim().slice(0, 200) || 'Agent workspace',
        conversationId: input.conversationId,
        triggerClientMsgNo: input.triggerClientMsgNo,
        goal: input.goal.trim(),
        initiatorAgentId: input.initiatorAgentId,
        authorizationUserId: input.authorizationUserId,
      })
      if (!canvas) throw new Error('canvas requires a conversation')
      const existing = await listAssignments(transactionDb, canvas.id)
      if (existing.length === 0) {
        await insertCanvasMembers(transactionDb, { canvas, members: input.members, existing })
      }
      const activityId = `activity-${createHash('sha256').update(`${input.idempotencyKey}:workspace_started`).digest('hex').slice(0, 32)}`
      const row = await insertActivity(transactionDb, {
        id: activityId,
        canvasId: canvas.id,
        frameId: null,
        actorId: input.initiatorAgentId,
        actorKind: 'agent',
        action: 'workspace_started',
        detail: { title: canvas.title, goal: canvas.goal },
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
      return { canvasId: canvas.id, activity }
    })
    const snapshot = await getCanvasSnapshot(input.companyId, input.initiatorAgentId, created.canvasId)
    await Promise.all([
      publishCanvas(input.companyId, {
        kind: 'workspace.started',
        canvasId: created.canvasId,
        conversationId: input.conversationId,
        workspace: {
          id: created.canvasId,
          title: snapshot.title,
          goal: snapshot.goal,
          status: snapshot.status,
          assignmentCount: snapshot.assignments.length,
          frameCount: snapshot.frames.length,
        },
      }),
      publishCanvas(input.companyId, {
        kind: 'activity.created',
        canvasId: created.canvasId,
        activity: created.activity,
      }),
    ])
    return {
      ...snapshot,
      activity: [
        created.activity,
        ...snapshot.activity.filter((item) => item.id !== created.activity.id),
      ],
    }
  }

  async function stopCanvasWorkspace(input: { companyId: string; canvasId: string }): Promise<void> {
    await transaction((transactionDb) => stopCanvasWorkspaceState(
      transactionDb,
      input.companyId,
      input.canvasId,
    ))
    await publishCanvas(input.companyId, {
      kind: 'workspace.updated',
      canvasId: input.canvasId,
      workspace: { id: input.canvasId, status: 'stopped' },
    })
  }

  return {
    ensureConversationCanvas,
    getCanvasSnapshot,
    getConversationCanvas,
    listCanvasWorkspaces,
    startCanvasWorkspace,
    stopCanvasWorkspace,
  }
}

function stableCanvasId(companyId: string): string {
  return `canvas-${createHash('sha256').update(companyId).digest('hex').slice(0, 20)}`
}
