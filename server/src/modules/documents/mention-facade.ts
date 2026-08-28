import { pool } from '../../db/pool.js'
import { withTransaction } from '../../db/transaction.js'
import { wukongClient } from '../../im/wukong.js'
import { inc } from '../../metrics.js'
import { CH_DOC_MENTION, publish } from '../../redis.js'
import { openDirectConversationForDocumentMention } from '../conversations/public.js'
import type { DocumentMentionEvent } from './contracts.js'
import { DocumentMentionApplication } from './mention-application.js'

export const documentMentionApplication = new DocumentMentionApplication({
  transaction: (work) => withTransaction(pool, work),
  publish: async (event: DocumentMentionEvent) => { await publish(CH_DOC_MENTION, event) },
  wakeAgent: async (args) => {
    const conversation = await openDirectConversationForDocumentMention({
      companyId: args.companyId,
      projectId: args.projectId,
      mentionerId: args.mentionerId,
      agentId: args.agentId,
    })
    await wukongClient().sendMessage(conversation.id, 2, args.mentionerId, {
      version: 1,
      kind: 'text',
      clientMsgNo: `doc-mention-${args.deliveryId}-${args.agentId}`,
      body: `@${args.agentId} heads-up — I mentioned you in the document "${args.documentTitle}". Please read document ${args.documentId}.`,
      refs: { documentId: args.documentId },
      data: { mentionedIds: [args.agentId], mentionAll: false },
    })
  },
  metric: inc,
})
