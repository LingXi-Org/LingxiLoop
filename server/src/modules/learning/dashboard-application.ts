import type { Queryable } from '../../db/queryable.js'


import {
  createPermissionService,
  listActiveActorProjectScopes,
  type PermissionAction,
} from '../access/public.js'


import {
  type AuthorizedLearningSpaceScope,
  type LearningLifecycleAction,
  type LearningSpaceRow,
  learningLifecycleAction,
  listLearningSpaceRows,
} from './dashboard-repository.js'

import { LearningApplicationError } from './errors.js'




interface SpacesCursor {
  type: 'spaces'
  sortAt: string
  projectId: string
}


type DashboardCursor = SpacesCursor


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


function iso(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const date = value instanceof Date ? value : new Date(String(value))
  if (!Number.isFinite(date.getTime())) return null
  return date.toISOString()
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
    avatarUrl: row.avatarUrl,
    avatarSeed: row.avatarSeed,
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
      request('learning:manage'),
      request('course:update'),
      request('project_invitation:create'),
      request('project_invitation:revoke'),
      request('project_member:update'),
      request('project_member:remove'),
      request('learning:submit'),
      request('learning:review'),
      lifecycleAction ? request(LIFECYCLE_PERMISSION_ACTIONS[lifecycleAction]) : null,
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
