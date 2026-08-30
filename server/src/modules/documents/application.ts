import { randomUUID } from 'node:crypto'
import type { Queryable } from '../../db/queryable.js'
import { createPermissionService } from '../access/public.js'
import type {
  AgentDocumentEditOperation,
  AgentDocumentEditResult,
  DocumentChangedEvent,
  DocumentPayload,
  DocumentScope,
  RecentDocumentCreation,
} from './contracts.js'
import {
  conversationExists,
  deleteDocument,
  deleteDocumentCreatedBy,
  findDocument,
  insertDocument,
  listDocuments,
  listRecentDocumentsCreatedByOthers,
  renameDocument,
  type DocumentRow,
} from './repository.js'

export type DocumentErrorCode = 'conversation_not_found' | 'document_not_found' | 'delete_forbidden'

export class DocumentApplicationError extends Error {
  constructor(readonly code: DocumentErrorCode, message: string) {
    super(message)
  }
}

export interface DocumentEventPublisher {
  publish(event: DocumentChangedEvent): Promise<void>
}

export interface DocumentAgentEditor {
  readText(documentId: string, companyId: string): Promise<string>
  applyEdit(
    documentId: string,
    companyId: string,
    agentId: string,
    operations: AgentDocumentEditOperation[],
  ): Promise<AgentDocumentEditResult>
}

function toPayload(row: DocumentRow): DocumentPayload {
  return {
    id: row.id,
    title: row.title,
    createdBy: row.created_by,
    conversationId: row.conversation_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }
}

export class DocumentsApplication {
  constructor(
    private readonly db: Queryable,
    private readonly events: DocumentEventPublisher,
    private readonly agentEditor: DocumentAgentEditor,
  ) {}

  async list(scope: Omit<DocumentScope, 'userId'>): Promise<DocumentPayload[]> {
    return (await listDocuments(this.db, scope.companyId, scope.projectId)).map(toPayload)
  }

  async create(
    scope: DocumentScope,
    input: { title?: string; conversationId?: string | null },
  ): Promise<DocumentPayload> {
    const conversationId = input.conversationId ?? null
    if (conversationId && !await conversationExists(this.db, scope.companyId, scope.projectId, conversationId)) {
      throw new DocumentApplicationError('conversation_not_found', 'conversation not found')
    }
    const id = `doc_${randomUUID().replaceAll('-', '').slice(0, 16)}`
    const row = await insertDocument(this.db, {
      id,
      companyId: scope.companyId,
      projectId: scope.projectId,
      title: input.title || 'Untitled',
      createdBy: scope.userId,
      conversationId,
    })
    await this.changed(scope, id, 'document.created')
    return toPayload(row)
  }

  async createForAgent(
    scope: DocumentScope,
    input: { id?: string; title: string; body: string },
  ): Promise<{ document: DocumentPayload; replayed: boolean }> {
    if (input.id) {
      const existing = await findDocument(this.db, scope.companyId, scope.projectId, input.id)
      if (existing) {
        if (input.body && !(await this.agentEditor.readText(existing.id, scope.companyId)).trim()) {
          await this.agentEditor.applyEdit(existing.id, scope.companyId, scope.userId, [
            { kind: 'append', text: input.body },
          ])
          await this.changed(scope, existing.id, 'document.updated')
        }
        return { document: toPayload(existing), replayed: true }
      }
    }
    const id = input.id ?? `doc_${randomUUID().replaceAll('-', '').slice(0, 16)}`
    const row = await insertDocument(this.db, {
      id,
      companyId: scope.companyId,
      projectId: scope.projectId,
      title: input.title,
      createdBy: scope.userId,
      conversationId: null,
    })
    if (input.body) {
      await this.agentEditor.applyEdit(id, scope.companyId, scope.userId, [
        { kind: 'append', text: input.body },
      ])
    }
    await this.changed(scope, id, 'document.created')
    return { document: toPayload(row), replayed: false }
  }

  async listRecentCreationsByOthers(
    scope: DocumentScope,
    sinceMinutes: number,
  ): Promise<RecentDocumentCreation[]> {
    return (await listRecentDocumentsCreatedByOthers(this.db, {
      companyId: scope.companyId,
      projectId: scope.projectId,
      actorId: scope.userId,
      sinceMinutes,
    })).map((row) => ({
      id: row.id,
      title: row.title,
      createdBy: row.created_by,
      createdAt: row.created_at,
    }))
  }

  async readForAgent(scope: DocumentScope, documentId: string): Promise<DocumentPayload & { body: string }> {
    const document = await this.get(scope, documentId)
    const body = await this.agentEditor.readText(documentId, scope.companyId)
    return { ...document, body }
  }

  async editForAgent(
    scope: DocumentScope,
    documentId: string,
    operations: AgentDocumentEditOperation[],
  ): Promise<AgentDocumentEditResult> {
    await this.get(scope, documentId)
    const result = await this.agentEditor.applyEdit(
      documentId,
      scope.companyId,
      scope.userId,
      operations,
    )
    const changed = operations.some((operation) => {
      if (operation.kind === 'append' || operation.kind === 'insertParagraph') return operation.text.length > 0
      if (operation.kind === 'replace') return result.replaced > 0
      if (operation.kind === 'replaceBlock') return result.blocksReplaced > 0
      if (operation.kind === 'imageDelete') return result.imagesDeleted > 0
      return result.imagePlaced === 'absolute' || result.imagePlaced === 'anchor'
    })
    if (changed) await this.changed(scope, documentId, 'document.updated')
    return result
  }

  async get(scope: Omit<DocumentScope, 'userId'>, documentId: string): Promise<DocumentPayload> {
    const row = await findDocument(this.db, scope.companyId, scope.projectId, documentId)
    if (!row) throw new DocumentApplicationError('document_not_found', 'not found')
    return toPayload(row)
  }

  async exists(scope: Omit<DocumentScope, 'userId'>, documentId: string): Promise<boolean> {
    return Boolean(await findDocument(this.db, scope.companyId, scope.projectId, documentId))
  }

  async rename(scope: DocumentScope, documentId: string, title: string): Promise<{ ok: true; title: string }> {
    if (!await renameDocument(this.db, scope.companyId, scope.projectId, documentId, title)) {
      throw new DocumentApplicationError('document_not_found', 'not found')
    }
    await this.changed(scope, documentId, 'document.updated')
    return { ok: true, title }
  }

  async delete(scope: DocumentScope, documentId: string): Promise<{ ok: true }> {
    await createPermissionService(this.db).assertCan({
      actorUserId: scope.userId,
      action: 'document:delete',
      companyId: scope.companyId,
      projectId: scope.projectId,
      resource: { type: 'document', id: documentId },
    })
    if (!await deleteDocument(this.db, scope.companyId, scope.projectId, documentId)) {
      throw new DocumentApplicationError('document_not_found', 'not found')
    }
    await this.changed(scope, documentId, 'document.deleted')
    return { ok: true }
  }

  async deleteForAgent(scope: DocumentScope, documentId: string): Promise<{ ok: true }> {
    if (!await deleteDocumentCreatedBy(
      this.db,
      scope.companyId,
      scope.projectId,
      documentId,
      scope.userId,
    )) {
      throw new DocumentApplicationError('delete_forbidden', 'only the creator can delete this document')
    }
    await this.changed(scope, documentId, 'document.deleted')
    return { ok: true }
  }

  private async changed(
    scope: DocumentScope,
    documentId: string,
    kind: DocumentChangedEvent['kind'],
  ): Promise<void> {
    await this.events.publish({
      type: 'doc.changed',
      kind,
      companyId: scope.companyId,
      workspaceId: scope.projectId,
      documentId,
      actorId: scope.userId,
    }).catch(() => undefined)
  }
}
