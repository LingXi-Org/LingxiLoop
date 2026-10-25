import { createHash } from 'node:crypto'
import { NoEffectError, type ActionContext } from '@lyyzka/lingxios'
import type { Queryable } from '../../db/queryable.js'
import { productConversationId } from '../../agent-runtime/identity.js'
import { resolveRequestReferences } from '../../agent-runtime/request-references.js'
import { readAgentChannelMessages } from '../../im/public.js'

/** A retry is a new runtime operation, but creates only the original teacher's draft.
 * Resolve that identity from committed IM, never model arguments or rendered text. */
export async function homeworkDraftRequestId(context: ActionContext, courseId: string): Promise<string> {
  const { work, signal } = context, db = context.database as Queryable
  const channelId = productConversationId(work), source = work.conversation?.source.messageId ?? work.triggerRef
  const read = (messageIds: string[]) => readAgentChannelMessages({ companyId: work.tenantId,
    agentId: work.agentId, channelId, messageIds, signal })
  const message = (await read([source]))?.find(item => item.clientMsgNo === source || item.messageId === source)
  if (!message || message.payload.role !== 'user' || message.fromUid !== work.principalId) {
    throw new NoEffectError('the committed teacher request is unavailable', 'forbidden')
  }
  const references = await resolveRequestReferences(message, read, async assistant => {
    const runId = assistant.payload.metadata.custom.runId
    if (typeof runId !== 'string') return undefined
    return (await db.query<{ source_client_msg_no: string | null }>(`SELECT source_client_msg_no FROM agent_run_bindings
      WHERE run_id=$1 AND company_id=$2 AND conversation_id=$3 AND agent_id=$4 AND principal_id=$5
        AND NOT internal AND message_protocol=2`,
    [runId, work.tenantId, channelId, assistant.fromUid, work.principalId])).rows[0]?.source_client_msg_no ?? undefined
  })
  const original = references.operation
    ? references.messages.find(item => item.clientMsgNo === references.originalRequestId) : message
  if (!original || original.payload.role !== 'user' || original.fromUid !== work.principalId) {
    throw new NoEffectError('the original committed teacher request is unavailable; recover the existing draft before creating another', 'forbidden')
  }
  const bytes = createHash('sha256').update(JSON.stringify(['teacher.draft_homework', work.tenantId,
    courseId, work.principalId, channelId, original.clientMsgNo])).digest().subarray(0, 16)
  bytes[6] = (bytes[6]! & 0x0f) | 0x80
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
