import { randomUUID } from 'node:crypto'
import type { Queryable } from '../../db/queryable.js'
import { PRIVILEGED_ROLES } from '../../http/roles.js'
import type { DocumentChangedEvent, DocumentPayload, DocumentScope } from './contracts.js'
import {
  conversationExists,
  deleteDocument,
  findDocument,
  insertDocument,
  listDocuments,
  memberRole,
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

  async get(scope: Omit<DocumentScope, 'userId'>, documentId: string): Promise<DocumentPayload> {
    const row = await findDocument(this.db, scope.companyId, scope.projectId, documentId)
    if (!row) throw new DocumentApplicationError('document_not_found', 'not found')
    return toPayload(row)
  }

  async rename(scope: DocumentScope, documentId: string, title: string): Promise<{ ok: true; title: string }> {
    if (!await renameDocument(this.db, scope.companyId, scope.projectId, documentId, title)) {
      throw new DocumentApplicationError('document_not_found', 'not found')
    }
    await this.changed(scope, documentId, 'document.updated')
    return { ok: true, title }
  }

  async delete(scope: DocumentScope, documentId: string): Promise<{ ok: true }> {
    const row = await findDocument(this.db, scope.companyId, scope.projectId, documentId)
    if (!row) throw new DocumentApplicationError('document_not_found', 'not found')
    if (row.created_by !== scope.userId) {
      const role = await memberRole(this.db, scope.companyId, scope.userId)
      if (!role || !PRIVILEGED_ROLES.has(role)) {
        throw new DocumentApplicationError('delete_forbidden', 'only the creator or an owner can delete')
      }
    }
    if (!await deleteDocument(this.db, scope.companyId, scope.projectId, documentId)) {
      throw new DocumentApplicationError('document_not_found', 'not found')
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
