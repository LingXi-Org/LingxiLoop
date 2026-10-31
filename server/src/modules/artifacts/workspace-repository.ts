import type { Queryable } from '../../db/queryable.js'
import type { ArtifactActorKind, ArtifactWorkspaceStatus } from './contracts.js'
import type { ArtifactKind } from './kinds.js'
import type { ActivityRow, ArtifactRow, AssignmentRow, ReportRow } from './repository-types.js'

export async function artifactEventScope(db: Queryable, companyId: string, artifactId: string) {
  const { rows } = await db.query<{ conversation_id: string | null; project_id: string; kind: ArtifactKind }>(
    `SELECT conversation_id,project_id,kind FROM artifacts WHERE id=$1 AND company_id=$2`,
    [artifactId, companyId],
  )
  return rows[0] ?? null
}

export async function findArtifact(db: Queryable, companyId: string, artifactId: string, projectId?: string) {
  const { rows } = await db.query<ArtifactRow>(
    `SELECT * FROM artifacts WHERE id=$1 AND company_id=$2 AND ($3::text IS NULL OR project_id=$3) LIMIT 1`,
    [artifactId, companyId, projectId ?? null],
  )
  return rows[0] ?? null
}

export async function insertActivity(db: Queryable, args: {
  id: string; artifactId: string; path: string | null; actorId: string
  actorKind: ArtifactActorKind; action: string; detail: Record<string, unknown>
}) {
  const { rows } = await db.query<ActivityRow>(
    `INSERT INTO artifact_activity (id,artifact_id,path,actor_id,actor_kind,action,detail)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
     ON CONFLICT (id) DO UPDATE SET id=artifact_activity.id RETURNING *`,
    [args.id, args.artifactId, args.path, args.actorId, args.actorKind, args.action, JSON.stringify(args.detail)],
  )
  return rows[0]
}

/** Readable artifacts of a project: project-level ones, and those of conversations the reader belongs to. */
export async function listArtifactRows(db: Queryable, args: {
  companyId: string; projectId: string; kind: ArtifactKind; readerId: string; conversationId?: string
}) {
  const { rows } = await db.query<{
    id: string; kind: ArtifactKind; title: string; project_id: string; conversation_id: string | null
    status: ArtifactWorkspaceStatus; created_by: string; file_count: number; assignment_count: number
    updated_at: string; created_at: string
  }>(
    `SELECT a.id,a.kind,a.title,a.project_id,a.conversation_id,a.status,a.created_by,a.updated_at,a.created_at,
            (SELECT COUNT(*)::int FROM artifact_files f WHERE f.artifact_id=a.id) AS file_count,
            (SELECT COUNT(*)::int FROM artifact_agent_assignments x WHERE x.artifact_id=a.id) AS assignment_count
       FROM artifacts a LEFT JOIN conversations c ON c.id=a.conversation_id AND c.company_id=a.company_id
      WHERE a.company_id=$1 AND a.project_id=$2 AND a.kind=$3 AND ($5::text IS NULL OR a.conversation_id=$5)
        AND (a.conversation_id IS NULL OR c.members ? $4)
      ORDER BY a.updated_at DESC LIMIT 200`,
    [args.companyId, args.projectId, args.kind, args.readerId, args.conversationId ?? null],
  )
  return rows
}

export async function insertArtifact(db: Queryable, args: {
  id: string; companyId: string; projectId: string; conversationId: string | null; kind: ArtifactKind
  title: string; actorId: string; origin: 'user' | 'conversation' | 'agent_os'
}) {
  const { rows } = await db.query<ArtifactRow>(
    `INSERT INTO artifacts (id,company_id,project_id,conversation_id,kind,title,created_by,authorization_user_id,origin)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$7,$8) ON CONFLICT (id) DO UPDATE SET id=artifacts.id RETURNING *`,
    [args.id, args.companyId, args.projectId, args.conversationId, args.kind, args.title, args.actorId, args.origin],
  )
  return rows[0]
}

/** The conversation's one Design canvas, created on first use. */
export async function ensureConversationDesignId(db: Queryable, args: {
  id: string; companyId: string; conversationId: string; actorId: string
}) {
  const { rows } = await db.query<{ id: string; created: boolean }>(
    `INSERT INTO artifacts (id,company_id,project_id,conversation_id,kind,title,goal,created_by,authorization_user_id,origin)
     SELECT $1,c.company_id,c.project_id,c.id,'design',LEFT(COALESCE(NULLIF(c.title,''),'Design'),200),COALESCE(c.topic,''),$4,$4,'conversation'
       FROM conversations c WHERE c.id=$2 AND c.company_id=$3 AND c.project_id IS NOT NULL
     ON CONFLICT (conversation_id) WHERE kind='design' DO UPDATE SET conversation_id=EXCLUDED.conversation_id
     RETURNING id,(xmax=0) AS created`,
    [args.id, args.conversationId, args.companyId, args.actorId],
  )
  return rows[0] ?? null
}

export async function conversationDesignId(db: Queryable, companyId: string, conversationId: string) {
  const { rows } = await db.query<{ id: string }>(
    `SELECT id FROM artifacts WHERE company_id=$1 AND conversation_id=$2 AND kind='design' LIMIT 1`,
    [companyId, conversationId],
  )
  return rows[0]?.id ?? null
}

/** The deck a Slides tool means: the one named in this conversation, else its most recently changed one. */
export async function conversationSlidesId(db: Queryable, companyId: string, conversationId: string, artifactId?: string) {
  const { rows } = await db.query<{ id: string }>(
    `SELECT a.id FROM artifacts a LEFT JOIN slide_workspaces w ON w.artifact_id=a.id
      WHERE a.company_id=$1 AND (a.conversation_id=$2 OR w.conversation_id=$2) AND a.kind='slides' AND ($3::text IS NULL OR a.id=$3)
      ORDER BY a.updated_at DESC LIMIT 1`,
    [companyId, conversationId, artifactId ?? null],
  )
  return rows[0]?.id ?? null
}

export async function snapshotRows(db: Queryable, artifactId: string) {
  const [assignments, dependencies, activity, reports] = await Promise.all([
    db.query<AssignmentRow>(
      `SELECT a.* FROM artifact_agent_assignments a
        WHERE a.artifact_id=$1 ORDER BY a.created_at ASC`,
      [artifactId],
    ),
    db.query<{ agent_id: string; depends_on_agent_id: string }>(
      `SELECT child.agent_id,parent.agent_id AS depends_on_agent_id
         FROM artifact_assignment_dependencies d
         JOIN artifact_agent_assignments child ON child.id=d.assignment_id
         JOIN artifact_agent_assignments parent ON parent.id=d.depends_on_assignment_id
        WHERE child.artifact_id=$1`,
      [artifactId],
    ),
    db.query<ActivityRow>(`SELECT * FROM artifact_activity WHERE artifact_id=$1 ORDER BY created_at DESC LIMIT 100`, [artifactId]),
    db.query<ReportRow>(`SELECT * FROM artifact_assignment_reports WHERE artifact_id=$1 ORDER BY created_at ASC`, [artifactId]),
  ])
  return {
    assignments: assignments.rows,
    dependencies: dependencies.rows,
    activity: activity.rows,
    reports: reports.rows,
  }
}
