import { randomUUID } from 'node:crypto'
import type { AgentWorkItem } from '../../agent-os/types.js'
import type { Queryable } from '../../db/queryable.js'
import type { Storage } from '../../storage.js'
import type { OpenNotebookClient, OpenNotebookInsight, OpenNotebookNote } from './provider.js'
import {
  deleteAgentInsightBinding,
  deleteAgentNoteBinding,
  findAgentInsightBinding,
  findAgentKnowledgeSource,
  findAgentNoteExternalId,
  findOwnedAgentSource,
  findAgentProjectId,
  findAgentSourceChat,
  findAgentSourceExternalId,
  insertAgentKnowledgeSource,
  insertAgentSourceChat,
  listAgentKnowledgeSources,
  setAgentSourceExcluded,
  softDeleteAgentSource,
  updateAgentSourceTitle,
  upsertAgentInsightBindings,
  upsertAgentNoteBindings,
  type AgentKnowledgeSourceRow,
} from './agent-repository.js'
import {
  cancelKnowledgeSourceJob,
  deleteKnowledgeSource,
  enqueueKnowledgeSource,
  ensureProjectNotebook,
  retrieveKnowledge,
  retryKnowledgeSource,
} from './runtime.js'
import { MAX_SOURCE_BYTES, isKnowledgeAttachmentMime, validateKnowledgeUrl } from './policy.js'

export interface KnowledgeAgentInfrastructure {
  storage: Pick<Storage, 'put'>
  provider: Pick<OpenNotebookClient,
    | 'getSource' | 'ask' | 'listNotes' | 'createNote' | 'getNote' | 'updateNote' | 'deleteNote'
    | 'listInsights' | 'listTransformations' | 'createInsight' | 'deleteInsight' | 'updateInsight'
    | 'createSourceChat' | 'sendSourceChatMessage' | 'updateSource' | 'unlinkSource'>
}

export function createKnowledgeAgentApplication(db: Queryable, infrastructure: KnowledgeAgentInfrastructure) {
const { provider, storage } = infrastructure

function agentSourceView(source: AgentKnowledgeSourceRow): Record<string, unknown> {
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
  const projectId = await findAgentProjectId(db, work.companyId, work.channelId)
  if (!projectId) throw new Error('knowledge actions require a group workspace')
  return { projectId, notebookId: await ensureProjectNotebook(projectId, work.companyId) }
}

async function localSources(work: AgentWorkItem, projectId: string): Promise<AgentKnowledgeSourceRow[]> {
  return listAgentKnowledgeSources(db, {
    companyId: work.companyId,
    projectId,
    conversationId: work.channelId,
  })
}

async function listKnowledgeSourcesForAgent(work: AgentWorkItem): Promise<unknown[]> {
  const { projectId } = await projectScope(work)
  return (await localSources(work, projectId)).map(agentSourceView)
}

async function getKnowledgeSourceForAgent(work: AgentWorkItem, sourceId: string): Promise<unknown> {
  const { projectId } = await projectScope(work)
  const row = await findAgentKnowledgeSource(db, { sourceId, companyId: work.companyId, projectId })
  if (!row) throw new Error('source not found in this workspace')
  const externalSourceId = typeof row.externalSourceId === 'string' ? row.externalSourceId : null
  delete row.externalSourceId
  const fullText = externalSourceId
    ? (await provider.getSource(externalSourceId)).full_text ?? null
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
  await insertAgentKnowledgeSource(db, {
    id,
    companyId: work.companyId,
    projectId,
    conversationId: work.channelId,
    kind: input.kind,
    title: input.title.slice(0, 200),
    mime: input.mime ?? (input.kind === 'text' ? 'text/plain' : null),
    size: input.size ?? (input.text ? Buffer.byteLength(input.text) : 0),
    storageKey: storageKey ?? null,
    originalUrl: input.url ?? null,
    agentId: work.agentId,
  })
  await enqueueKnowledgeSource(id)
  return { id, status: 'queued' }
}

function addKnowledgeText(work: AgentWorkItem, input: { title: string; text: string }) {
  if (!input.text.trim()) throw new Error('text is required')
  if (Buffer.byteLength(input.text) > MAX_SOURCE_BYTES) throw new Error('source exceeds 25 MB')
  return createAgentSource(work, { kind: 'text', title: input.title, text: input.text })
}

async function addKnowledgeUrl(work: AgentWorkItem, input: { title: string; url: string }) {
  return createAgentSource(work, { kind: 'url', title: input.title, url: await validateKnowledgeUrl(input.url) })
}

function addKnowledgeFile(work: AgentWorkItem, input: { title: string; storageKey: string; mime: string; size: number }) {
  if (!input.storageKey.startsWith(`attachments/${work.companyId}/`)) throw new Error('only a tenant-scoped attachment from the current conversation can be added')
  if (!isKnowledgeAttachmentMime(input.mime, input.size)) throw new Error('unsupported knowledge attachment')
  return createAgentSource(work, { kind: 'file', ...input })
}

function searchKnowledgeForAgent(work: AgentWorkItem, query: string, limit = 8) {
  return retrieveKnowledge({ companyId: work.companyId, conversationId: work.channelId, query, limit })
}

async function askKnowledgeForAgent(work: AgentWorkItem, question: string): Promise<unknown> {
  const { projectId, notebookId } = await projectScope(work)
  const sources = await localSources(work, projectId)
  return provider.ask({
    notebookId, question,
    sourceIds: sources.flatMap((source) => source.external_source_id && source.status === 'ready' ? [source.external_source_id] : []),
    excludedSourceIds: sources.flatMap((source) => source.external_source_id && source.excluded ? [source.external_source_id] : []),
  })
}

async function upsertNoteBindings(work: AgentWorkItem, projectId: string, notes: OpenNotebookNote[]) {
  return upsertAgentNoteBindings(db, {
    companyId: work.companyId,
    projectId,
    agentId: work.agentId,
    bindings: notes.map((note) => ({
      id: `kn-${randomUUID().slice(0, 16)}`,
      externalId: note.id,
      title: note.title ?? '未命名笔记',
    })),
  })
}

async function listKnowledgeNotes(work: AgentWorkItem): Promise<unknown[]> {
  const { projectId, notebookId } = await projectScope(work)
  const notes = await provider.listNotes(notebookId)
  const ids = await upsertNoteBindings(work, projectId, notes)
  return notes.flatMap((note) => {
    const id = ids.get(note.id)
    return id ? [agentNoteView(note, id)] : []
  })
}

async function resolveNote(work: AgentWorkItem, noteId: string): Promise<{ projectId: string; externalId: string }> {
  const { projectId } = await projectScope(work)
  const externalId = await findAgentNoteExternalId(db, { noteId, companyId: work.companyId, projectId })
  if (!externalId) throw new Error('note not found in this workspace')
  return { projectId, externalId }
}

async function createKnowledgeNote(work: AgentWorkItem, input: { title?: string; content: string }): Promise<unknown> {
  const { projectId, notebookId } = await projectScope(work)
  const note = await provider.createNote({ notebookId, ...input })
  const ids = await upsertNoteBindings(work, projectId, [note])
  const id = ids.get(note.id)
  if (!id) throw new Error('failed to bind created note')
  return agentNoteView(note, id)
}

async function getKnowledgeNote(work: AgentWorkItem, noteId: string): Promise<unknown> {
  const resolved = await resolveNote(work, noteId)
  return agentNoteView(await provider.getNote(resolved.externalId), noteId)
}

async function updateKnowledgeNote(work: AgentWorkItem, noteId: string, input: { title?: string; content?: string }): Promise<unknown> {
  const resolved = await resolveNote(work, noteId)
  return agentNoteView(await provider.updateNote(resolved.externalId, input), noteId)
}

async function deleteKnowledgeNote(work: AgentWorkItem, noteId: string): Promise<{ deleted: boolean }> {
  const resolved = await resolveNote(work, noteId)
  await provider.deleteNote(resolved.externalId)
  await deleteAgentNoteBinding(db, { noteId, companyId: work.companyId, projectId: resolved.projectId })
  return { deleted: true }
}

async function resolveSource(work: AgentWorkItem, sourceId: string): Promise<{ projectId: string; externalId: string }> {
  const { projectId } = await projectScope(work)
  const externalId = await findAgentSourceExternalId(db, { sourceId, companyId: work.companyId, projectId })
  if (!externalId) throw new Error('ready source not found in this workspace')
  return { projectId, externalId }
}

async function resolveOwnedSource(work: AgentWorkItem, sourceId: string): Promise<{ projectId: string; externalId: string }> {
  const { projectId } = await projectScope(work)
  const source = await findOwnedAgentSource(db, { sourceId, companyId: work.companyId, projectId })
  if (!source?.externalSourceId) throw new Error('ready owned source not found in this workspace')
  return { projectId, externalId: source.externalSourceId }
}

async function upsertInsightBindings(work: AgentWorkItem, sourceId: string, insights: OpenNotebookInsight[]) {
  return upsertAgentInsightBindings(db, {
    companyId: work.companyId,
    sourceId,
    bindings: insights.map((insight) => ({ id: `ki-${randomUUID().slice(0, 16)}`, externalId: insight.id })),
  })
}

async function listKnowledgeInsights(work: AgentWorkItem, sourceId: string): Promise<unknown[]> {
  const source = await resolveSource(work, sourceId)
  const insights = await provider.listInsights(source.externalId)
  const ids = await upsertInsightBindings(work, sourceId, insights)
  return insights.flatMap((insight) => {
    const id = ids.get(insight.id)
    return id ? [agentInsightView(insight, id, sourceId)] : []
  })
}

async function createKnowledgeInsight(work: AgentWorkItem, sourceId: string, transformationName: string): Promise<unknown> {
  const source = await resolveOwnedSource(work, sourceId)
  const wanted = transformationName.trim().toLocaleLowerCase()
  const transformation = (await provider.listTransformations()).find((item) =>
    item.name.toLocaleLowerCase() === wanted || item.title.toLocaleLowerCase() === wanted,
  )
  if (!transformation) throw new Error('configured Open Notebook transformation not found by name')
  const result = await provider.createInsight(source.externalId, transformation.id)
  return { status: result.status, sourceId }
}

async function deleteKnowledgeInsight(work: AgentWorkItem, insightId: string): Promise<{ deleted: boolean }> {
  const { projectId } = await projectScope(work)
  const binding = await findAgentInsightBinding(db, { insightId, companyId: work.companyId, projectId })
  if (!binding) throw new Error('insight not found in this workspace')
  await provider.deleteInsight(binding.externalId)
  await deleteAgentInsightBinding(db, { insightId, companyId: work.companyId, projectId })
  return { deleted: true }
}

async function updateKnowledgeInsight(work: AgentWorkItem, insightId: string, input: { insightType?: string; content?: string }): Promise<unknown> {
  const { projectId } = await projectScope(work)
  const binding = await findAgentInsightBinding(db, { insightId, companyId: work.companyId, projectId })
  if (!binding) throw new Error('insight not found in this workspace')
  const insight = await provider.updateInsight(binding.externalId, {
    ...(input.insightType ? { insight_type: input.insightType } : {}),
    ...(input.content ? { content: input.content } : {}),
  })
  return agentInsightView(insight, insightId, binding.sourceId)
}

async function startKnowledgeSourceChat(work: AgentWorkItem, sourceId: string, title?: string): Promise<unknown> {
  const source = await resolveSource(work, sourceId)
  const notebookId = await ensureProjectNotebook(source.projectId, work.companyId)
  const session = await provider.createSourceChat(notebookId, source.externalId, title)
  const id = `kc-${randomUUID().slice(0, 16)}`
  await insertAgentSourceChat(db, {
    id, companyId: work.companyId, projectId: source.projectId,
    sourceId, agentId: work.agentId, externalSessionId: session.id,
  })
  return { id, title: session.title, sourceId }
}

async function sendKnowledgeSourceChatMessage(work: AgentWorkItem, sessionId: string, message: string): Promise<unknown> {
  const { projectId, notebookId } = await projectScope(work)
  const session = await findAgentSourceChat(db, {
    sessionId, companyId: work.companyId, projectId, agentId: work.agentId,
  })
  if (!session) throw new Error('source chat session not found')
  const result = await provider.sendSourceChatMessage(
    notebookId, session.externalSourceId, session.externalSessionId, message,
  )
  return { answer: result.answer }
}

async function retryKnowledgeSourceForAgent(work: AgentWorkItem, sourceId: string): Promise<{ status: string }> {
  const { projectId } = await projectScope(work)
  // The service validates the local source against company + project before it
  // touches either the upstream Source or the ingestion job. This also lets an
  // Agent retry a failure that happened before Open Notebook returned an ID.
  await retryKnowledgeSource(sourceId, work.companyId, projectId)
  return { status: 'queued' }
}

async function updateKnowledgeSourceForAgent(work: AgentWorkItem, sourceId: string, input: { title?: string; topics?: string[] }): Promise<unknown> {
  const source = await resolveOwnedSource(work, sourceId)
  const upstream = await provider.updateSource(source.externalId, input)
  await updateAgentSourceTitle(db, {
    sourceId, companyId: work.companyId, projectId: source.projectId, title: input.title ?? null,
  })
  return { id: sourceId, title: upstream.title ?? null, topics: upstream.topics ?? [] }
}

async function setKnowledgeSourceEnabled(work: AgentWorkItem, sourceId: string, enabled: boolean): Promise<{ enabled: boolean }> {
  const source = await resolveSource(work, sourceId)
  await setAgentSourceExcluded(db, {
    sourceId, companyId: work.companyId, projectId: source.projectId,
    conversationId: work.channelId, agentId: work.agentId, excluded: !enabled,
  })
  return { enabled }
}

async function unlinkKnowledgeSourceForAgent(work: AgentWorkItem, sourceId: string): Promise<{ unlinked: boolean }> {
  const { projectId, notebookId } = await projectScope(work)
  const source = await findOwnedAgentSource(db, { sourceId, companyId: work.companyId, projectId })
  if (!source) throw new Error('source not found in this workspace')
  if (source.externalSourceId) await provider.unlinkSource(notebookId, source.externalSourceId)
  if (!await softDeleteAgentSource(db, { sourceId, companyId: work.companyId, projectId })) {
    throw new Error('source not found in this workspace')
  }
  await cancelKnowledgeSourceJob(sourceId, '资料已在摄取完成前解除工作区关联')
  return { unlinked: true }
}

async function deleteKnowledgeSourceForAgent(work: AgentWorkItem, sourceId: string): Promise<{ deleted: boolean }> {
  const { projectId } = await projectScope(work)
  await deleteKnowledgeSource(sourceId, work.companyId, projectId)
  return { deleted: true }
}

return {
  addKnowledgeFile,
  addKnowledgeText,
  addKnowledgeUrl,
  askKnowledgeForAgent,
  createKnowledgeInsight,
  createKnowledgeNote,
  deleteKnowledgeInsight,
  deleteKnowledgeNote,
  deleteKnowledgeSourceForAgent,
  getKnowledgeNote,
  getKnowledgeSourceForAgent,
  listKnowledgeInsights,
  listKnowledgeNotes,
  listKnowledgeSourcesForAgent,
  retryKnowledgeSourceForAgent,
  searchKnowledgeForAgent,
  sendKnowledgeSourceChatMessage,
  setKnowledgeSourceEnabled,
  startKnowledgeSourceChat,
  unlinkKnowledgeSourceForAgent,
  updateKnowledgeInsight,
  updateKnowledgeNote,
  updateKnowledgeSourceForAgent,
}
}
