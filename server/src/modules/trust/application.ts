import { createHash } from 'node:crypto'
import type { Queryable } from '../../db/queryable.js'
import { createPermissionService } from '../access/public.js'
import { appendDomainEventInTransaction } from '../events/public.js'
import { createEvidenceRecordInTransaction, readProductEvidenceChain } from '../evidence/public.js'
import { canonicalJson } from './canonical-json.js'
import type { CreateTrustSnapshotRequest, TrustAudienceLevel } from './contracts.js'
import {
  findTrustSnapshot,
  findTrustProject,
  insertTrustSnapshot,
  listTrustKpis,
  type TrustAccessContext,
} from './repository.js'

export interface TrustInfrastructure {
  transaction<T>(work: (db: Queryable) => Promise<T>): Promise<T>
  sign(canonicalPayload: string): string
  verify(canonicalPayload: string, signature: string): boolean
  now(): Date
  auditInTransaction(db: Queryable, input: {
    kind: string; userId: string; companyId: string; detail: Record<string, unknown>
  }): Promise<void>
}

export class TrustApplicationError extends Error {
  constructor(readonly code: 'not_found' | 'forbidden' | 'conflict', message: string) {
    super(message)
  }
}

function snapshotId(companyId: string, projectId: string, idempotencyKey: string): string {
  return `trust-snapshot-${createHash('sha256').update(`${companyId}:${projectId}:${idempotencyKey}`).digest('hex').slice(0, 32)}`
}

function evidenceId(id: string): string {
  return `trust-evidence-${createHash('sha256').update(id).digest('hex').slice(0, 32)}`
}

function levelRank(level: TrustAudienceLevel): number {
  return level === 'L3' ? 3 : 2
}

export class TrustApplication {
  constructor(private readonly infrastructure: TrustInfrastructure) {}

  private async access(db: Queryable, actorUserId: string, companyId: string, projectId: string) {
    const permissions = createPermissionService(db)
    const companyContext = await permissions.assertCan({ actorUserId, action: 'company:read', companyId })
    const [companyLeader, projectLeader, teacher] = await Promise.all([
      permissions.can({ actorUserId, action: 'trust:read_l3_company', companyId }),
      permissions.can({ actorUserId, action: 'trust:read_l3_project', companyId, projectId }),
      permissions.can({ actorUserId, action: 'trust:read_l2', companyId, projectId }),
    ])
    const project = await findTrustProject(db, companyId, projectId)
    if (!project) throw new TrustApplicationError('not_found', 'Project not found')
    const educationLeader = companyContext.company.type === 'EDUCATION'
      && (companyLeader.allowed || projectLeader.allowed)
    if (!educationLeader && !teacher.allowed) {
      throw new TrustApplicationError('forbidden', 'Trust access requires a Teacher or Education leader')
    }
    return {
      companyId,
      projectId,
      companyType: companyContext.company.type,
      projectName: project.name,
      projectKind: project.kind,
      projectStatus: project.status,
      audienceLevel: educationLeader ? 'L3' as const : 'L2' as const,
    }
  }

  private contextPayload(context: TrustAccessContext) {
    return {
      mode: 'LIVE' as const,
      companyId: context.companyId,
      projectId: context.projectId,
      project: { name: context.projectName, kind: context.projectKind, status: context.projectStatus },
      audienceLevel: context.audienceLevel,
      maximumEvidenceLevel: context.audienceLevel,
    }
  }

  context(actorUserId: string, companyId: string, projectId: string) {
    return this.infrastructure.transaction(async (db) => this.contextPayload(
      await this.access(db, actorUserId, companyId, projectId),
    ))
  }

  kpis(actorUserId: string, companyId: string, projectId: string) {
    return this.infrastructure.transaction(async (db) => {
      await this.access(db, actorUserId, companyId, projectId)
      return listTrustKpis(db, companyId, projectId)
    })
  }

  evidenceChain(actorUserId: string, companyId: string, projectId: string) {
    return this.infrastructure.transaction(async (db) => {
      const context = await this.access(db, actorUserId, companyId, projectId)
      return readProductEvidenceChain(db, {
        companyId,
        projectId,
        maximumLevel: context.audienceLevel,
        limit: 100,
      })
    })
  }

  createSnapshot(actorUserId: string, companyId: string, projectId: string, request: CreateTrustSnapshotRequest) {
    const id = snapshotId(companyId, projectId, request.idempotencyKey)
    return this.infrastructure.transaction(async (db) => {
      const context = await this.access(db, actorUserId, companyId, projectId)
      const replay = await findTrustSnapshot(db, { id, companyId, projectId })
      if (replay) return this.verifiedSnapshot(replay, context.audienceLevel)
      const [kpis, evidenceChain] = await Promise.all([
        listTrustKpis(db, companyId, projectId),
        readProductEvidenceChain(db, {
          companyId,
          projectId,
          maximumLevel: context.audienceLevel,
          limit: 100,
        }),
      ])
      const snapshotEvidenceId = evidenceId(id)
      const payload = {
        mode: 'SIGNED_SNAPSHOT',
        snapshotId: id,
        evidenceId: snapshotEvidenceId,
        dataset: 'lingxiloop-trust',
        release: 'trust-bff-v1',
        capturedAt: this.infrastructure.now().toISOString(),
        context: this.contextPayload(context),
        kpis,
        evidenceChain,
      }
      const canonical = canonicalJson(payload)
      if (Buffer.byteLength(canonical, 'utf8') > 1_048_576) {
        throw new TrustApplicationError('conflict', 'Trust snapshot exceeds 1 MiB')
      }
      const payloadHash = createHash('sha256').update(canonical).digest('hex')
      const signature = this.infrastructure.sign(canonical)
      const normalizedPayload = JSON.parse(canonical) as Record<string, unknown>
      await createEvidenceRecordInTransaction(db, {
        id: snapshotEvidenceId,
        companyId,
        projectId,
        level: 'L2',
        derivation: 'COMPUTED',
        kind: 'TRUST_SNAPSHOT',
        data: { snapshotId: id, payloadHash, audienceLevel: context.audienceLevel },
        createdBy: { type: 'USER', id: actorUserId },
      })
      await insertTrustSnapshot(db, {
        id, companyId, projectId, audienceLevel: context.audienceLevel,
        payload: normalizedPayload, payloadHash, signature, evidenceId: snapshotEvidenceId, actorUserId,
      })
      await appendDomainEventInTransaction(db, {
        companyId,
        projectId,
        aggregateType: 'TRUST_SNAPSHOT',
        aggregateId: id,
        idempotencyKey: `trust-snapshot:${id}:created`,
        actor: { type: 'USER', id: actorUserId },
        event: { eventType: 'TRUST_SNAPSHOT.CREATED', schemaVersion: 1, payload: { evidenceId: snapshotEvidenceId, payloadHash } },
      })
      await this.infrastructure.auditInTransaction(db, {
        kind: 'trust_snapshot_created',
        userId: actorUserId,
        companyId,
        detail: { projectId, snapshotId: id, evidenceId: snapshotEvidenceId, payloadHash },
      })
      return { id, evidenceId: snapshotEvidenceId, payloadHash, signature, payload: normalizedPayload }
    })
  }

  readSnapshot(actorUserId: string, companyId: string, projectId: string, id: string) {
    return this.infrastructure.transaction(async (db) => {
      const context = await this.access(db, actorUserId, companyId, projectId)
      const snapshot = await findTrustSnapshot(db, { id, companyId, projectId })
      if (!snapshot) throw new TrustApplicationError('not_found', 'Trust snapshot not found')
      return this.verifiedSnapshot(snapshot, context.audienceLevel)
    })
  }

  private verifiedSnapshot(snapshot: NonNullable<Awaited<ReturnType<typeof findTrustSnapshot>>>, audience: TrustAudienceLevel) {
    if (levelRank(audience) < levelRank(snapshot.audience_level)) {
      throw new TrustApplicationError('forbidden', 'Trust snapshot audience exceeds current access')
    }
    const canonical = canonicalJson(snapshot.payload)
    const payloadHash = createHash('sha256').update(canonical).digest('hex')
    if (payloadHash !== snapshot.payload_hash || !this.infrastructure.verify(canonical, snapshot.signature)) {
      throw new TrustApplicationError('conflict', 'Trust snapshot integrity verification failed')
    }
    return {
      id: snapshot.id,
      evidenceId: snapshot.evidence_id,
      payloadHash: snapshot.payload_hash,
      signature: snapshot.signature,
      payload: snapshot.payload,
    }
  }
}
