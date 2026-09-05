import { createHash } from 'node:crypto'
import type { AgentWorkItem } from '../../agent-os/types.js'
import type { Queryable } from '../../db/queryable.js'
import type { BoundedStorageReader, Storage } from '../../storage.js'
import { createPermissionService } from '../access/public.js'
import {
  type AgentKnowledgeSourceRow,
  findAgentSourceExternalId,
  insertAgentKnowledgeSource,
  listAgentKnowledgeSources,
  setAgentSourceExcluded,
} from './agent-repository.js'
import { isKnowledgeAttachmentMime, MAX_SOURCE_BYTES, validateKnowledgeUrl } from './policy.js'
import { enqueueSourceJob } from './repository.js'
import { findKnowledgeRetrievalProject } from './retrieval-repository.js'
import {
  deleteKnowledgeSource,
  ensureProjectNotebook,
  retryKnowledgeSource,
} from './runtime.js'

export interface KnowledgeAgentInfrastructure {
  storage: Pick<Storage, 'put'> & Pick<BoundedStorageReader, 'readObjectBounded'>
  transaction<T>(work: (db: Queryable) => Promise<T>): Promise<T>
}

export function createKnowledgeAgentApplication(db: Queryable, infrastructure: KnowledgeAgentInfrastructure) {
  const { storage } = infrastructure

  function agentSourceView(source: AgentKnowledgeSourceRow): Record<string, unknown> {
    return {
      id: source.id,
      title: source.title,
      kind: source.kind,
      status: source.status,
      visibilityScope: source.visibility_scope,
      ownerUserId: source.owner_user_id,
      createdByUserId: source.created_by_user_id,
      createdVia: source.created_via,
      enabled: !source.excluded,
    }
  }

  function authorizationUserId(work: AgentWorkItem): string {
    const userId = work.authorizationUserId?.trim()
    if (!userId) throw new Error('Agent work has no persisted human authorization principal')
    return userId
  }

  async function projectScope(
    work: AgentWorkItem,
    action: 'knowledge:read' | 'knowledge:write' | 'knowledge:manage' = 'knowledge:read',
    sourceId?: string,
  ): Promise<{ projectId: string; authorizationUserId: string }> {
    const userId = authorizationUserId(work)
    const projectId = await findKnowledgeRetrievalProject(db, work.companyId, work.channelId, userId)
    if (!projectId) throw new Error('knowledge actions require an authorized workspace conversation')
    await createPermissionService(db).assertCan({
      actorUserId: userId,
      action,
      companyId: work.companyId,
      projectId,
      ...(sourceId ? { resource: { type: 'knowledge_source' as const, id: sourceId } } : {}),
    })
    await ensureProjectNotebook(projectId, work.companyId)
    return { projectId, authorizationUserId: userId }
  }

  async function localSources(work: AgentWorkItem, projectId: string): Promise<AgentKnowledgeSourceRow[]> {
    return listAgentKnowledgeSources(db, {
      companyId: work.companyId,
      projectId,
      conversationId: work.channelId,
      authorizationUserId: authorizationUserId(work),
    })
  }

  async function listKnowledgeSourcesForAgent(work: AgentWorkItem): Promise<unknown[]> {
    const { projectId } = await projectScope(work)
    return (await localSources(work, projectId)).map(agentSourceView)
  }

  async function createAgentSource(work: AgentWorkItem, input: {
    kind: 'text' | 'url' | 'file'
    title: string
    text?: string
    url?: string
    storageKey?: string
    mime?: string
    size?: number
    idempotencyKey: string
  }): Promise<{ id: string; status: string }> {
    const { projectId, authorizationUserId: userId } = await projectScope(work, 'knowledge:write')
    const id = `ks-${createHash('sha256').update(`${work.companyId}:${input.idempotencyKey}`).digest('hex').slice(0, 16)}`
    const size = input.size ?? (input.text ? Buffer.byteLength(input.text) : 0)
    const suffix = input.kind === 'text' ? 'txt' : input.storageKey?.split('.').pop() || 'bin'
    const storageKey = input.kind === 'url' ? null : `knowledge-sources/${work.companyId}/${projectId}/${id}.${suffix}`
    if (input.text) await storage.put(storageKey!, Buffer.from(input.text, 'utf8'), 'text/plain')
    if (input.kind === 'file') {
      const bytes = await storage.readObjectBounded(input.storageKey!, MAX_SOURCE_BYTES)
      if (bytes.length !== size) throw new Error('attachment size no longer matches its declaration')
      await storage.put(storageKey!, bytes, input.mime!)
    }
    await infrastructure.transaction(async (tx) => {
      await insertAgentKnowledgeSource(tx, {
        id,
        companyId: work.companyId,
        projectId,
        conversationId: work.channelId,
        kind: input.kind,
        title: input.title.slice(0, 200),
        mime: input.mime ?? (input.kind === 'text' ? 'text/plain' : null),
        size,
        storageKey,
        originalUrl: input.url ?? null,
        authorizationUserId: userId,
      })
      await enqueueSourceJob(tx, { sourceId: id, companyId: work.companyId, projectId, userId })
    })
    return { id, status: 'queued' }
  }

  function addKnowledgeText(work: AgentWorkItem, input: { title: string; text: string; idempotencyKey: string }) {
    if (!input.text.trim()) throw new Error('text is required')
    if (Buffer.byteLength(input.text) > MAX_SOURCE_BYTES) throw new Error('source exceeds 200 MB')
    return createAgentSource(work, { kind: 'text', title: input.title, text: input.text, idempotencyKey: input.idempotencyKey })
  }

  async function addKnowledgeUrl(work: AgentWorkItem, input: { title: string; url: string; idempotencyKey: string }) {
    return createAgentSource(work, { kind: 'url', title: input.title, url: await validateKnowledgeUrl(input.url), idempotencyKey: input.idempotencyKey })
  }

  function addKnowledgeFile(work: AgentWorkItem, input: { title: string; storageKey: string; mime: string; size: number; idempotencyKey: string }) {
    if (!input.storageKey.startsWith(`attachments/${work.companyId}/`)) {
      throw new Error('only a tenant-scoped attachment from the current conversation can be added')
    }
    if (!isKnowledgeAttachmentMime(input.mime, input.size)) throw new Error('unsupported knowledge attachment')
    return createAgentSource(work, { kind: 'file', ...input })
  }

  async function resolveSource(
    work: AgentWorkItem,
    sourceId: string,
    action: 'knowledge:read' | 'knowledge:manage' = 'knowledge:read',
  ): Promise<{ projectId: string; externalId: string; authorizationUserId: string }> {
    const { projectId, authorizationUserId: userId } = await projectScope(work, action, sourceId)
    const externalId = await findAgentSourceExternalId(db, {
      sourceId,
      companyId: work.companyId,
      projectId,
      authorizationUserId: userId,
    })
    if (!externalId) throw new Error('ready source not found in this workspace')
    return { projectId, externalId, authorizationUserId: userId }
  }

  async function retryKnowledgeSourceForAgent(work: AgentWorkItem, sourceId: string): Promise<{ status: string }> {
    const { projectId, authorizationUserId: userId } = await projectScope(work, 'knowledge:manage', sourceId)
    await retryKnowledgeSource(sourceId, work.companyId, projectId, userId)
    return { status: 'queued' }
  }

  async function setKnowledgeSourceEnabled(work: AgentWorkItem, sourceId: string, enabled: boolean): Promise<{ enabled: boolean }> {
    const source = await resolveSource(work, sourceId, 'knowledge:manage')
    await setAgentSourceExcluded(db, {
      sourceId,
      companyId: work.companyId,
      projectId: source.projectId,
      conversationId: work.channelId,
      authorizationUserId: source.authorizationUserId,
      excluded: !enabled,
    })
    return { enabled }
  }

  async function deleteKnowledgeSourceForAgent(work: AgentWorkItem, sourceId: string): Promise<{ deleted: boolean }> {
    const { projectId, authorizationUserId: userId } = await projectScope(work, 'knowledge:manage', sourceId)
    await deleteKnowledgeSource(sourceId, work.companyId, projectId, userId)
    return { deleted: true }
  }

  return {
    addKnowledgeFile,
    addKnowledgeText,
    addKnowledgeUrl,
    deleteKnowledgeSourceForAgent,
    listKnowledgeSourcesForAgent,
    retryKnowledgeSourceForAgent,
    setKnowledgeSourceEnabled,
  }
}
