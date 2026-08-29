import { pool } from '../db/pool.js'
import { withTransaction } from '../db/transaction.js'
import { createAttachmentKnowledgeJob, isKnowledgeAttachmentMime } from '../modules/knowledge/public.js'
import { WukongWebhookApplication } from './webhook-application.js'
import { wukongClient } from './wukong.js'

export const wukongWebhookApplication = new WukongWebhookApplication({
  transaction: (work) => withTransaction(pool, work),
  verify: (raw, signature) => wukongClient().verifyWebhook(raw, signature),
  isKnowledgeAttachment: isKnowledgeAttachmentMime,
  createKnowledgeJob: createAttachmentKnowledgeJob,
  emitQueued: async ({ channelId, channelType, agentId, workId }) => {
    await wukongClient().emitEvent({
      channelId,
      channelType,
      fromUid: agentId,
      clientMsgNo: `preview-${workId}`,
      eventId: `${workId}:queued`,
      eventType: 'stream.open',
      data: { kind: 'text', text: '', phase: 'thinking', queued: true, streamSeq: 0 },
    })
  },
})
