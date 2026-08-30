import type { Queryable } from '../../db/queryable.js'
import type { JsonObject } from './contracts.js'

export interface DomainEventRow {
  id: string
  company_id: string
  project_id: string | null
  aggregate_type: string
  aggregate_id: string
  sequence: string | number
  aggregate_sequence: string | number
  event_type: string
  schema_version: number
  idempotency_key: string
  actor_type: 'USER' | 'AGENT' | 'SYSTEM'
  actor_id: string | null
  payload: JsonObject
  occurred_at: string | Date
}

export async function lockDomainEventIdentity(
  db: Queryable,
  companyId: string,
  aggregateType: string,
  aggregateId: string,
  idempotencyKey: string,
): Promise<void> {
  const keys = [
    `domain-event:aggregate:${companyId}:${aggregateType}:${aggregateId}`,
    `domain-event:idempotency:${companyId}:${idempotencyKey}`,
  ].sort()
  await db.query(
    `SELECT pg_advisory_xact_lock(hashtextextended(lock_key,0))
       FROM unnest($1::text[]) AS lock(lock_key)
      ORDER BY lock_key`,
    [keys],
  )
}

export async function findDomainEventByIdempotencyKey(
  db: Queryable,
  companyId: string,
  idempotencyKey: string,
): Promise<DomainEventRow | undefined> {
  const { rows } = await db.query<DomainEventRow>(
    `SELECT * FROM domain_events WHERE company_id=$1 AND idempotency_key=$2`,
    [companyId, idempotencyKey],
  )
  return rows[0]
}

export async function insertDomainEvent(
  db: Queryable,
  input: {
    id: string
    companyId: string
    projectId?: string
    aggregateType: string
    aggregateId: string
    eventType: string
    schemaVersion: number
    idempotencyKey: string
    actorType: 'USER' | 'AGENT' | 'SYSTEM'
    actorId?: string
    payload: JsonObject
  },
): Promise<DomainEventRow> {
  const { rows } = await db.query<DomainEventRow>(
    `INSERT INTO domain_events(
       id,company_id,project_id,aggregate_type,aggregate_id,aggregate_sequence,
       event_type,schema_version,idempotency_key,actor_type,actor_id,payload
     ) SELECT $1,$2,$3,$4,$5,
       COALESCE(MAX(prior.aggregate_sequence),0)+1,$6,$7,$8,$9,$10,$11::jsonb
       FROM domain_events prior
      WHERE prior.company_id=$2 AND prior.aggregate_type=$4 AND prior.aggregate_id=$5
     RETURNING *`,
    [
      input.id, input.companyId, input.projectId ?? null, input.aggregateType, input.aggregateId,
      input.eventType, input.schemaVersion, input.idempotencyKey, input.actorType,
      input.actorId ?? null, JSON.stringify(input.payload),
    ],
  )
  return rows[0]!
}

export async function listDomainEventRowsAfter(
  db: Queryable,
  input: { companyId: string; projectId?: string; afterSequence: number; limit: number },
): Promise<DomainEventRow[]> {
  const { rows } = await db.query<DomainEventRow>(
    `SELECT * FROM domain_events
      WHERE company_id=$1 AND sequence>$2
        AND ($3::text IS NULL OR project_id=$3)
      ORDER BY sequence
      LIMIT $4`,
    [input.companyId, input.afterSequence, input.projectId ?? null, input.limit],
  )
  return rows
}

export async function latestProjectEventSequenceRow(
  db: Queryable,
  companyId: string,
  projectId: string,
): Promise<number> {
  const { rows } = await db.query<{ sequence: string }>(
    `SELECT COALESCE(MAX(sequence),0)::text AS sequence FROM domain_events
      WHERE company_id=$1 AND project_id=$2`,
    [companyId, projectId],
  )
  return Number(rows[0]?.sequence ?? 0)
}

export async function projectEventTypeCountRows(db: Queryable, input: {
  companyId: string; projectId: string; afterSequence: number; throughSequence: number
}): Promise<Array<{ event_type: string; count: number }>> {
  const { rows } = await db.query<{ event_type: string; count: number }>(
    `SELECT event_type,COUNT(*)::int AS count FROM domain_events
      WHERE company_id=$1 AND project_id=$2 AND sequence>$3 AND sequence<=$4
      GROUP BY event_type ORDER BY event_type`,
    [input.companyId, input.projectId, input.afterSequence, input.throughSequence],
  )
  return rows
}
