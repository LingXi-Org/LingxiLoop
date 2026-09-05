import type { Queryable } from '../../db/queryable.js'
import { transitionAttention, type AttentionCommand } from '../../domain/attention/public.js'
import { createPermissionService } from '../access/public.js'
import { commitDomainEvent, type DomainEventTransaction } from '../events/public.js'
import type { AttentionItem } from './contracts.js'
import {
  listTeacherAttentionItems,
  lockTeacherAttentionItem,
  updateAttentionItemStatus,
} from './repository.js'

export class AttentionApplicationError extends Error {
  constructor(readonly code: 'not_found' | 'conflict' | 'invalid', message: string) {
    super(message)
  }
}

export class AttentionApplication {
  constructor(
    private readonly db: Queryable,
    private readonly transaction: DomainEventTransaction,
  ) {}

  async list(scope: { companyId: string; projectId: string; userId: string }, includeTerminal = false) {
    await createPermissionService(this.db).assertCan({
      actorUserId: scope.userId,
      action: 'learning:read',
      companyId: scope.companyId,
      projectId: scope.projectId,
    })
    return listTeacherAttentionItems(this.db, {
      ...scope, teacherUserId: scope.userId, includeTerminal,
    })
  }

  async execute(scope: { companyId: string; projectId: string; userId: string }, args: {
    itemId: string
    command: AttentionCommand
    deferredUntil?: string
    reason?: string
  }): Promise<AttentionItem> {
    const { result } = await commitDomainEvent(this.transaction, async (db) => {
      await createPermissionService(db, { lockDependencies: true }).assertCan({
        actorUserId: scope.userId,
        action: 'learning:manage',
        companyId: scope.companyId,
        projectId: scope.projectId,
      })
      const current = await lockTeacherAttentionItem(db, {
        ...scope, teacherUserId: scope.userId, itemId: args.itemId,
      })
      if (!current) throw new AttentionApplicationError('not_found', 'Attention Item not found')
      const transition = transitionAttention(current.status, args.command)
      if (transition.outcome === 'INVALID') {
        throw new AttentionApplicationError('conflict', 'Attention Item is terminal')
      }
      if (transition.outcome === 'ALREADY_APPLIED') return { item: current, changed: false }

      let deferredUntil: Date | null = null
      if (transition.status === 'DEFERRED') {
        deferredUntil = new Date(args.deferredUntil ?? '')
        const max = Date.now() + 366 * 86_400_000
        if (!Number.isFinite(deferredUntil.getTime())
          || deferredUntil.getTime() <= Date.now() || deferredUntil.getTime() > max) {
          throw new AttentionApplicationError('invalid', 'deferredUntil must be within the next 366 days')
        }
      }
      const reason = args.reason?.trim() || null
      if (reason && reason.length > 500) {
        throw new AttentionApplicationError('invalid', 'reason is limited to 500 characters')
      }
      const updated = await updateAttentionItemStatus(db, {
        itemId: current.id,
        status: transition.status,
        deferredUntil,
        resolutionReason: transition.status === 'RESOLVED' || transition.status === 'DISMISSED' ? reason : null,
      })
      return { item: updated, changed: true }
    }, ({ item, changed }) => changed ? {
      companyId: item.companyId,
      projectId: item.projectId,
      aggregateType: 'ATTENTION_ITEM',
      aggregateId: item.id,
      idempotencyKey: `attention:${item.id}:version:${item.version}`,
      actor: { type: 'USER', id: scope.userId },
      event: {
        eventType: 'ATTENTION.STATUS_CHANGED',
        schemaVersion: 1,
        payload: { itemId: item.id, status: item.status, version: item.version },
      },
    } : null)
    return result.item
  }
}
