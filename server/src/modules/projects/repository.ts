import type { Queryable } from '../../db/queryable.js'
import type { ProjectKind, ProjectStatus } from '../../domain/public.js'

export interface LockedProject {
  id: string
  companyId: string
  kind: ProjectKind
  status: ProjectStatus
}

export async function updateProjectLifecycleStatus(
  db: Queryable,
  input: { projectId: string; companyId: string; expected: ProjectStatus; next: ProjectStatus },
): Promise<boolean> {
  const result = await db.query(
    `UPDATE projects
        SET status=$4,
            archived_at=CASE WHEN $4='ARCHIVED' THEN NOW() ELSE archived_at END,
            updated_at=NOW()
      WHERE id=$1 AND company_id=$2 AND status=$3`,
    [input.projectId, input.companyId, input.expected, input.next],
  )
  return (result.rowCount ?? 0) === 1
}
