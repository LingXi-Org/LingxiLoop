import { pool } from '../../db/pool.js'
import { withTransaction } from '../../db/transaction.js'
import { env } from '../../env.js'
import {
  CH_DOC_AWARENESS,
  CH_DOC_UPDATE,
  publish,
  sub,
} from '../../redis.js'
import {
  normalizeStorageKey,
  signedUrlExpiresSoon,
  storage,
  storageKeyFromPublicUrl,
} from '../../storage.js'
import {
  createDocumentCollaborationApplication,
} from './collaboration-application.js'
import { listProjectDocumentIds } from './collaboration-repository.js'
import type { DocumentAwarenessEvent, DocumentUpdateEvent } from './contracts.js'

function isDocumentBusEvent(value: unknown): value is DocumentUpdateEvent | DocumentAwarenessEvent {
  if (!value || typeof value !== 'object') return false
  const event = value as Record<string, unknown>
  return (event.type === 'doc.update' || event.type === 'doc.awareness')
    && typeof event.companyId === 'string'
    && typeof event.documentId === 'string'
    && typeof event.updateB64 === 'string'
    && typeof event.originId === 'string'
    && (event.type !== 'doc.update' || typeof event.authorId === 'string')
}

export const documentCollaboration = createDocumentCollaborationApplication({
  transaction: (work) => withTransaction(pool, work),
  instanceId: env.INSTANCE_ID,
  imageStorage: {
    normalizeKey: (value) => normalizeStorageKey(value ?? ''),
    keyFromPublicUrl: (value) => storageKeyFromPublicUrl(value ?? ''),
    signedUrlExpiresSoon,
    publicUrl: (key) => storage.publicUrl(key),
  },
  bus: {
    publish: async (event: DocumentUpdateEvent | DocumentAwarenessEvent) => {
      await publish(event.type === 'doc.update' ? CH_DOC_UPDATE : CH_DOC_AWARENESS, event)
    },
    subscribe: async (listener) => {
      await sub.subscribe(CH_DOC_UPDATE, CH_DOC_AWARENESS)
      sub.on('message', (channel, payload) => {
        if (channel !== CH_DOC_UPDATE && channel !== CH_DOC_AWARENESS) return
        let parsed: unknown
        try { parsed = JSON.parse(payload) } catch { return }
        if (isDocumentBusEvent(parsed)
          && ((channel === CH_DOC_UPDATE && parsed.type === 'doc.update')
            || (channel === CH_DOC_AWARENESS && parsed.type === 'doc.awareness'))) {
          listener(parsed)
        }
      })
    },
  },
})

export async function projectDocumentIds(companyId: string, projectId: string): Promise<string[]> {
  return listProjectDocumentIds(pool, companyId, projectId)
}
