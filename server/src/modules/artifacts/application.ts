import { createHash, randomUUID } from 'node:crypto'
import type { ArtifactEvent } from '../../redis.js'
import { createArtifactAssignmentsApplication } from './assignments-application.js'
import { createArtifactCollaborationApplication } from './collaboration-application.js'
import {
  parseArtifactActivityKind,
  type ArtifactActivity,
  type ArtifactActivityKind,
  type ArtifactActorKind,
  type ArtifactAssignmentReport,
} from './contracts.js'
import {
  addMessage, addThread, agentViews, canSendToAgent, editMessage, findThread, markDelivered, openThreads, pendingForAgent,
  readComments, sendToAgent, setStatus, updateComments, type CommentAuthor, type CommentsDoc, type NewThread,
} from './comments.js'
import type { ArtifactInfrastructure } from './infrastructure.js'
import { artifactKind } from './kinds.js'
import { createArtifactReportApplication } from './reports-application.js'
import {
  type ArtifactRow,
  artifactEventScope,
  findArtifact,
  insertActivity,
  type ReportRow,
} from './repository.js'
import { listing, publish, readProjectFile, type WireEntry } from './store.js'
import { createArtifactWorkspacesApplication } from './workspaces-application.js'

export function createArtifactApplication(infrastructure: ArtifactInfrastructure) {
  const { db, transaction, withArtifactFence, missingChannelMessageIds, publishEvent, deliverComment } = infrastructure

  async function publishArtifact(
    companyId: string,
    event: Omit<ArtifactEvent, 'type' | 'companyId' | 'timestamp'>,
  ): Promise<void> {
    const scope = await artifactEventScope(db, companyId, event.artifactId)
    await publishEvent({
      type: 'artifact.changed',
      companyId,
      ...(scope?.conversation_id ? { conversationId: scope.conversation_id } : {}),
      ...(scope?.project_id ? { workspaceId: scope.project_id } : {}),
      ...(scope ? { artifactKind: scope.kind } : {}),
      timestamp: new Date().toISOString(),
      ...event,
    })
  }

  function toReport(row: ReportRow): ArtifactAssignmentReport {
    return {
      id: row.id,
      artifactId: row.artifact_id,
      assignmentId: row.assignment_id,
      authorAgentId: row.author_agent_id,
      executionRole: row.execution_role,
      schemaVersion: row.schema_version,
      finding: row.finding,
      evidenceId: row.evidence_id,
      sourceEvidenceIds: row.source_evidence_ids ?? [],
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

  async function requireArtifact(companyId: string, artifactId: string, projectId?: string): Promise<ArtifactRow> {
    const row = await findArtifact(db, companyId, artifactId, projectId)
    if (!row) throw Object.assign(new Error('artifact not found'), { status: 404 })
    return row
  }

  async function resolveArtifactRead(companyId: string, artifactId?: string, projectId?: string): Promise<ArtifactRow> {
    if (!artifactId) throw new Error('artifactId is required')
    return requireArtifact(companyId, artifactId, projectId)
  }

  async function logActivity(input: {
    companyId: string
    artifactId: string
    actorId: string
    actorKind: ArtifactActorKind
    action: ArtifactActivityKind
    path?: string | null
    detail?: Record<string, unknown>
    idempotencyKey?: string
  }): Promise<ArtifactActivity> {
    const id = input.idempotencyKey
      ? `activity-${createHash('sha256').update(input.idempotencyKey).digest('hex').slice(0, 32)}`
      : `activity-${randomUUID()}`
    const row = await insertActivity(db, {
      id,
      artifactId: input.artifactId,
      path: input.path ?? null,
      actorId: input.actorId,
      actorKind: input.actorKind,
      action: input.action,
      detail: input.detail ?? {},
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
    await publishArtifact(input.companyId, { kind: 'activity.created', artifactId: input.artifactId, activity })
    return activity
  }

  /** One save from the editor page or an agent: the upstream publish, then one change event for open editors. */
  async function publishArtifactFiles(input: {
    companyId: string; artifactId: string; actorId: string; actorKind: ArtifactActorKind
    files: Record<string, WireEntry>; origin?: string
  }) {
    const artifact = await requireArtifact(input.companyId, input.artifactId)
    const outcome = await transaction(run => publish(run, artifactKind(artifact.kind), artifact.id, input.files, input.actorId))
    if (outcome.status === 200 && outcome.changed.length) {
      await publishArtifact(input.companyId, { kind: 'files.changed', artifactId: artifact.id, paths: outcome.changed,
        ver: outcome.body.version, ...(input.origin ? { origin: input.origin } : {}) })
      if (input.actorKind === 'agent') {
        await logActivity({ companyId: input.companyId, artifactId: artifact.id, actorId: input.actorId, actorKind: 'agent',
          action: 'files_published', path: outcome.changed[0], detail: { paths: outcome.changed, seq: outcome.body.seq } })
      }
    }
    return outcome
  }

  async function readArtifactFile(companyId: string, artifactId: string, path: string) {
    const artifact = await requireArtifact(companyId, artifactId)
    const [bytes, files] = await Promise.all([readProjectFile(db, artifactKind(artifact.kind), artifact.id, path), listing(db, artifact.id)])
    return bytes ? { path, sha256: files.files[path]?.sha256 ?? null, bytes } : null
  }

  /** Comments: the upstream service, with the agent hook replaced by a message to the conversation's agents. */
  async function changeComments<T>(companyId: string, artifactId: string, change: (doc: CommentsDoc, artifact: ArtifactRow) => T | Promise<T>) {
    const artifact = await requireArtifact(companyId, artifactId)
    const result = await transaction(run => updateComments(run, artifact.id, doc => change(doc, artifact)))
    await publishArtifact(companyId, { kind: 'comments.changed', artifactId: artifact.id })
    return { result, artifact }
  }

  async function deliverPending(companyId: string, artifact: ArtifactRow, author: { id: string; name: string }) {
    if (!artifact.conversation_id) return
    const delivered = await transaction(run => updateComments(run, artifact.id, async doc => {
      const pending = pendingForAgent(doc)
      if (!pending.length) return []
      const views = agentViews(doc, pending), now = new Date().toISOString()
      for (const thread of pending) markDelivered(thread, now, 'hook')
      return views
    }))
    for (const view of delivered) await deliverComment({ companyId, artifact, authorId: author.id, view })
    if (delivered.length) await publishArtifact(companyId, { kind: 'comments.changed', artifactId: artifact.id })
  }

  async function createComment(input: { companyId: string; artifactId: string; author: CommentAuthor & { id: string }; thread: NewThread }) {
    const artifact = await requireArtifact(input.companyId, input.artifactId)
    const definition = artifactKind(artifact.kind)
    const index = await readProjectFile(db, definition, artifact.id, `project/${definition.indexFile}`)
    const files = await listing(db, artifact.id)
    let location: Record<string, unknown> = {}
    try {
      location = definition.commentLocation(input.thread, index ? JSON.parse(index.toString('utf8')) : null, file => Boolean(files.files[file]))
    } catch { location = {} }
    const { result } = await changeComments(input.companyId, artifact.id, doc => addThread(doc, input.thread, location, input.author, new Date().toISOString()))
    if (input.thread.send) await deliverPending(input.companyId, artifact, input.author)
    return result
  }

  async function replyComment(input: { companyId: string; artifactId: string; author: CommentAuthor & { id: string }; commentId: string
    text: string; send?: boolean; resolve?: boolean }) {
    const { result, artifact } = await changeComments(input.companyId, input.artifactId, doc => {
      const thread = findThread(doc, input.commentId), now = new Date().toISOString()
      addMessage(thread, input.author, input.text, now)
      if (input.send && input.author.kind === 'user') sendToAgent(thread, now)
      if (input.resolve) setStatus(thread, 'resolved', now)
      return thread
    })
    if (input.send) await deliverPending(input.companyId, artifact, input.author)
    return result
  }

  async function editComment(input: { companyId: string; artifactId: string; author: CommentAuthor & { id: string }; commentId: string
    messageId: string; text: string; send?: boolean }) {
    const { result, artifact } = await changeComments(input.companyId, input.artifactId, doc => {
      const thread = findThread(doc, input.commentId), now = new Date().toISOString()
      editMessage(thread, input.messageId, input.text, now, input.author.id)
      if (input.send && canSendToAgent(thread)) sendToAgent(thread, now)
      return thread
    })
    if (input.send) await deliverPending(input.companyId, artifact, input.author)
    return result
  }

  async function sendComment(input: { companyId: string; artifactId: string; author: { id: string; name: string }; commentId: string }) {
    const { result, artifact } = await changeComments(input.companyId, input.artifactId, doc => {
      const thread = findThread(doc, input.commentId)
      if (!canSendToAgent(thread)) throw Object.assign(new Error('the agent already has everything in this comment'), { status: 409, code: 'NOTHING_TO_SEND' })
      sendToAgent(thread, new Date().toISOString())
      return thread
    })
    await deliverPending(input.companyId, artifact, input.author)
    return result
  }

  async function setCommentStatus(input: { companyId: string; artifactId: string; commentId: string; status: 'open' | 'resolved' }) {
    return (await changeComments(input.companyId, input.artifactId, doc => {
      const thread = findThread(doc, input.commentId)
      setStatus(thread, input.status, new Date().toISOString())
      return thread
    })).result
  }

  async function deleteComment(input: { companyId: string; artifactId: string; commentId: string }) {
    await changeComments(input.companyId, input.artifactId, doc => {
      const thread = findThread(doc, input.commentId)
      doc.threads.splice(doc.threads.indexOf(thread), 1)
    })
  }

  async function listComments(companyId: string, artifactId: string, all = false) {
    const artifact = await requireArtifact(companyId, artifactId)
    const doc = await readComments(db, artifact.id)
    return { doc, views: agentViews(doc, all ? doc.threads : openThreads(doc)) }
  }

  const workspaceApplication = createArtifactWorkspacesApplication({
    db,
    execution: infrastructure.execution,
    transaction,
    resolveArtifactRead,
    toReport,
    publishArtifact,
  })

  const assignmentApplication = createArtifactAssignmentsApplication({
    db,
    execution: infrastructure.execution,
    transaction,
    withArtifactFence,
    getArtifactSnapshot: workspaceApplication.getArtifactSnapshot,
    publishArtifact,
    logActivity,
  })

  const collaborationApplication = createArtifactCollaborationApplication({ db })

  const reportApplication = createArtifactReportApplication({
    db,
    transaction,
    toReport,
    publishArtifact,
    publishAssignments: assignmentApplication.publishAssignments,
    logActivity,
    missingChannelMessageIds,
  })

  async function renameArtifact(companyId: string, artifactId: string, title: string) {
    await requireArtifact(companyId, artifactId)
    await db.query('UPDATE artifacts SET title=$3,updated_at=NOW() WHERE id=$1 AND company_id=$2', [artifactId, companyId, title.trim().slice(0, 200)])
    await publishArtifact(companyId, { kind: 'artifact.updated', artifactId })
    return workspaceApplication.getArtifactSnapshot(companyId, artifactId)
  }

  async function deleteArtifact(companyId: string, artifactId: string) {
    const artifact = await requireArtifact(companyId, artifactId)
    await publishArtifact(companyId, { kind: 'artifact.deleted', artifactId })
    await transaction(async run => {
      const { rows } = await run.query<{ work_id: string }>('SELECT work_id FROM artifact_agent_runs WHERE artifact_id=$1', [artifact.id])
      for (const row of rows) await infrastructure.execution.cancel(run, artifact, row.work_id)
      await run.query('DELETE FROM artifacts WHERE id=$1 AND company_id=$2', [artifact.id, companyId])
    })
  }

  return {
    assignArtifactWorkspaceWork: assignmentApplication.assignArtifactWorkspaceWork,
    completeArtifactWork: reportApplication.completeArtifactWork,
    createComment,
    createSlides: workspaceApplication.createSlides,
    deleteArtifact,
    deleteComment,
    editComment,
    ensureConversationDesign: workspaceApplication.ensureConversationDesign,
    getArtifactSnapshot: workspaceApplication.getArtifactSnapshot,
    listArtifactAvailableAgents: collaborationApplication.listArtifactAvailableAgents,
    listArtifacts: workspaceApplication.listArtifacts,
    listComments,
    publishArtifactFiles,
    readArtifactFile,
    renameArtifact,
    replyComment,
    sendComment,
    setCommentStatus,
    startArtifactWorkspace: workspaceApplication.startArtifactWorkspace,
    stopArtifactAssignment: assignmentApplication.stopArtifactAssignment,
    stopArtifactWorkspace: workspaceApplication.stopArtifactWorkspace,
    submitArtifactReport: reportApplication.submitArtifactReport,
  }
}
