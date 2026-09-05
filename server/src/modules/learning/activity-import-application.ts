import { createHash } from 'node:crypto'
import type { Queryable } from '../../db/queryable.js'
import { createPermissionService } from '../access/public.js'
import { appendDomainEventInTransaction } from '../events/public.js'
import type { LearningActivityImportInput } from './contracts.js'
import { LearningApplicationError } from './errors.js'
import { insertImportedLearningActivity } from './activity-import-repository.js'

function identity(prefix: string, value: string): string {
  return `${prefix}-${createHash('sha256').update(value).digest('hex').slice(0, 32)}`
}

export async function importProjectLearningActivities(db: Queryable, input: {
  companyId: string
  projectId: string
  actorId: string
  request: LearningActivityImportInput
  audit(entry: { kind: string; userId: string; companyId: string; detail: Record<string, unknown> }): Promise<void>
}) {
  await createPermissionService(db, { lockDependencies: true }).assertCan({
    actorUserId: input.actorId,
    action: 'learning:manage',
    companyId: input.companyId,
    projectId: input.projectId,
    resource: { type: 'project', id: input.projectId },
  })
  const imported: Array<{ activityId: string; externalId: string; created: boolean }> = []
  for (const activity of input.request.activities) {
    const activityId = identity('activity', [
      input.companyId,
      input.projectId,
      input.request.sourceSystem,
      input.request.externalImportId,
      activity.externalId,
    ].join(':'))
    const accepted = await insertImportedLearningActivity(db, {
      id: activityId,
      companyId: input.companyId,
      projectId: input.projectId,
      actorId: input.actorId,
      activity,
    })
    if (!accepted.matches) {
      throw new LearningApplicationError('conflict', 'import identity was reused or a knowledge unit is unavailable')
    }
    const eventDigest = createHash('sha256').update([
      input.request.sourceSystem,
      input.request.externalImportId,
      activity.externalId,
    ].join(':')).digest('hex')
    await appendDomainEventInTransaction(db, {
      companyId: input.companyId,
      projectId: input.projectId,
      aggregateType: 'LEARNING_ACTIVITY',
      aggregateId: activityId,
      idempotencyKey: `learning-activity-import:${eventDigest}`,
      actor: { type: 'USER', id: input.actorId },
      event: {
        eventType: 'LEARNING_ACTIVITY.IMPORTED',
        schemaVersion: 1,
        payload: {
          activityId,
          sourceSystem: input.request.sourceSystem,
          externalImportId: input.request.externalImportId,
          externalActivityId: activity.externalId,
        },
      },
    })
    imported.push({ activityId, externalId: activity.externalId, created: accepted.created })
  }
  if (imported.some((activity) => activity.created)) await input.audit({
    kind: 'learning_activities_imported',
    userId: input.actorId,
    companyId: input.companyId,
    detail: {
      projectId: input.projectId,
      sourceSystem: input.request.sourceSystem,
      externalImportId: input.request.externalImportId,
      activityIds: imported.map((activity) => activity.activityId),
    },
  })
  return { imported }
}
