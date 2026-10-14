import type { Queryable } from '../../db/queryable.js'

import type { ProjectKind, ProjectRole, ProjectStatus } from '../../domain/public.js'


export type LearningLifecycleAction = 'END' | 'ENTER_READ_ONLY' | 'ENTER_RETENTION' | 'ARCHIVE'


export interface LearningSpaceRow {
  companyId: string
  projectId: string
  projectKind: ProjectKind
  courseId: string | null
  title: string
  description: string
  avatarUrl?: string | null
  avatarSeed?: string | null
  color: string | null
  status: ProjectStatus
  perspective: 'learner' | 'teacher'
  roleCanManage: boolean
  studyRoomId: string | null
  isDefault: boolean
  lastVisitedAt: Date | string | null
  sortAt: Date | string
}


export interface AuthorizedLearningSpaceScope {
  companyId: string
  projectId: string
  projectRole: ProjectRole
  lastVisitedAt: Date | string | null
  sortAt: Date | string
}


export async function listLearningSpaceRows(
  db: Queryable,
  scopes: AuthorizedLearningSpaceScope[],
): Promise<LearningSpaceRow[]> {
  if (scopes.length === 0) return []
  const { rows } = await db.query<LearningSpaceRow>(
    `WITH authorized_scope AS (
       SELECT * FROM jsonb_to_recordset($1::jsonb) AS scope(
         "companyId" text,"projectId" text,"projectRole" text,
         "lastVisitedAt" timestamptz,"sortAt" timestamptz
       )
     )
     SELECT project.company_id AS "companyId",project.id AS "projectId",
            project.kind AS "projectKind",course.id AS "courseId",project.name AS title,
            project.description,project.color,project.status,
            project.avatar_url AS "avatarUrl",project.avatar_seed AS "avatarSeed",
            CASE WHEN authorized_scope."projectRole" = 'TEACHER'
                 THEN 'teacher' ELSE 'learner' END AS perspective,
            (authorized_scope."projectRole" = 'TEACHER') AS "roleCanManage",
            course.study_room_conversation_id AS "studyRoomId",project.is_default AS "isDefault",
            authorized_scope."lastVisitedAt" AS "lastVisitedAt",
            authorized_scope."sortAt" AS "sortAt"
       FROM authorized_scope
       JOIN projects project ON project.id=authorized_scope."projectId"
        AND project.company_id=authorized_scope."companyId"
       LEFT JOIN courses course ON course.project_id=project.id AND course.company_id=project.company_id
      WHERE project.status<>'DELETED'
      ORDER BY authorized_scope."sortAt" DESC,project.id DESC`,
    [JSON.stringify(scopes)],
  )
  return rows
}


export function learningPerspective(
  projectKind: ProjectKind,
  projectRole: ProjectRole,
): 'learner' | 'teacher' {
  return projectRole === 'TEACHER' ? 'teacher' : 'learner'
}


export function learningLifecycleAction(
  projectKind: ProjectKind,
  projectStatus: ProjectStatus,
): LearningLifecycleAction | null {
  switch (projectStatus) {
    case 'ACTIVE':
      return 'END'
    case 'COURSE_ENDED':
      return 'ENTER_READ_ONLY'
    case 'READ_ONLY':
      if (projectKind === 'TEACHING') return 'ARCHIVE'
      return projectKind === 'INSTITUTIONAL_COURSE' ? 'ENTER_RETENTION' : null
    case 'RETENTION':
      return projectKind === 'INSTITUTIONAL_COURSE' ? 'ARCHIVE' : null
    case 'CREATED':
    case 'DRAFT':
    case 'ARCHIVED':
    case 'DELETED':
      return null
  }
}
