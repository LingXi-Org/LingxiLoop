import { createHash, randomUUID } from 'node:crypto'
import { publishArtifactProgress } from './progress.js'
import type { Queryable } from '../../db/queryable.js'
import type { ArtifactEvent } from '../../redis.js'
import type { ArtifactExecution, ArtifactRunRow } from './execution.js'
import {
  parseArtifactActivityKind,
  type ArtifactActivity,
  type ArtifactAssignmentReport,
  type ArtifactMemberInput,
  type ArtifactSnapshot,
  type ArtifactSummary,
} from './contracts.js'
import { insertArtifactMembers, toAssignment } from './assignments-application.js'
import { artifactKind, type ArtifactKind } from './kinds.js'
import { listing, publish } from './store.js'
import {
  ensureConversationDesignId,
  insertActivity,
  insertArtifact,
  listArtifactRows,
  listAssignments,
  snapshotRows,
  startAgentWorkspace,
  stopArtifactWorkspaceState,
  type ArtifactRow,
  type ReportRow,
} from './repository.js'

type Transaction = <T>(work: (db: Queryable) => Promise<T>) => Promise<T>
type PublishArtifact = (
  companyId: string,
  event: Omit<ArtifactEvent, 'type' | 'companyId' | 'timestamp'>,
) => Promise<void>

export interface ArtifactWorkspacesApplicationContext {
  db: Queryable
  execution: ArtifactExecution
  transaction: Transaction
  resolveArtifactRead(companyId: string, artifactId?: string, projectId?: string): Promise<ArtifactRow>
  toReport(row: ReportRow): ArtifactAssignmentReport
  publishArtifact: PublishArtifact
}

/** Writes the kind's empty index, as an artifact the upstream skill creates would carry. */
async function writeInitialIndex(db: Queryable, artifact: ArtifactRow, actorId: string) {
  const definition = artifactKind(artifact.kind)
  const index = definition.initialIndex(artifact.title, new Date().toISOString())
  await publish(db, definition, artifact.id, {
    [`project/${definition.indexFile}`]: { base64: Buffer.from(`${JSON.stringify(index, null, 2)}\n`).toString('base64'), contentType: 'application/json', ifMatch: null },
  }, actorId)
}

export function createArtifactWorkspacesApplication(context: ArtifactWorkspacesApplicationContext) {
  const { db, transaction, execution, resolveArtifactRead, toReport, publishArtifact } = context

  async function listArtifacts(input: {
    companyId: string; projectId: string; kind: ArtifactKind; readerId: string; conversationId?: string
  }): Promise<ArtifactSummary[]> {
    const rows = await listArtifactRows(db, input)
    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      title: row.title,
      projectId: row.project_id,
      conversationId: row.conversation_id,
      status: row.status,
      fileCount: Number(row.file_count),
      assignmentCount: Number(row.assignment_count),
      createdBy: row.created_by,
      updatedAt: row.updated_at,
      createdAt: row.created_at,
    }))
  }

  async function getArtifactSnapshot(
    companyId: string,
    artifactId?: string,
    projectId?: string,
  ): Promise<ArtifactSnapshot> {
    const artifact = await resolveArtifactRead(companyId, artifactId, projectId)
    const [snapshot, files] = await Promise.all([snapshotRows(db, artifact.id), listing(db, artifact.id)])
    return {
      id: artifact.id,
      kind: artifact.kind,
      title: artifact.title,
      companyId,
      projectId: artifact.project_id,
      conversationId: artifact.conversation_id,
      triggerClientMsgNo: artifact.trigger_client_msg_no,
      goal: artifact.goal,
      initiatorAgentId: artifact.initiator_agent_id,
      status: artifact.status,
      origin: artifact.origin,
      summary: artifact.summary,
      createdBy: artifact.created_by,
      createdAt: artifact.created_at,
      updatedAt: artifact.updated_at,
      ver: files.ver,
      seq: Number(artifact.seq),
      files: files.files,
      assignments: snapshot.assignments.map((row) => toAssignment(
        row,
        snapshot.dependencies
          .filter((item) => item.agent_id === row.agent_id)
          .map((item) => item.depends_on_agent_id),
      )),
      activity: snapshot.activity.map((row) => ({
        id: row.id,
        artifactId: row.artifact_id,
        path: row.path,
        actorId: row.actor_id,
        actorKind: row.actor_kind,
        action: parseArtifactActivityKind(row.action),
        detail: row.detail ?? {},
        createdAt: row.created_at,
      })),
      reports: snapshot.reports.map(toReport),
    }
  }

  /** The conversation's Design canvas: one per conversation, created with its index on first use. */
  async function ensureConversationDesign(companyId: string, conversationId: string, actorId: string): Promise<ArtifactSnapshot> {
    const id = `design-${createHash('sha256').update(`${companyId}:${conversationId}`).digest('hex').slice(0, 24)}`
    const ensured = await transaction(async (transactionDb) => {
      const row = await ensureConversationDesignId(transactionDb, { id, companyId, conversationId, actorId })
      if (!row) return null
      if (row.created) {
        const artifact = (await transactionDb.query<ArtifactRow>('SELECT * FROM artifacts WHERE id=$1', [row.id])).rows[0]
        await writeInitialIndex(transactionDb, artifact, actorId)
      }
      return row
    })
    if (!ensured) throw Object.assign(new Error('conversation not found'), { status: 404 })
    if (ensured.created) await publishArtifact(companyId, { kind: 'artifact.created', artifactId: ensured.id, artifactKind: 'design' })
    return getArtifactSnapshot(companyId, ensured.id)
  }

  /** A new Slides deck in a project, optionally made from a conversation. */
  async function createSlides(input: {
    companyId: string; projectId: string; conversationId: string | null; title: string; actorId: string
    origin: 'user' | 'agent_os'; idempotencyKey?: string
  }): Promise<ArtifactSnapshot> {
    const id = input.idempotencyKey
      ? `slides-${createHash('sha256').update(input.idempotencyKey).digest('hex').slice(0, 24)}`
      : `slides-${randomUUID()}`
    await transaction(async (transactionDb) => {
      const existing = await transactionDb.query('SELECT 1 FROM artifacts WHERE id=$1', [id])
      if (existing.rows[0]) return
      const artifact = await insertArtifact(transactionDb, { id, companyId: input.companyId, projectId: input.projectId,
        conversationId: input.conversationId, kind: 'slides', title: input.title.trim().slice(0, 200), actorId: input.actorId, origin: input.origin })
      await writeInitialIndex(transactionDb, artifact, input.actorId)
    })
    await publishArtifact(input.companyId, { kind: 'artifact.created', artifactId: id, artifactKind: 'slides' })
    return getArtifactSnapshot(input.companyId, id)
  }

  async function startArtifactWorkspace(input: {
    companyId: string
    artifactId: string
    initiatorAgentId: string
    conversationId: string
    triggerClientMsgNo: string
    title: string
    goal: string
    members: ArtifactMemberInput[]
    idempotencyKey: string
    authorizationUserId: string | null
  }): Promise<ArtifactSnapshot> {
    const created = await transaction(async (transactionDb) => {
      const artifact = await startAgentWorkspace(transactionDb, {
        artifactId: input.artifactId,
        companyId: input.companyId,
        title: input.title.trim().slice(0, 200) || 'Agent workspace',
        conversationId: input.conversationId,
        triggerClientMsgNo: input.triggerClientMsgNo,
        goal: input.goal.trim(),
        initiatorAgentId: input.initiatorAgentId,
        authorizationUserId: input.authorizationUserId,
      })
      if (!artifact) throw new Error('artifact workspace requires its conversation')
      const existing = await listAssignments(transactionDb, artifact.id)
      if (existing.length) throw new Error('Artifact already has assignments; continue its work through group mentions')
      await insertArtifactMembers(transactionDb, { artifact, members: input.members, existing })
      const activityId = `activity-${createHash('sha256').update(`${input.idempotencyKey}:workspace_started`).digest('hex').slice(0, 32)}`
      const row = await insertActivity(transactionDb, {
        id: activityId,
        artifactId: artifact.id,
        path: null,
        actorId: input.initiatorAgentId,
        actorKind: 'agent',
        action: 'workspace_started',
        detail: { title: artifact.title, goal: artifact.goal },
      })
      const activity: ArtifactActivity = {
        id: row.id,
        artifactId: row.artifact_id,
        path: row.path,
        actorId: row.actor_id,
        actorKind: row.actor_kind,
        action: parseArtifactActivityKind(row.action),
        detail: row.detail ?? {},
        createdAt: row.created_at,
      }
      return { artifactId: artifact.id, activity }
    })
    const snapshot = await getArtifactSnapshot(input.companyId, created.artifactId)
    await Promise.all([
      publishArtifact(input.companyId, {
        kind: 'workspace.started',
        artifactId: created.artifactId,
        conversationId: input.conversationId,
        workspace: {
          id: created.artifactId,
          title: snapshot.title,
          goal: snapshot.goal,
          status: snapshot.status,
          assignmentCount: snapshot.assignments.length,
        },
      }),
      publishArtifact(input.companyId, {
        kind: 'activity.created',
        artifactId: created.artifactId,
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

  async function stopArtifactWorkspace(input: { companyId: string; artifactId: string }): Promise<void> {
    await transaction(async transactionDb => {
      const artifact = await resolveArtifactRead(input.companyId, input.artifactId)
      const { rows } = await transactionDb.query<ArtifactRunRow>('SELECT * FROM artifact_agent_runs WHERE artifact_id=$1 AND company_id=$2', [input.artifactId,input.companyId])
      for (const run of rows) await execution.cancel(transactionDb, artifact, run.work_id)
      await stopArtifactWorkspaceState(transactionDb, input.companyId, input.artifactId)
      await publishArtifactProgress(transactionDb,input.companyId,input.artifactId)
    })
    await publishArtifact(input.companyId, {
      kind: 'workspace.updated',
      artifactId: input.artifactId,
      workspace: { id: input.artifactId, status: 'stopped' },
    })
  }

  return {
    createSlides,
    ensureConversationDesign,
    getArtifactSnapshot,
    listArtifacts,
    startArtifactWorkspace,
    stopArtifactWorkspace,
  }
}
