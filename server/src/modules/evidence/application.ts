import { randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import type { Queryable } from '../../db/queryable.js'
import type { DomainEventTransaction, JsonObject } from '../events/public.js'
import type {
  CreateEvidenceClaimInput,
  CreateEvidenceRecordInput,
  EvidenceLinkInput,
  EvidenceRecord,
} from './contracts.js'
import {
  countScopedEvidenceRecords,
  evidenceTargetExists,
  findEvidenceRecord,
  insertEvidenceClaim,
  insertEvidenceLink,
  insertEvidenceRecord,
  listEvidenceChainRecords,
  modelRunBelongsToCompany,
} from './repository.js'
import type { EvidenceChainRecord, EvidenceTargetLevel } from './contracts.js'

function boundedText(value: string, name: string, max: number): string {
  const normalized = value.trim()
  if (!normalized || normalized.length > max) throw new Error(`${name} must contain between 1 and ${max} characters`)
  return normalized
}

function assertBoundedData(data: JsonObject): void {
  if (!data || Array.isArray(data) || typeof data !== 'object') throw new Error('Evidence data must be an object')
  if (Buffer.byteLength(JSON.stringify(data), 'utf8') > 32_768) throw new Error('Evidence data exceeds 32768 bytes')
}

function exactReplay<TData extends JsonObject>(
  existing: EvidenceRecord,
  input: CreateEvidenceRecordInput<TData>,
): boolean {
  return existing.level === input.level
    && existing.derivation === input.derivation
    && existing.kind === input.kind
    && existing.subjectUserId === input.subjectUserId
    && isDeepStrictEqual(existing.data, input.data)
    && isDeepStrictEqual(existing.createdBy, input.createdBy)
}

export async function createEvidenceRecordInTransaction<TData extends JsonObject>(
  db: Queryable,
  input: CreateEvidenceRecordInput<TData>,
): Promise<EvidenceRecord<TData>> {
  boundedText(input.id, 'Evidence id', 200)
  boundedText(input.companyId, 'companyId', 200)
  boundedText(input.projectId, 'projectId', 200)
  boundedText(input.kind, 'Evidence kind', 100)
  assertBoundedData(input.data)
  const existing = await findEvidenceRecord(db, input)
  if (existing) {
    if (!exactReplay(existing, input)) throw new Error('Evidence id already used with different content')
    return existing as EvidenceRecord<TData>
  }
  return insertEvidenceRecord(db, input)
}

export async function createEvidenceWithLinksInTransaction<TData extends JsonObject>(
  db: Queryable,
  input: CreateEvidenceRecordInput<TData>,
  links: EvidenceLinkInput[],
): Promise<EvidenceRecord<TData>> {
  if (links.length > 64) throw new Error('Evidence links are limited to 64 items')
  const record = await createEvidenceRecordInTransaction(db, input)
  for (const link of links) {
    boundedText(link.targetId, 'Evidence target id', 200)
    if (!await evidenceTargetExists(db, { ...input, ...link })) {
      throw new Error(`Evidence target is outside the current Project: ${link.targetKind}:${link.targetId}`)
    }
    await insertEvidenceLink(db, {
      id: randomUUID(),
      companyId: input.companyId,
      projectId: input.projectId,
      evidenceId: record.id,
      link,
    })
  }
  return record
}

export function createEvidenceRecord<TData extends JsonObject>(
  transaction: DomainEventTransaction,
  input: CreateEvidenceRecordInput<TData>,
  links: EvidenceLinkInput[] = [],
): Promise<EvidenceRecord<TData>> {
  return transaction((db) => createEvidenceWithLinksInTransaction(db, input, links))
}

export async function createEvidenceClaim(
  transaction: DomainEventTransaction,
  input: CreateEvidenceClaimInput,
): Promise<{ id: string; status: 'PENDING'; humanReviewRequired: true }> {
  const evidenceIds = [...new Set(input.evidenceIds)]
  if (evidenceIds.length < 1 || evidenceIds.length > 64) {
    throw new Error('Inferred Claims require between 1 and 64 Evidence IDs')
  }
  boundedText(input.claimType, 'Claim type', 100)
  boundedText(input.statement, 'Claim statement', 10_000)
  return transaction(async (db) => {
    if (!await modelRunBelongsToCompany(db, input.companyId, input.modelRunId)) {
      throw new Error('Claim model run is outside the current Company')
    }
    if (await countScopedEvidenceRecords(db, { ...input, evidenceIds }) !== evidenceIds.length) {
      throw new Error('Claim Evidence is outside the current Project')
    }
    await insertEvidenceClaim(db, { ...input, evidenceIds })
    return { id: input.id, status: 'PENDING', humanReviewRequired: true }
  })
}

const PRODUCT_LINK_LEVELS = {
  L0: ['L0'],
  L1: ['L0', 'L1'],
  L2: ['L0', 'L1', 'L2'],
  L3: ['L0', 'L1', 'L2', 'L3'],
} as const satisfies Record<Exclude<EvidenceTargetLevel, 'L4'>, readonly EvidenceTargetLevel[]>

export function readProductEvidenceChain(
  db: Queryable,
  input: {
    companyId: string
    projectId: string
    subjectUserId?: string
    maximumLevel: Exclude<EvidenceTargetLevel, 'L4'>
    limit?: number
  },
): Promise<EvidenceChainRecord[]> {
  if ((input.maximumLevel as EvidenceTargetLevel) === 'L4') {
    throw new Error('L4 Evidence is unavailable through product queries')
  }
  const limit = input.limit ?? 100
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error('Evidence query limit must be between 1 and 100')
  }
  const recordLevels = input.maximumLevel === 'L0'
    ? []
    : input.maximumLevel === 'L1' ? ['L1' as const] : ['L1' as const, 'L2' as const]
  return listEvidenceChainRecords(db, {
    ...input,
    recordLevels,
    linkLevels: [...PRODUCT_LINK_LEVELS[input.maximumLevel]],
    limit,
  })
}
