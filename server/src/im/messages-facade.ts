import { pool } from '../db/pool.js'
import { toggleWukongReaction, wukongReactions } from '../modules/messages/public.js'
import { ImMessagesApplication } from './messages-application.js'
import { publishReadReceiptAdvance, recordReadReceiptAdvance } from './read-receipts.js'
import { wukongClient } from './wukong.js'
import type { Queryable } from '../db/queryable.js'
import { withClientTransaction } from '../db/transaction.js'
import { acceptSend } from './messages-repository.js'
import { nativeMessageSchema } from './message-types.js'
import { messageAcceptanceDigest } from './messages-digest.js'

export function createImMessagesApplication(signal?: AbortSignal, database?: Queryable) {
  return new ImMessagesApplication({
  db: database ?? pool,
  withConnection: async (work) => {
    if (database) return work(database)
    const client = await pool.connect()
    try {
      return await work(client)
    } finally {
      client.release()
    }
  },
  commitAcceptedSend: async (db, input) => {
    const payload = nativeMessageSchema.parse(input.echo.payload)
    // Questionnaire answers own a durable submission lease and canonical
    // continuation wake. Preserve that phase/budget gate instead of creating
    // an earlier generic wake while their submission is still being finalized.
    if (payload.role !== 'user' || payload.metadata.custom.questionnaireReply !== undefined) return acceptSend(db, input)
    const commit = async () => {
      // acceptSend validates the real ACK/history receipt against the persisted
      // canonical message. Its acceptance and wake commit together; an unknown
      // send can only reconcile history, never dispatch an optimistic wake.
      await acceptSend(db, input)
      const { wukongWebhookApplication } = await import('./webhook-facade.js')
      const messageId = String(input.echo.messageId)
      const channelId = String(input.echo.channelId)
      await wukongWebhookApplication.enqueue(db, {
        // JSONB changes object key order on replay. Bind the receipt to stable
        // primitives and the existing canonical digest, not echo serialization.
        raw: Buffer.from(JSON.stringify([messageId, input.echo.messageSeq, input.companyId, input.userId, input.clientNonce,
          messageAcceptanceDigest({ channelId, channelType: Number(input.echo.channelType), payload })])),
        eventId: `im.accepted:${messageId}`, eventType: 'msg.notify',
        wakeEventId: `msg.notify:${messageId}`,
        channelId, fromUid: input.userId,
        clientMsgNo: input.clientNonce, payload,
      })
    }
    // A supplied connection belongs to the native event worker's transaction.
    if (database) await commit()
    else await withClientTransaction(db, commit)
  },
  syncMessages: (...args) => wukongClient(signal).syncMessages(...args),
  listConversations: (...args) => wukongClient(signal).listConversations(...args),
  clearUnread: (...args) => wukongClient(signal).clearUnread(...args),
  reactions: wukongReactions,
  toggleReaction: toggleWukongReaction,
  sendMessage: (...args) => wukongClient(signal).sendMessage(...args),
  setUnread: (...args) => wukongClient(signal).setUnread(...args),
  recordReadReceipt: recordReadReceiptAdvance,
  publishReadReceipt: publishReadReceiptAdvance,
})
}
export const imMessagesApplication = createImMessagesApplication()
