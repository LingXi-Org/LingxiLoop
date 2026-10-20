import type { RunIdentity } from '@lyyzka/lingxios'
import type { Queryable } from '../db/queryable.js'
import { pool } from '../db/pool.js'

/** A scoped product binding, never inferred from model text or paged chat history. */
export async function readQuestionnaireWait(identity: RunIdentity, requestVersion: number, database: Queryable = pool) {
  const row = (await database.query<{ question_id: string }>(`SELECT question_id FROM im_questionnaires WHERE company_id=$1 AND run_id=$2
    AND request_version=$3 AND agent_id=$4 AND session_id=$5 AND thread_id IS NOT DISTINCT FROM $6`,
    [identity.tenantId, identity.runId, requestVersion, identity.agentId, identity.sessionId, identity.threadId ?? null])).rows[0]
  return row ? { questionId: row.question_id, requestVersion } : null
}
