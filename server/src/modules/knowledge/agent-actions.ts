import { randomUUID } from 'node:crypto'
import { pool } from '../../db/pool.js'
import type { AgentWorkItem } from '../../agent-os/types.js'
import { storage } from '../../storage.js'
import { openNotebookClient, type OpenNotebookInsight, type OpenNotebookNote } from './provider.js'
import {
  MAX_SOURCE_BYTES,
  cancelKnowledgeSourceJob,
  deleteKnowledgeSource,
  enqueueKnowledgeSource,
  ensureProjectNotebook,
  isKnowledgeAttachmentMime,
  retrieveKnowledge,
  retryKnowledgeSource,
  validateKnowledgeUrl,
} from './runtime.js'

type LocalSource = {
  id: string
  title: string
  kind: string
  status: string
  external_source_id: string | null
  excluded: boolean
}

function agentSourceView(source: LocalSource): Record<string, unknown> {
  return {
    id: source.id,
    title: source.title,
    kind: source.kind,
    status: source.status,
    enabled: !source.excluded,
  }
}

function agentNoteView(note: OpenNotebookNote, id: string): Record<string, unknown> {
  return {
    id,
    title: note.title ?? null,
    content: note.content ?? null,
    noteType: note.note_type ?? null,
    created: note.created,
    updated: note.updated,
  }
}

function agentInsightView(insight: OpenNotebookInsight, id: string, sourceId: string): Record<string, unknown> {
  return {
    id,
    sourceId,
    insightType: insight.insight_type,
    content: insight.content,
    created: insight.created ?? null,
    updated: insight.updated ?? null,
  }
}

async function projectScope(work: AgentWorkItem): Promise<{ projectId: string; notebookId: string }> {
  const { rows } = await pool.query<{ project_id: string | null }>(
    `SELECT project_id FROM conversations WHERE id=$1 AND company_id=$2 AND kind='group'`, [work.channelId, work.companyId],
  )
  if (!rows[0]?.project_id) throw new Error('knowledge actions require a group workspace')
  return { projectId: rows[0].project_id, notebookId: await ensureProjectNotebook(rows[0].project_id, work.companyId) }
}

async function localSources(work: AgentWorkItem, projectId: string): Promise<LocalSource[]> {
  return (await pool.query<LocalSource>(
    `SELECT s.id, s.title, s.kind, s.status, s.external_source_id, (e.source_id IS NOT NULL) AS excluded
       FROM knowledge_sources s LEFT JOIN conversation_source_exclusions e ON e.source_id=s.id AND e.conversation_id=$1
      WHERE s.company_id=$2 AND s.project_id=$3 AND s.deleted_at IS NULL ORDER BY s.created_at DESC`,
    [work.channelId, work.companyId, projectId],
  )).rows
}

export async function listKnowledgeSourcesForAgent(work: AgentWorkItem): Promise<unknown[]> {
  const { projectId } = await projectScope(work)
  return (await localSources(work, projectId)).map(agentSourceView)
}

export async function getKnowledgeSourceForAgent(work: AgentWorkItem, sourceId: string): Promise<unknown> {
  const { projectId } = await projectScope(work)
  const { rows } = await pool.query(
    `SELECT id, title, kind, mime_type AS "mimeType", size_bytes AS "sizeBytes", original_url AS "originalUrl",
            status, stage, error, created_at AS "createdAt", updated_at AS "updatedAt",
            external_source_id AS "externalSourceId"
       FROM knowledge_sources WHERE id=$1 AND company_id=$2 AND project_id=$3 AND deleted_at IS NULL`,
    [sourceId, work.companyId, projectId],
  )
  if (!rows[0]) throw new Error('source not found in this workspace')
  const row = rows[0] as Record<string, unknown>
  const externalSourceId = typeof row.externalSourceId === 'string' ? row.externalSourceId : null
  delete row.externalSourceId
  const fullText = externalSourceId
    ? (await openNotebookClient.getSource(externalSourceId)).full_text ?? null
    : null
  return { ...row, fullText }
}

async function createAgentSource(work: AgentWorkItem, input: {
  kind: 'text' | 'url' | 'file'
  title: string
  text?: string
  url?: string
  storageKey?: string
  mime?: string
  size?: number
}): Promise<{ id: string; status: string }> {
  const { projectId } = await projectScope(work)
  const id = `ks-${randomUUID().slice(0, 16)}`
  const storageKey = input.text ? `knowledge-sources/${work.companyId}/${projectId}/${id}.txt` : input.storageKey
  if (input.text) await storage.put(storageKey!, Buffer.from(input.text, 'utf8'), 'text/plain')
  await pool.query(
    `INSERT INTO knowledge_sources
      (id, company_id, project_id, conversation_id, kind, title, mime_type, size_bytes, storage_key, original_url,
       status, stage, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'queued','queued',$11)`,
    [id, work.companyId, projectId, work.channelId, input.kind, input.title.slice(0, 200),
      input.mime ?? (input.kind === 'text' ? 'text/plain' : null), input.size ?? (input.text ? Buffer.byteLength(input.text) : 0),
      storageKey ?? null, input.url ?? null, work.agentId],
  )
  await enqueueKnowledgeSource(id)
  return { id, status: 'queued' }
}

export function addKnowledgeText(work: AgentWorkItem, input: { title: string; text: string }) {
  if (!input.text.trim()) throw new Error('text is required')
  if (Buffer.byteLength(input.text) > MAX_SOURCE_BYTES) throw new Error('source exceeds 25 MB')
  return createAgentSource(work, { kind: 'text', title: input.title, text: input.text })
}

export async function addKnowledgeUrl(work: AgentWorkItem, input: { title: string; url: string }) {
  return createAgentSource(work, { kind: 'url', title: input.title, url: await validateKnowledgeUrl(input.url) })
}

export function addKnowledgeFile(work: AgentWorkItem, input: { title: string; storageKey: string; mime: string; size: number }) {
  if (!input.storageKey.startsWith(`attachments/${work.companyId}/`)) throw new Error('only a tenant-scoped attachment from the current conversation can be added')
  if (!isKnowledgeAttachmentMime(input.mime, input.size)) throw new Error('unsupported knowledge attachment')
  return createAgentSource(work, { kind: 'file', ...input })
}

export function searchKnowledgeForAgent(work: AgentWorkItem, query: string, limit = 8) {
  return retrieveKnowledge({ conversationId: work.channelId, query, limit })
}

export async function askKnowledgeForAgent(work: AgentWorkItem, question: string): Promise<unknown> {
  const { projectId, notebookId } = await projectScope(work)
  const sources = await localSources(work, projectId)
  return openNotebookClient.ask({
    notebookId, question,
    sourceIds: sources.flatMap((source) => source.external_source_id && source.status === 'ready' ? [source.external_source_id] : []),
    excludedSourceIds: sources.flatMap((source) => source.external_source_id && source.excluded ? [source.external_source_id] : []),
  })
}

async function upsertNoteBindings(work: AgentWorkItem, projectId: string, notes: OpenNotebookNote[]) {
  for (const note of notes) await pool.query(
    `INSERT INTO knowledge_note_bindings (id, company_id, project_id, external_note_id, title, created_by)
     VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (external_note_id) DO UPDATE SET title=$5, updated_at=NOW()`,
    [`kn-${randomUUID().slice(0, 16)}`, work.companyId, projectId, note.id, note.title ?? '未命名笔记', work.agentId],
  )
  const { rows } = await pool.query<{ id: string; external_note_id: string }>(
    `SELECT id, external_note_id FROM knowledge_note_bindings WHERE company_id=$1 AND project_id=$2`, [work.companyId, projectId],
  )
  return new Map(rows.map((row) => [row.external_note_id, row.id]))
}

export async function listKnowledgeNotes(work: AgentWorkItem): Promise<unknown[]> {
  const { projectId, notebookId } = await projectScope(work)
  const notes = await openNotebookClient.listNotes(notebookId)
  const ids = await upsertNoteBindings(work, projectId, notes)
  return notes.flatMap((note) => {
    const id = ids.get(note.id)
    return id ? [agentNoteView(note, id)] : []
  })
}

async function resolveNote(work: AgentWorkItem, noteId: string): Promise<{ projectId: string; externalId: string }> {
  const { projectId } = await projectScope(work)
  const { rows } = await pool.query<{ external_note_id: string }>(
    `SELECT external_note_id FROM knowledge_note_bindings WHERE id=$1 AND company_id=$2 AND project_id=$3`, [noteId, work.companyId, projectId],
  )
  if (!rows[0]) throw new Error('note not found in this workspace')
  return { projectId, externalId: rows[0].external_note_id }
}

export async function createKnowledgeNote(work: AgentWorkItem, input: { title?: string; content: string }): Promise<unknown> {
  const { projectId, notebookId } = await projectScope(work)
  const note = await openNotebookClient.createNote({ notebookId, ...input })
  const ids = await upsertNoteBindings(work, projectId, [note])
  const id = ids.get(note.id)
  if (!id) throw new Error('failed to bind created note')
  return agentNoteView(note, id)
}

export async function getKnowledgeNote(work: AgentWorkItem, noteId: string): Promise<unknown> {
  const resolved = await resolveNote(work, noteId)
  return agentNoteView(await openNotebookClient.getNote(resolved.externalId), noteId)
}

export async function updateKnowledgeNote(work: AgentWorkItem, noteId: string, input: { title?: string; content?: string }): Promise<unknown> {
  const resolved = await resolveNote(work, noteId)
  return agentNoteView(await openNotebookClient.updateNote(resolved.externalId, input), noteId)
}

export async function deleteKnowledgeNote(work: AgentWorkItem, noteId: string): Promise<{ deleted: boolean }> {
  const resolved = await resolveNote(work, noteId)
  await openNotebookClient.deleteNote(resolved.externalId)
  await pool.query(`DELETE FROM knowledge_note_bindings WHERE id=$1 AND company_id=$2 AND project_id=$3`, [noteId, work.companyId, resolved.projectId])
  return { deleted: true }
}

async function resolveSource(work: AgentWorkItem, sourceId: string): Promise<{ projectId: string; externalId: string }> {
  const { projectId } = await projectScope(work)
  const { rows } = await pool.query<{ external_source_id: string }>(
    `SELECT external_source_id FROM knowledge_sources WHERE id=$1 AND company_id=$2 AND project_id=$3 AND deleted_at IS NULL`,
    [sourceId, work.companyId, projectId],
  )
  if (!rows[0]?.external_source_id) throw new Error('ready source not found in this workspace')
  return { projectId, externalId: rows[0].external_source_id }
}

async function upsertInsightBindings(work: AgentWorkItem, sourceId: string, insights: OpenNotebookInsight[]) {
  for (const insight of insights) await pool.query(
    `INSERT INTO knowledge_insight_bindings (id, company_id, source_id, external_insight_id)
     VALUES ($1,$2,$3,$4) ON CONFLICT (external_insight_id) DO NOTHING`,
    [`ki-${randomUUID().slice(0, 16)}`, work.companyId, sourceId, insight.id],
  )
  const { rows } = await pool.query<{ id: string; external_insight_id: string }>(
    `SELECT id, external_insight_id FROM knowledge_insight_bindings WHERE company_id=$1 AND source_id=$2`, [work.companyId, sourceId],
  )
  return new Map(rows.map((row) => [row.external_insight_id, row.id]))
}

export async function listKnowledgeInsights(work: AgentWorkItem, sourceId: string): Promise<unknown[]> {
  const source = await resolveSource(work, sourceId)
  const insights = await openNotebookClient.listInsights(source.externalId)
  const ids = await upsertInsightBindings(work, sourceId, insights)
  return insights.flatMap((insight) => {
    const id = ids.get(insight.id)
    return id ? [agentInsightView(insight, id, sourceId)] : []
  })
}

export async function createKnowledgeInsight(work: AgentWorkItem, sourceId: string, transformationName: string): Promise<unknown> {
  const source = await resolveSource(work, sourceId)
  const wanted = transformationName.trim().toLocaleLowerCase()
  const transformation = (await openNotebookClient.listTransformations()).find((item) =>
    item.name.toLocaleLowerCase() === wanted || item.title.toLocaleLowerCase() === wanted,
  )
  if (!transformation) throw new Error('configured Open Notebook transformation not found by name')
  const result = await openNotebookClient.createInsight(source.externalId, transformation.id)
  return { status: result.status, sourceId }
}

export async function deleteKnowledgeInsight(work: AgentWorkItem, insightId: string): Promise<{ deleted: boolean }> {
  const { projectId } = await projectScope(work)
  const { rows } = await pool.query<{ external_insight_id: string }>(
    `SELECT i.external_insight_id FROM knowledge_insight_bindings i JOIN knowledge_sources s ON s.id=i.source_id
      WHERE i.id=$1 AND i.company_id=$2 AND s.project_id=$3`, [insightId, work.companyId, projectId],
  )
  if (!rows[0]) throw new Error('insight not found in this workspace')
  await openNotebookClient.deleteInsight(rows[0].external_insight_id)
  await pool.query(`DELETE FROM knowledge_insight_bindings WHERE id=$1`, [insightId])
  return { deleted: true }
}

export async function updateKnowledgeInsight(work: AgentWorkItem, insightId: string, input: { insightType?: string; content?: string }): Promise<unknown> {
  const { projectId } = await projectScope(work)
  const { rows } = await pool.query<{ external_insight_id: string; source_id: string }>(
    `SELECT i.external_insight_id, i.source_id FROM knowledge_insight_bindings i JOIN knowledge_sources s ON s.id=i.source_id
      WHERE i.id=$1 AND i.company_id=$2 AND s.project_id=$3`, [insightId, work.companyId, projectId],
  )
  if (!rows[0]) throw new Error('insight not found in this workspace')
  const insight = await openNotebookClient.updateInsight(rows[0].external_insight_id, {
    ...(input.insightType ? { insight_type: input.insightType } : {}),
    ...(input.content ? { content: input.content } : {}),
  })
  return agentInsightView(insight, insightId, rows[0].source_id)
}

export async function startKnowledgeSourceChat(work: AgentWorkItem, sourceId: string, title?: string): Promise<unknown> {
  const source = await resolveSource(work, sourceId)
  const notebookId = await ensureProjectNotebook(source.projectId, work.companyId)
  const session = await openNotebookClient.createSourceChat(notebookId, source.externalId, title)
  const id = `kc-${randomUUID().slice(0, 16)}`
  await pool.query(
    `INSERT INTO knowledge_source_chat_sessions (id, company_id, project_id, source_id, agent_id, external_session_id)
     VALUES ($1,$2,$3,$4,$5,$6)`, [id, work.companyId, source.projectId, sourceId, work.agentId, session.id],
  )
  return { id, title: session.title, sourceId }
}

export async function sendKnowledgeSourceChatMessage(work: AgentWorkItem, sessionId: string, message: string): Promise<unknown> {
  const { projectId, notebookId } = await projectScope(work)
  const { rows } = await pool.query<{ external_session_id: string; external_source_id: string }>(
    `SELECT c.external_session_id, s.external_source_id FROM knowledge_source_chat_sessions c
       JOIN knowledge_sources s ON s.id=c.source_id
      WHERE c.id=$1 AND c.company_id=$2 AND c.project_id=$3 AND c.agent_id=$4 AND c.deleted_at IS NULL`,
    [sessionId, work.companyId, projectId, work.agentId],
  )
  if (!rows[0]?.external_source_id) throw new Error('source chat session not found')
  const result = await openNotebookClient.sendSourceChatMessage(notebookId, rows[0].external_source_id, rows[0].external_session_id, message)
  return { answer: result.answer }
}

export async function retryKnowledgeSourceForAgent(work: AgentWorkItem, sourceId: string): Promise<{ status: string }> {
  const { projectId } = await projectScope(work)
  // The service validates the local source against company + project before it
  // touches either the upstream Source or the ingestion job. This also lets an
  // Agent retry a failure that happened before Open Notebook returned an ID.
  await retryKnowledgeSource(sourceId, work.companyId, projectId)
  return { status: 'queued' }
}

export async function updateKnowledgeSourceForAgent(work: AgentWorkItem, sourceId: string, input: { title?: string; topics?: string[] }): Promise<unknown> {
  const source = await resolveSource(work, sourceId)
  const upstream = await openNotebookClient.updateSource(source.externalId, input)
  await pool.query(`UPDATE knowledge_sources SET title=COALESCE($2,title), updated_at=NOW() WHERE id=$1`, [sourceId, input.title ?? null])
  return { id: sourceId, title: upstream.title ?? null, topics: upstream.topics ?? [] }
}

export async function setKnowledgeSourceEnabled(work: AgentWorkItem, sourceId: string, enabled: boolean): Promise<{ enabled: boolean }> {
  await resolveSource(work, sourceId)
  if (enabled) await pool.query(`DELETE FROM conversation_source_exclusions WHERE conversation_id=$1 AND source_id=$2`, [work.channelId, sourceId])
  else await pool.query(
    `INSERT INTO conversation_source_exclusions (conversation_id, source_id, created_by) VALUES ($1,$2,$3)
     ON CONFLICT (conversation_id, source_id) DO NOTHING`, [work.channelId, sourceId, work.agentId],
  )
  return { enabled }
}

export async function unlinkKnowledgeSourceForAgent(work: AgentWorkItem, sourceId: string): Promise<{ unlinked: boolean }> {
  const { projectId, notebookId } = await projectScope(work)
  const { rows } = await pool.query<{ external_source_id: string | null }>(
    `SELECT external_source_id FROM knowledge_sources
      WHERE id=$1 AND company_id=$2 AND project_id=$3 AND deleted_at IS NULL`,
    [sourceId, work.companyId, projectId],
  )
  if (!rows[0]) throw new Error('source not found in this workspace')
  if (rows[0].external_source_id) await openNotebookClient.unlinkSource(notebookId, rows[0].external_source_id)
  await pool.query(`UPDATE knowledge_sources SET deleted_at=NOW(), updated_at=NOW() WHERE id=$1`, [sourceId])
  await cancelKnowledgeSourceJob(sourceId, '资料已在摄取完成前解除工作区关联')
  return { unlinked: true }
}

export async function deleteKnowledgeSourceForAgent(work: AgentWorkItem, sourceId: string): Promise<{ deleted: boolean }> {
  const { projectId } = await projectScope(work)
  await deleteKnowledgeSource(sourceId, work.companyId, projectId)
  return { deleted: true }
}
