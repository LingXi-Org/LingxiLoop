import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
import type { AgentWorkItem, LingxiMessageV1 } from '../../agent-os/types.js'
import type { Queryable } from '../../db/queryable.js'
import type { Storage } from '../../storage.js'
import {
  type ApprovePresentationOutlineInput,
  type CreatePresentationInput,
  type PresentationDetailV1,
  type PresentationSourceSnapshotItem,
  type PresentationVersionSummaryV1,
  type RevisePresentationInput,
  type RevisePresentationOutlineInput,
  approvePresentationOutlineRequestSchema,
  createPresentationRequestSchema,
  retryPresentationRequestSchema,
  revisePresentationOutlineRequestSchema,
  revisePresentationRequestSchema,
} from './contracts.js'
import {
  approvePresentationOutline,
  cancelPresentationJobs,
  findAccessiblePresentation,
  findAccessiblePresentationVersion,
  findPrivatePresentationDeliveryChannel,
  findPresentationByIdempotency,
  insertPresentation,
  insertPresentationJob,
  latestPresentationJobForRetry,
  listAccessiblePresentationVersions,
  presentationDetail,
  presentationVersionSummary,
  requestPresentationOutlineRevision,
  resolvePresentationCreationScope,
  setPresentationStatus,
  type PresentationRow,
} from './repository.js'

export type PresentationApplicationErrorCode =
  | 'feature_disabled'
  | 'not_found'
  | 'conflict'
  | 'invalid_state'
  | 'private_delivery_unavailable'

export class PresentationApplicationError extends Error {
  constructor(readonly code: PresentationApplicationErrorCode, message: string) {
    super(message)
  }
}

export interface PresentationApplicationInfrastructure {
  db: Queryable
  transaction<T>(work: (db: Queryable) => Promise<T>): Promise<T>
  storage: Pick<Storage, 'readObject'>
  enabled(): boolean
  sendArtifactCard(input: {
    companyId: string
    channelId: string
    agentId: string
    clientMsgNo: string
    presentationId: string
    title: string
  }): Promise<void>
}

function newId(prefix: string): string {
  return `${prefix}-${randomUUID()}`
}

function buildArtifactClientMsgNo(presentationId: string, agentId: string): string {
  const agentKey = createHash('sha256').update(agentId).digest('hex').slice(0, 16)
  return `presentation-card-${presentationId}-${agentKey}`
}

function actorUserId(work: AgentWorkItem): string {
  const id = work.authorizationUserId?.trim()
  if (!id) throw new Error('Agent work has no persisted human authorization principal')
  return id
}

function privateAgentView(detail: PresentationDetailV1): PresentationDetailV1 | {
  id: string
  status: string
  visibilityScope: 'PRIVATE'
  deliveryState: 'privateDirect'
} {
  return detail.visibilityScope === 'PRIVATE'
    ? { id: detail.id, status: detail.status, visibilityScope: 'PRIVATE', deliveryState: 'privateDirect' }
    : detail
}

function sourcesSnapshot(rows: Array<PresentationSourceSnapshotItem & { externalSourceId?: string | null }>): PresentationSourceSnapshotItem[] {
  return rows.map(({ externalSourceId: _externalSourceId, ...source }) => source)
}

export class PresentationsApplication {
  constructor(private readonly infrastructure: PresentationApplicationInfrastructure) {}

  private requireEnabled(): void {
    if (!this.infrastructure.enabled()) {
      throw new PresentationApplicationError('feature_disabled', 'HTML presentation generation is disabled')
    }
  }

  async createForAgent(work: AgentWorkItem, rawInput: CreatePresentationInput): Promise<ReturnType<typeof privateAgentView>> {
    this.requireEnabled()
    const input = createPresentationRequestSchema.parse(rawInput)
    const authorizationUserId = actorUserId(work)
    const created = await this.infrastructure.transaction(async (db) => {
      const replay = await findPresentationByIdempotency(db, work.companyId, input.idempotencyKey)
      if (replay) {
        if (replay.authorization_user_id !== authorizationUserId
          || replay.conversation_id !== work.channelId
          || replay.artifact_client_msg_no !== buildArtifactClientMsgNo(replay.id, work.agentId)) {
          throw new PresentationApplicationError('conflict', 'presentation request identity is already in use')
        }
        const deliveryChannelId = replay.visibility_scope === 'PRIVATE'
          ? await findPrivatePresentationDeliveryChannel(db, {
            companyId: work.companyId,
            projectId: replay.project_id,
            authorizationUserId,
            agentId: work.agentId,
          })
          : replay.conversation_id
        if (!deliveryChannelId) {
          throw new PresentationApplicationError(
            'private_delivery_unavailable',
            'private presentation delivery is unavailable',
          )
        }
        return { row: replay, deliveryChannelId }
      }
      const scope = await resolvePresentationCreationScope(db, {
        companyId: work.companyId,
        conversationId: work.channelId,
        authorizationUserId,
        ...(input.sourceIds ? { sourceIds: input.sourceIds } : {}),
      })
      const sourceSnapshot = sourcesSnapshot(scope.sources)
      const visibilityScope = sourceSnapshot.some((source) => source.visibilityScope === 'PRIVATE') ? 'PRIVATE' : 'PROJECT'
      const deliveryChannelId = visibilityScope === 'PRIVATE'
        ? await findPrivatePresentationDeliveryChannel(db, {
          companyId: work.companyId,
          projectId: scope.projectId,
          authorizationUserId,
          agentId: work.agentId,
        })
        : work.channelId
      if (!deliveryChannelId) {
        throw new PresentationApplicationError(
          'private_delivery_unavailable',
          'private presentation delivery is unavailable',
        )
      }
      const status = sourceSnapshot.every((source) => source.status === 'ready') ? 'planning' : 'waitingForSources'
      const id = newId('presentation')
      const title = input.title?.trim() || input.requirements.trim().split(/\r?\n/, 1)[0]!.slice(0, 160) || '资料演示'
      const artifactClientMsgNo = buildArtifactClientMsgNo(id, work.agentId)
      const row = await insertPresentation(db, {
        id,
        companyId: work.companyId,
        projectId: scope.projectId,
        conversationId: work.channelId,
        authorizationUserId,
        visibilityScope,
        title,
        requestText: input.requirements,
        targetPageCount: input.targetSlideCount ?? 24,
        sources: sourceSnapshot,
        status,
        artifactClientMsgNo,
      })
      await insertPresentationJob(db, {
        id: newId('presentation-job'),
        companyId: work.companyId,
        presentationId: id,
        kind: 'initial',
        stage: status,
        checkpoint: { language: input.language ?? 'zh-CN' },
        idempotencyKey: input.idempotencyKey,
      })
      return { row, deliveryChannelId }
    })
    await this.infrastructure.sendArtifactCard({
      companyId: work.companyId,
      channelId: created.deliveryChannelId,
      agentId: work.agentId,
      clientMsgNo: created.row.artifact_client_msg_no!,
      presentationId: created.row.id,
      title: created.row.title,
    })
    return privateAgentView(presentationDetail(created.row))
  }

  async get(companyId: string, authorizationUserId: string, presentationId: string): Promise<PresentationDetailV1> {
    const found = await findAccessiblePresentation(this.infrastructure.db, { companyId, authorizationUserId, presentationId })
    if (!found) throw new PresentationApplicationError('not_found', 'presentation not found')
    return presentationDetail(found.presentation, found.latestVersion)
  }

  async getForAgent(work: AgentWorkItem, presentationId: string) {
    return privateAgentView(await this.get(work.companyId, actorUserId(work), presentationId))
  }

  async approveOutline(companyId: string, authorizationUserId: string, presentationId: string, raw: ApprovePresentationOutlineInput): Promise<PresentationDetailV1> {
    this.requireEnabled()
    const input = approvePresentationOutlineRequestSchema.parse(raw)
    await this.infrastructure.transaction(async (db) => {
      if (!await approvePresentationOutline(db, { companyId, presentationId, authorizationUserId, expectedRevision: input.expectedRevision })) {
        throw new PresentationApplicationError('conflict', 'presentation outline changed or is not awaiting approval')
      }
      await insertPresentationJob(db, {
        id: newId('presentation-job'), companyId, presentationId, kind: 'initial', stage: 'generating',
        idempotencyKey: input.idempotencyKey ?? `approve:${presentationId}:${input.expectedRevision}`,
      })
    })
    return this.get(companyId, authorizationUserId, presentationId)
  }

  async reviseOutline(companyId: string, authorizationUserId: string, presentationId: string, raw: RevisePresentationOutlineInput): Promise<PresentationDetailV1> {
    this.requireEnabled()
    const input = revisePresentationOutlineRequestSchema.parse(raw)
    await this.infrastructure.transaction(async (db) => {
      if (!await requestPresentationOutlineRevision(db, {
        companyId, presentationId, authorizationUserId, expectedRevision: input.expectedRevision,
        ...(input.targetSlideCount == null ? {} : { targetSlideCount: input.targetSlideCount }),
      })) throw new PresentationApplicationError('conflict', 'presentation outline changed or cannot accept the requested page count')
      await insertPresentationJob(db, {
        id: newId('presentation-job'), companyId, presentationId, kind: 'outlineRevision', stage: 'planning',
        checkpoint: {
          ...(input.feedback ? { feedback: input.feedback } : {}),
          ...(input.targetSlideCount == null ? {} : { targetSlideCount: input.targetSlideCount }),
        },
        idempotencyKey: input.idempotencyKey,
      })
    })
    return this.get(companyId, authorizationUserId, presentationId)
  }

  async revise(companyId: string, authorizationUserId: string, presentationId: string, raw: RevisePresentationInput): Promise<PresentationDetailV1> {
    this.requireEnabled()
    const input = revisePresentationRequestSchema.parse(raw)
    await this.infrastructure.transaction(async (db) => {
      if (!await setPresentationStatus(db, {
        companyId, presentationId, authorizationUserId, status: 'generating', allowedStatuses: ['ready'],
      })) throw new PresentationApplicationError('invalid_state', 'only a ready presentation can be revised')
      await insertPresentationJob(db, {
        id: newId('presentation-job'), companyId, presentationId, kind: 'deckRevision', stage: 'generating',
        checkpoint: input, idempotencyKey: input.idempotencyKey,
      })
    })
    return this.get(companyId, authorizationUserId, presentationId)
  }

  async cancel(companyId: string, authorizationUserId: string, presentationId: string): Promise<PresentationDetailV1> {
    await this.infrastructure.transaction(async (db) => {
      if (!await setPresentationStatus(db, {
        companyId, presentationId, authorizationUserId, status: 'cancelled',
        allowedStatuses: ['waitingForSources', 'planning', 'awaitingOutlineApproval', 'generating', 'validating', 'needsAttention', 'failed'],
      })) throw new PresentationApplicationError('invalid_state', 'presentation cannot be cancelled in its current state')
      await cancelPresentationJobs(db, companyId, presentationId)
    })
    return this.get(companyId, authorizationUserId, presentationId)
  }

  async retry(companyId: string, authorizationUserId: string, presentationId: string, raw: { idempotencyKey: string }): Promise<PresentationDetailV1> {
    this.requireEnabled()
    const input = retryPresentationRequestSchema.parse(raw)
    await this.infrastructure.transaction(async (db) => {
      const found = await findAccessiblePresentation(db, { companyId, authorizationUserId, presentationId })
      if (!found) throw new PresentationApplicationError('not_found', 'presentation not found')
      if (found.presentation.status === 'needsAttention'
        && found.presentation.recommended_page_count != null
        && Number(found.presentation.recommended_page_count) < Number(found.presentation.target_page_count)) {
        throw new PresentationApplicationError('invalid_state', 'accept the recommended shorter length with revise_outline before retrying')
      }
      const latestJob = await latestPresentationJobForRetry(db, companyId, presentationId)
      const attentionFromStage = typeof latestJob?.checkpoint.attentionFromStage === 'string'
        ? latestJob.checkpoint.attentionFromStage
        : null
      const stage = latestJob?.kind === 'outlineRevision'
        || latestJob?.stage === 'planning'
        || attentionFromStage === 'planning'
        || !found.presentation.outline
        ? 'planning'
        : 'generating'
      const kind = latestJob?.kind ?? (found.presentation.latest_version_id ? 'deckRevision' : 'initial')
      if (!await setPresentationStatus(db, {
        companyId, presentationId, authorizationUserId, status: stage,
        allowedStatuses: ['failed', 'needsAttention'],
      })) throw new PresentationApplicationError('invalid_state', 'presentation is not retryable')
      await insertPresentationJob(db, {
        id: newId('presentation-job'), companyId, presentationId,
        kind, stage,
        checkpoint: { retry: true, retriedJobKind: kind, retriedJobStage: latestJob?.stage ?? null },
        idempotencyKey: input.idempotencyKey,
      })
    })
    return this.get(companyId, authorizationUserId, presentationId)
  }

  async listVersions(companyId: string, authorizationUserId: string, presentationId: string): Promise<{
    schemaVersion: 'presentation_version_list_v1'; versions: PresentationVersionSummaryV1[]
  }> {
    await this.get(companyId, authorizationUserId, presentationId)
    const versions = await listAccessiblePresentationVersions(this.infrastructure.db, { companyId, authorizationUserId, presentationId })
    return { schemaVersion: 'presentation_version_list_v1', versions: versions.map(presentationVersionSummary) }
  }

  async readVersion(companyId: string, authorizationUserId: string, presentationId: string, versionId: string): Promise<{
    bytes: Buffer; title: string
  }> {
    const [detail, version] = await Promise.all([
      this.get(companyId, authorizationUserId, presentationId),
      findAccessiblePresentationVersion(this.infrastructure.db, { companyId, authorizationUserId, presentationId, versionId }),
    ])
    if (!version) throw new PresentationApplicationError('not_found', 'presentation version not found')
    const bytes = await this.infrastructure.storage.readObject(version.storage_key)
    if (bytes.length !== Number(version.size_bytes)) throw new Error('presentation artifact size does not match its immutable version')
    const actualSha256 = createHash('sha256').update(bytes).digest()
    const expectedSha256 = Buffer.from(version.sha256, 'hex')
    if (expectedSha256.length !== actualSha256.length || !timingSafeEqual(actualSha256, expectedSha256)) {
      throw new Error('presentation artifact checksum does not match its immutable version')
    }
    return { bytes, title: detail.title }
  }
}

export function createPresentationAgentFacade(application: PresentationsApplication) {
  return {
    createPresentationForAgent: (work: AgentWorkItem, input: CreatePresentationInput) => application.createForAgent(work, input),
    getPresentationForAgent: (work: AgentWorkItem, presentationId: string) => application.getForAgent(work, presentationId),
    revisePresentationOutlineForAgent: async (work: AgentWorkItem, presentationId: string, input: RevisePresentationOutlineInput) =>
      privateAgentView(await application.reviseOutline(work.companyId, actorUserId(work), presentationId, input)),
    approvePresentationOutlineForAgent: async (work: AgentWorkItem, presentationId: string, input: ApprovePresentationOutlineInput) =>
      privateAgentView(await application.approveOutline(work.companyId, actorUserId(work), presentationId, input)),
    revisePresentationForAgent: async (work: AgentWorkItem, presentationId: string, input: RevisePresentationInput) =>
      privateAgentView(await application.revise(work.companyId, actorUserId(work), presentationId, input)),
    cancelPresentationForAgent: async (work: AgentWorkItem, presentationId: string, _input: { idempotencyKey: string }) =>
      privateAgentView(await application.cancel(work.companyId, actorUserId(work), presentationId)),
    retryPresentationForAgent: async (work: AgentWorkItem, presentationId: string, input: { idempotencyKey: string }) =>
      privateAgentView(await application.retry(work.companyId, actorUserId(work), presentationId, input)),
  }
}

export type PresentationArtifactMessage = LingxiMessageV1
export type PresentationPersistenceRow = PresentationRow
