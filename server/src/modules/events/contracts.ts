import type { Queryable } from '../../db/queryable.js'

export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[]
export interface JsonObject { [key: string]: JsonValue }

export type DomainEventActor =
  | { type: 'SYSTEM' }
  | { type: 'USER' | 'AGENT'; id: string }

export interface DomainEventDefinition<TType extends string, TPayload extends JsonObject> {
  eventType: TType
  schemaVersion: number
  payload: TPayload
}

export interface AppendDomainEventInput<TType extends string, TPayload extends JsonObject> {
  companyId: string
  projectId?: string
  aggregateType: string
  aggregateId: string
  idempotencyKey: string
  actor: DomainEventActor
  event: DomainEventDefinition<TType, TPayload>
}

export interface DomainEventEnvelope<TType extends string = string, TPayload extends JsonObject = JsonObject> {
  id: string
  companyId: string
  projectId?: string
  aggregateType: string
  aggregateId: string
  sequence: number
  aggregateSequence: number
  eventType: TType
  schemaVersion: number
  idempotencyKey: string
  actor: DomainEventActor
  payload: TPayload
  occurredAt: string
}

export type DomainEventTransaction = <T>(work: (db: Queryable) => Promise<T>) => Promise<T>
