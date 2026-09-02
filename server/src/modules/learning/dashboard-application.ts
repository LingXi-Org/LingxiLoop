import type { Queryable } from '../../db/queryable.js'
import type { ProjectKind, ProjectRole } from '../../domain/public.js'
import {
  createPermissionService,
  listActiveActorProjectScopes,
  type PermissionAction,
} from '../access/public.js'
import type { LearningScope } from './contracts.js'
import {
  type AuthorizedLearningSpaceScope,
  findLearningAttemptDetail,
  type LearningLifecycleAction,
  type LearningSpaceRow,
  learningLifecycleAction,
  learningPerspective,
  listLearningSpaceRows,
  loadLearnerOverviewRows,
  loadLearningLearnerDetailRows,
} from './dashboard-repository.js'
import { LearningApplicationError } from './errors.js'
import {
  findLearningDashboardLearner,
  listLearningDashboardLearnerRows,
  loadLearningDashboardTeacherOverviewRows,
} from './teacher-reporting-repository.js'

interface SpacesCursor {
  type: 'spaces'
  sortAt: string
  projectId: string
}

interface LearnersCursor {
  type: 'learners'
  learnerId: string
}

type DashboardCursor = SpacesCursor | LearnersCursor

function encodeCursor(cursor: DashboardCursor): string {
  return Buffer.from(JSON.stringify({ version: 1, ...cursor }), 'utf8').toString('base64url')
}

function decodeCursor(cursor: string): Record<string, unknown> {
  if (!/^[A-Za-z0-9_-]+$/.test(cursor)) {
    throw new LearningApplicationError('invalid', 'invalid cursor')
  }
  try {
    const value: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid cursor')
    const decoded = value as Record<string, unknown>
    if (decoded.version !== 1) throw new Error('invalid cursor version')
    return decoded
  } catch {
    throw new LearningApplicationError('invalid', 'invalid cursor')
  }
}

function decodeSpacesCursor(cursor: string | undefined): SpacesCursor | null {
  if (!cursor) return null
  const decoded = decodeCursor(cursor)
  if (
    decoded.type !== 'spaces'
    || typeof decoded.sortAt !== 'string'
    || !Number.isFinite(Date.parse(decoded.sortAt))
    || typeof decoded.projectId !== 'string'
    || decoded.projectId.length === 0
    || decoded.projectId.length > 200
  ) {
    throw new LearningApplicationError('invalid', 'invalid spaces cursor')
  }
  return { type: 'spaces', sortAt: decoded.sortAt, projectId: decoded.projectId }
}

function decodeLearnersCursor(cursor: string | undefined): LearnersCursor | null {
  if (!cursor) return null
  const decoded = decodeCursor(cursor)
  if (
    decoded.type !== 'learners'
    || typeof decoded.learnerId !== 'string'
    || decoded.learnerId.length === 0
    || decoded.learnerId.length > 200
  ) {
    throw new LearningApplicationError('invalid', 'invalid learners cursor')
  }
  return { type: 'learners', learnerId: decoded.learnerId }
}

function iso(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const date = value instanceof Date ? value : new Date(String(value))
  if (!Number.isFinite(date.getTime())) return null
  return date.toISOString()
}

function normalizeDates<T extends Record<string, unknown>>(row: T, keys: readonly string[]): T {
  const result = { ...row }
  for (const key of keys) {
    if (Object.hasOwn(result, key)) result[key as keyof T] = iso(result[key]) as T[keyof T]
  }
  return result
}

interface LearningSpaceCapabilities {
  canEditContent: boolean
  canUpdateCourse: boolean
  canInviteMembers: boolean
  canRevokeInvitations: boolean
  canUpdateMembers: boolean
  canRemoveMembers: boolean
  canSubmit: boolean
  canReview: boolean
  lifecycleAction: LearningLifecycleAction | null
}

const LIFECYCLE_PERMISSION_ACTIONS: Record<LearningLifecycleAction, PermissionAction> = {
  END: 'project:end',
  ENTER_READ_ONLY: 'project:enter_read_only',
  ENTER_RETENTION: 'project:enter_retention',
  ARCHIVE: 'project:archive',
}

function learningSpace(row: LearningSpaceRow, capabilities: LearningSpaceCapabilities) {
  return {
    companyId: row.companyId,
    projectId: row.projectId,
    projectKind: row.projectKind,
    ...(row.courseId ? { courseId: row.courseId } : {}),
    title: row.title,
    description: row.description,
    color: row.color,
    status: row.status,
    perspective: row.perspective,
    canManage: row.roleCanManage,
    ...capabilities,
    ...(row.courseId ? { studyRoomId: row.studyRoomId } : {}),
    isDefault: row.isDefault,
    lastVisitedAt: iso(row.lastVisitedAt),
  }
}

export async function listLearningSpaces(
  db: Queryable,
  actorUserId: string,
  input: { cursor?: string; limit: number },
) {
  const permission = createPermissionService(db)
  const batchLimit = Math.min(100, input.limit + 1)
  const authorized: AuthorizedLearningSpaceScope[] = []
  let after = decodeSpacesCursor(input.cursor)
  let exhausted = false
  while (authorized.length <= input.limit && !exhausted) {
    const candidates = await listActiveActorProjectScopes(db, {
      actorUserId,
      afterSortAt: after?.sortAt ?? null,
      afterProjectId: after?.projectId ?? null,
      limit: batchLimit,
    })
    const resolved = await Promise.all(candidates.map(async (candidate) => {
      const decision = await permission.can({
        actorUserId,
        action: 'learning:read',
        companyId: candidate.companyId,
        projectId: candidate.projectId,
      })
      const projectRole = decision.context?.projectMembership?.role
      if (!decision.allowed || !projectRole) return null
      return { ...candidate, projectRole }
    }))
    authorized.push(...resolved.filter((scope): scope is AuthorizedLearningSpaceScope => scope !== null))
    const lastCandidate = candidates.at(-1)
    exhausted = candidates.length < batchLimit || !lastCandidate
    after = lastCandidate
      ? {
          type: 'spaces',
          sortAt: iso(lastCandidate.sortAt) ?? new Date(0).toISOString(),
          projectId: lastCandidate.projectId,
        }
      : after
  }
  const pageScopes = authorized.slice(0, input.limit)
  const rows = await listLearningSpaceRows(db, pageScopes)
  const capabilities = await Promise.all(rows.map(async (row): Promise<LearningSpaceCapabilities> => {
    const personal = row.projectKind === 'PERSONAL_LEARNING'
    const lifecycleAction = learningLifecycleAction(row.projectKind, row.status)
    const request = (action: PermissionAction) => permission.can({
      actorUserId,
      action,
      companyId: row.companyId,
      projectId: row.projectId,
    })
    const [
      editContent,
      updateCourse,
      inviteMembers,
      revokeInvitations,
      updateMembers,
      removeMembers,
      submit,
      review,
      lifecycle,
    ] = await Promise.all([
      personal ? null : request('learning:manage'),
      personal ? null : request('course:update'),
      personal ? null : request('project_invitation:create'),
      personal ? null : request('project_invitation:revoke'),
      personal ? null : request('project_member:update'),
      personal ? null : request('project_member:remove'),
      request('learning:submit'),
      personal ? null : request('learning:review'),
      !personal && lifecycleAction ? request(LIFECYCLE_PERMISSION_ACTIONS[lifecycleAction]) : null,
    ])
    return {
      canEditContent: editContent?.allowed ?? false,
      canUpdateCourse: updateCourse?.allowed ?? false,
      canInviteMembers: inviteMembers?.allowed ?? false,
      canRevokeInvitations: revokeInvitations?.allowed ?? false,
      canUpdateMembers: updateMembers?.allowed ?? false,
      canRemoveMembers: removeMembers?.allowed ?? false,
      canSubmit: submit.allowed,
      canReview: review?.allowed ?? false,
      lifecycleAction: lifecycle?.allowed ? lifecycleAction : null,
    }
  }))
  const last = pageScopes.at(-1)
  return {
    data: rows.map((row, index) => learningSpace(row, capabilities[index] ?? {
      canEditContent: false,
      canUpdateCourse: false,
      canInviteMembers: false,
      canRevokeInvitations: false,
      canUpdateMembers: false,
      canRemoveMembers: false,
      canSubmit: false,
      canReview: false,
      lifecycleAction: null,
    })),
    nextCursor: authorized.length > input.limit && last
      ? encodeCursor({
          type: 'spaces',
          sortAt: iso(last.sortAt) ?? new Date(0).toISOString(),
          projectId: last.projectId,
        })
      : null,
  }
}

async function resolveProjectAccess(
  db: Queryable,
  scope: LearningScope,
  projectId: string,
  action: PermissionAction,
): Promise<{ projectKind: ProjectKind; projectRole: ProjectRole }> {
  const context = await createPermissionService(db).assertCan({
    actorUserId: scope.userId,
    action,
    companyId: scope.companyId,
    projectId,
  })
  if (!context.project || !context.projectMembership) {
    throw new LearningApplicationError('not_found', 'learning space not found')
  }
  return { projectKind: context.project.kind, projectRole: context.projectMembership.role }
}

async function resolveTeacherAccess(
  db: Queryable,
  scope: LearningScope,
  projectId: string,
): Promise<void> {
  const access = await resolveProjectAccess(db, scope, projectId, 'learning:review')
  if (access.projectKind === 'PERSONAL_LEARNING') {
    throw new LearningApplicationError('forbidden', 'teacher reporting is unavailable for Personal Learning')
  }
}

export async function learningOverview(
  db: Queryable,
  scope: LearningScope,
  projectId: string,
  windowDays: number,
) {
  const access = await resolveProjectAccess(db, scope, projectId, 'learning:read')
  const perspective = learningPerspective(access.projectKind, access.projectRole)
  if (perspective === 'learner') {
    const rows = await loadLearnerOverviewRows(db, {
      companyId: scope.companyId,
      projectId,
      learnerId: scope.userId,
      windowDays,
    })
    return {
      perspective,
      windowDays,
      summary: rows.summary,
      masteryDistribution: rows.masteryDistribution,
      attemptTrend: rows.attemptTrend,
      assistanceDistribution: rows.assistanceDistribution,
      dueReviews: rows.dueReviews.map((row) => normalizeDates(row, ['nextReviewAt'])),
      missionProgress: rows.missionProgress.map((row) => normalizeDates(row, ['updatedAt'])),
    }
  }
  const rows = await loadLearningDashboardTeacherOverviewRows(db, {
    companyId: scope.companyId,
    projectId,
    teacherId: scope.userId,
    windowDays,
  })
  return {
    perspective,
    windowDays,
    summary: rows.summary,
    masteryDistribution: rows.masteryDistribution,
    missionDistribution: rows.missionDistribution,
    evaluationDistribution: rows.evaluationDistribution,
    attention: rows.attention.map((row) => ({
      learnerId: row.learnerId,
      displayName: row.displayName,
      reasons: row.reasons,
    })),
  }
}

export async function listLearningLearners(
  db: Queryable,
  scope: LearningScope,
  projectId: string,
  input: { cursor?: string; limit: number; attentionOnly: boolean; search?: string },
) {
  await resolveTeacherAccess(db, scope, projectId)
  const cursor = decodeLearnersCursor(input.cursor)
  const rows = await listLearningDashboardLearnerRows(db, {
    companyId: scope.companyId,
    projectId,
    reviewerId: scope.userId,
    attentionOnly: input.attentionOnly,
    afterLearnerId: cursor?.learnerId ?? null,
    search: input.search ?? null,
    limit: input.limit + 1,
  })
  const page = rows.slice(0, input.limit)
  const last = page.at(-1)
  return {
    data: page.map((row) => normalizeDates(row, ['lastAttemptAt'])),
    nextCursor: rows.length > input.limit && last
      ? encodeCursor({ type: 'learners', learnerId: last.learnerId })
      : null,
  }
}

export async function learningLearnerDetail(
  db: Queryable,
  scope: LearningScope,
  projectId: string,
  learnerId: string,
) {
  await resolveTeacherAccess(db, scope, projectId)
  const learner = await findLearningDashboardLearner(db, { companyId: scope.companyId, projectId, learnerId })
  if (!learner) throw new LearningApplicationError('not_found', 'learner not found')
  const rows = await loadLearningLearnerDetailRows(db, { companyId: scope.companyId, projectId, learnerId })
  return {
    learner: normalizeDates(learner, ['joinedAt']),
    summary: rows.summary,
    masteryDistribution: rows.masteryDistribution,
    states: rows.states.map((row) => normalizeDates(row, ['nextReviewAt', 'lastEvidenceAt'])),
    missions: rows.missions.map((row) => normalizeDates(row, ['updatedAt'])),
    attempts: rows.attempts.map((row) => normalizeDates(row, ['submittedAt'])),
  }
}

export async function learningAttemptDetail(
  db: Queryable,
  scope: LearningScope,
  projectId: string,
  attemptId: string,
) {
  await resolveTeacherAccess(db, scope, projectId)
  const attempt = await findLearningAttemptDetail(db, { companyId: scope.companyId, projectId, attemptId })
  if (!attempt) throw new LearningApplicationError('not_found', 'attempt not found')
  return normalizeDates(attempt, ['submittedAt'])
}
