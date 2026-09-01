import { pool } from '../db/pool.js'
import { withTransaction } from '../db/transaction.js'
import { createAttachmentKnowledgeJob, isKnowledgeAttachmentMime } from '../modules/knowledge/public.js'
import { CH_ASSISTANT_STREAM, publish } from '../redis.js'
import { WukongWebhookApplication } from './webhook-application.js'
import { wukongClient } from './wukong.js'

export const wukongWebhookApplication = new WukongWebhookApplication({
  transaction: (work) => withTransaction(pool, work),
  verify: (raw, signature, token) => wukongClient().verifyWebhook(raw, signature, token),
  isKnowledgeAttachment: isKnowledgeAttachmentMime,
  createKnowledgeJob: createAttachmentKnowledgeJob,
  emitQueued: async ({ companyId, channelId, agentId, workId }) => {
    await publish(CH_ASSISTANT_STREAM, {
      type: 'assistant.stream', companyId, conversationId: channelId,
      messageId: `preview-${workId}`, authorId: agentId, sequence: 0,
      chunks: [{ type: 'step-start', path: [], messageId: `preview-${workId}` }],
    })
  },
})
