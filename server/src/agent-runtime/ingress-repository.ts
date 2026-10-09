import type { Queryable } from '../db/queryable.js'

export async function releaseKnowledgeAgentWakes(db: Queryable, sourceId: string): Promise<void> {
  // Lock each wake before checking all dependencies, including concurrent final completions.
  const { rows } = await db.query<{ event_id: string; agent_id: string }>(
    `SELECT event_id,agent_id FROM lingxios_ingress_outbox
      WHERE $1=ANY(knowledge_source_ids) AND delivered_at IS NULL AND failed_at IS NULL
      ORDER BY event_id,agent_id FOR UPDATE`,[sourceId])
  for (const row of rows) await db.query(`UPDATE lingxios_ingress_outbox wake SET available_at=COALESCE(available_at,NOW()),error=NULL
    WHERE event_id=$1 AND agent_id=$2 AND NOT EXISTS (
      SELECT 1 FROM knowledge_sources source LEFT JOIN knowledge_source_jobs job ON job.source_id=source.id
      WHERE source.id=ANY(wake.knowledge_source_ids) AND source.deleted_at IS NULL
        AND source.status NOT IN ('ready','failed') AND COALESCE(job.status,'queued') NOT IN ('completed','failed'))`,[row.event_id,row.agent_id])
}
