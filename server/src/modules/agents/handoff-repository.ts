import { productConversationId } from '../../agent-runtime/identity.js'
import type { WorkItem } from '@lyyzka/lingxios'
import type { Queryable } from '../../db/queryable.js'

export async function assignedHandoff(db: Queryable, work: Pick<WorkItem, 'id' | 'tenantId' | 'principalId' | 'agentId' | 'sessionId' | 'threadId' | 'conversation' | 'meta'>) {
  const { rows } = await db.query<{ id: string; title: string; note: string | null }>(`SELECT id,title,note FROM agent_handoffs
    WHERE child_work_id=$1 AND company_id=$2 AND principal_id=$3 AND to_agent_id=$4 AND conversation_id=$5
      AND thread_id IS NOT DISTINCT FROM $6 FOR SHARE`,
  [work.id,work.tenantId,work.principalId,work.agentId,productConversationId(work),work.threadId ?? null])
  return rows[0] ?? null
}
