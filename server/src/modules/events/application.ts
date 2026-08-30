import { randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import type { Queryable } from '../../db/queryable.js'
import type {
  AppendDomainEventInput,
  DomainEventActor,
  DomainEventEnvelope,
  DomainEventTransaction,
  JsonObject,
} from './contracts.js'
import {
  findDomainEventByIdempotencyKey,
  insertDomainEvent,
  listDomainEventRowsAfter,
  lockDomainEventIdentity,
  type DomainEventRow,
} from './repository.js'

const MAX_EVENT_PAYLOAD_BYTES = 32_768

function boundedText(value: string, name: string, maxLength: number): string {
  const normalized = value.trim()
  if (!normalized || normalized.length > maxLength) {
    throw new Error(`${name} must contain between 1 and ${maxLength} characters`)
  }
  return normalized
}

function validatedPayload(payload: JsonObject): JsonObject {
  if (!payload || Array.isArray(payload) || Object.getPrototypeOf(payload) !== Object.prototype) {
    throw new Error('domain event payload must be a plain JSON object')
  }
  let encoded: string
  try {
    encoded = JSON.stringify(payload)
  } catch {
    throw new Error('domain event payload must be JSON serializable')
  }
  const decoded = JSON.parse(encoded) as JsonObject
  if (!isDeepStrictEqual(payload, decoded)) {
    throw new Error('domain event payload must contain only JSON values')
  }
  if (Buffer.byteLength(encoded, 'utf8') > MAX_EVENT_PAYLOAD_BYTES) {
    throw new Error(`domain event payload exceeds ${MAX_EVENT_PAYLOAD_BYTES} bytes`)
  }
  return payload
}

function actorFromRow(row: DomainEventRow): DomainEventActor {
  return row.actor_type === 'SYSTEM'
    ? { type: 'SYSTEM' }
    : { type: row.actor_type, id: row.actor_id! }
}

function envelope(row: DomainEventRow): DomainEventEnvelope {
  return {
    id: row.id,
    companyId: row.company_id,
    ...(row.project_id ? { projectId: row.project_id } : {}),
    aggregateType: row.aggregate_type,
    aggregateId: row.aggregate_id,
    sequence: Number(row.sequence),
    aggregateSequence: Number(row.aggregate_sequence),
    eventType: row.event_type,
    schemaVersion: row.schema_version,
    idempotencyKey: row.idempotency_key,
    actor: actorFromRow(row),
    payload: row.payload,
    occurredAt: row.occurred_at instanceof Date ? row.occurred_at.toISOString() : String(row.occurred_at),
  }
}

function sameRequest(existing: DomainEventEnvelope, input: AppendDomainEventInput<string, JsonObject>): boolean {
  return existing.companyId === input.companyId
    && existing.projectId === input.projectId
    && existing.aggregateType === input.aggregateType
    && existing.aggregateId === input.aggregateId
    && existing.eventType === input.event.eventType
    && existing.schemaVersion === input.event.schemaVersion
    && isDeepStrictEqual(existing.actor, input.actor)
    && isDeepStrictEqual(existing.payload, input.event.payload)
}

async function appendDomainEventInTransaction<TType extends string, TPayload extends JsonObject>(
  db: Queryable,
  rawInput: AppendDomainEventInput<TType, TPayload>,
): Promise<DomainEventEnvelope<TType, TPayload>> {
  const input: AppendDomainEventInput<TType, TPayload> = {
    ...rawInput,
    companyId: boundedText(rawInput.companyId, 'companyId', 200),
    ...(rawInput.projectId ? { projectId: boundedText(rawInput.projectId, 'projectId', 200) } : {}),
    aggregateType: boundedText(rawInput.aggregateType, 'aggregateType', 100),
    aggregateId: boundedText(rawInput.aggregateId, 'aggregateId', 200),
    idempotencyKey: boundedText(rawInput.idempotencyKey, 'idempotencyKey', 200),
    actor: rawInput.actor.type === 'SYSTEM'
      ? rawInput.actor
      : { type: rawInput.actor.type, id: boundedText(rawInput.actor.id, 'actorId', 200) },
    event: {
      eventType: boundedText(rawInput.event.eventType, 'eventType', 160) as TType,
      schemaVersion: rawInput.event.schemaVersion,
      payload: validatedPayload(rawInput.event.payload) as TPayload,
    },
  }
  if (!Number.isInteger(input.event.schemaVersion) || input.event.schemaVersion < 1) {
    throw new Error('schemaVersion must be a positive integer')
  }
  await lockDomainEventIdentity(
    db, input.companyId, input.aggregateType, input.aggregateId, input.idempotencyKey,
  )
  const prior = await findDomainEventByIdempotencyKey(db, input.companyId, input.idempotencyKey)
  if (prior) {
    const replay = envelope(prior)
    if (!sameRequest(replay, input)) throw new Error('domain event idempotency key was reused')
    return replay as DomainEventEnvelope<TType, TPayload>
  }
  return envelope(await insertDomainEvent(db, {
    id: randomUUID(),
    companyId: input.companyId,
    ...(input.projectId ? { projectId: input.projectId } : {}),
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
    eventType: input.event.eventType,
    schemaVersion: input.event.schemaVersion,
    idempotencyKey: input.idempotencyKey,
    actorType: input.actor.type,
    ...(input.actor.type === 'SYSTEM' ? {} : { actorId: input.actor.id }),
    payload: input.event.payload,
  })) as DomainEventEnvelope<TType, TPayload>
}

export function appendDomainEvent<TType extends string, TPayload extends JsonObject>(
  transaction: DomainEventTransaction,
  input: AppendDomainEventInput<TType, TPayload>,
): Promise<DomainEventEnvelope<TType, TPayload>> {
  return transaction((db) => appendDomainEventInTransaction(db, input))
}

export function commitDomainEvent<TResult, TType extends string, TPayload extends JsonObject>(
  transaction: DomainEventTransaction,
  mutation: (db: Queryable) => Promise<TResult>,
  eventForResult: (result: TResult) => AppendDomainEventInput<TType, TPayload> | null,
): Promise<{ result: TResult; event: DomainEventEnvelope<TType, TPayload> | null }> {
  return transaction(async (db) => {
    const result = await mutation(db)
    const input = eventForResult(result)
    const event = input ? await appendDomainEventInTransaction(db, input) : null
    return { result, event }
  })
}

export async function readDomainEventsAfter(
  db: Queryable,
  input: { companyId: string; projectId?: string; afterSequence?: number; limit?: number },
): Promise<DomainEventEnvelope[]> {
  const afterSequence = input.afterSequence ?? 0
  const limit = input.limit ?? 100
  if (!Number.isSafeInteger(afterSequence) || afterSequence < 0) {
    throw new Error('afterSequence must be a non-negative safe integer')
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error('domain event cursor limit must be between 1 and 100')
  }
  return (await listDomainEventRowsAfter(db, {
    companyId: boundedText(input.companyId, 'companyId', 200),
    ...(input.projectId ? { projectId: boundedText(input.projectId, 'projectId', 200) } : {}),
    afterSequence,
    limit,
  })).map(envelope)
}
