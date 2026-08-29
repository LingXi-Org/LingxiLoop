import type { Queryable } from '../../db/queryable.js'
import { projectRoleFromLearningWire, type ProjectRole } from '../../domain/access/public.js'
import type { CourseManager, CreateCourseInput, UpdateCourseInput } from './contracts.js'

export async function listCourses(db: Queryable, companyId: string, userId: string) {
  const { rows } = await db.query(
    `SELECT course.id,course.company_id AS "companyId",course.created_by AS "createdBy",
            course.study_room_conversation_id AS "studyRoomId",course.created_at AS "createdAt",
            project.id AS "projectId",project.kind AS "projectKind",
            project.name,project.description,project.color,project.status,
            project.created_at AS "projectCreatedAt",project.updated_at AS "updatedAt",
            LOWER(company_member.role) AS "companyRole",
            CASE WHEN course_member.role IS NULL THEN NULL
                 WHEN course_member.role IN ('STUDENT','OBSERVER') THEN 'learner' ELSE 'teacher' END AS "courseRole",
            (SELECT COUNT(*)::int FROM project_memberships member
              WHERE member.project_id=course.project_id AND member.company_id=course.company_id
                AND member.status='ACTIVE') AS "memberCount",
            (company_member.role IN ('OWNER','ADMIN') OR course_member.role IN ('OWNER','TEACHER')) AS "canManage"
       FROM courses course JOIN projects project ON project.id=course.project_id AND project.company_id=course.company_id
       JOIN company_memberships company_member ON company_member.company_id=course.company_id AND company_member.user_id=$2
        AND company_member.status='ACTIVE'
       LEFT JOIN project_memberships course_member
         ON course_member.project_id=course.project_id AND course_member.company_id=course.company_id
        AND course_member.user_id=$2 AND course_member.status='ACTIVE'
      WHERE course.company_id=$1
        AND (company_member.role IN ('OWNER','ADMIN') OR course_member.user_id IS NOT NULL)
      ORDER BY project.status,project.updated_at DESC`,
    [companyId, userId],
  )
  return rows
}

export async function canCreateCourse(db: Queryable, companyId: string, userId: string, lock = false) {
  const { rows } = await db.query<{ company_role: string; company_type: 'PERSONAL' | 'EDUCATION'; is_teacher: boolean }>(
    `SELECT LOWER(company_member.role) AS company_role,
            company.type AS company_type,
            EXISTS (SELECT 1 FROM project_memberships course_member
              JOIN courses course ON course.project_id=course_member.project_id AND course.company_id=course_member.company_id
              JOIN projects project ON project.id=course.project_id AND project.company_id=course.company_id
             WHERE course_member.company_id=$1 AND course_member.user_id=$2
               AND course_member.status='ACTIVE' AND course_member.role IN ('OWNER','TEACHER')
               AND project.status='active') AS is_teacher
       FROM company_memberships company_member
       JOIN companies company ON company.id=company_member.company_id AND company.status='ACTIVE'
      WHERE company_member.company_id=$1 AND company_member.user_id=$2 AND company_member.status='ACTIVE'
      ${lock ? 'FOR UPDATE OF company_member,company' : ''}`,
    [companyId, userId],
  )
  const permission = rows[0] ?? null
  if (permission && lock && permission.company_role !== 'owner' && permission.company_role !== 'admin') {
    const teacher = await db.query(
      `SELECT 1 FROM project_memberships course_member
        JOIN courses course ON course.project_id=course_member.project_id AND course.company_id=course_member.company_id
        JOIN projects project ON project.id=course.project_id AND project.company_id=course.company_id
       WHERE course_member.company_id=$1 AND course_member.user_id=$2
         AND course_member.status='ACTIVE' AND course_member.role IN ('OWNER','TEACHER')
         AND project.status='active'
       ORDER BY course_member.project_id LIMIT 1 FOR UPDATE OF course_member`,
      [companyId, userId],
    )
    permission.is_teacher = Boolean(teacher.rows[0])
  }
  return permission
}

export async function insertTeachingCourse(db: Queryable, args: {
  companyId: string; userId: string; projectId: string; courseId: string; roomId: string; input: CreateCourseInput
}): Promise<void> {
  await db.query(
    `INSERT INTO projects (id,company_id,kind,name,description,color,created_by,is_default)
     VALUES ($1,$2,'TEACHING',$3,$4,$5,$6,FALSE)`,
    [args.projectId, args.companyId, args.input.name, args.input.description, args.input.color, args.userId],
  )
  await db.query(
    `INSERT INTO courses (id,company_id,project_id,created_by) VALUES ($1,$2,$3,$4)`,
    [args.courseId, args.companyId, args.projectId, args.userId],
  )
  await db.query(
    `INSERT INTO project_memberships (project_id,company_id,user_id,role) VALUES ($1,$2,$3,'OWNER')`,
    [args.projectId, args.companyId, args.userId],
  )
  const { rows: agents } = await db.query<{ id: string; preset_key: string }>(
    `SELECT id,preset_key FROM participants
      WHERE company_id=$1 AND kind='agent' AND preset_key IN ('nova','sage','milo','trace') AND departed_at IS NULL`,
    [args.companyId],
  )
  const memberIds = [args.userId, ...agents.map((agent) => agent.id)]
  const leaderId = agents.find((agent) => agent.preset_key === 'nova')?.id ?? agents[0]?.id ?? null
  await db.query(
    `INSERT INTO conversations
       (id,kind,title,subtitle,topic,members,leader_id,pinned,tag,company_id,project_id)
     VALUES ($1,'group',$2,$3,$4,$5::jsonb,$6,TRUE,'course',$7,$8)`,
    [args.roomId, `${args.input.name} · Study Room`, `course · ${memberIds.length}`,
      '课程学习、讨论、练习与错因诊断', JSON.stringify(memberIds), leaderId, args.companyId, args.projectId],
  )
  await db.query(
    `UPDATE courses SET study_room_conversation_id=$2 WHERE id=$1 AND company_id=$3`,
    [args.courseId, args.roomId, args.companyId],
  )
}

export async function findCourse(db: Queryable, courseId: string, companyId: string, userId: string) {
  const { rows } = await db.query(
    `SELECT course.id,course.company_id AS "companyId",course.project_id AS "projectId",
            course.created_by AS "createdBy",course.study_room_conversation_id AS "studyRoomId",
            project.name,project.description,project.color,project.status,
            project.kind AS "projectKind",
            LOWER(company_member.role) AS "companyRole",
            CASE WHEN course_member.role IS NULL THEN NULL
                 WHEN course_member.role IN ('STUDENT','OBSERVER') THEN 'learner' ELSE 'teacher' END AS "courseRole",
            (SELECT COUNT(*)::int FROM project_memberships member
              WHERE member.project_id=course.project_id AND member.company_id=course.company_id
                AND member.status='ACTIVE') AS "memberCount",
            (company_member.role IN ('OWNER','ADMIN') OR course_member.role IN ('OWNER','TEACHER')) AS "canManage"
       FROM courses course JOIN projects project ON project.id=course.project_id AND project.company_id=course.company_id
       JOIN company_memberships company_member ON company_member.company_id=course.company_id AND company_member.user_id=$3
        AND company_member.status='ACTIVE'
       LEFT JOIN project_memberships course_member
         ON course_member.project_id=course.project_id AND course_member.company_id=course.company_id
        AND course_member.user_id=$3 AND course_member.status='ACTIVE'
      WHERE course.id=$1 AND course.company_id=$2
        AND (company_member.role IN ('OWNER','ADMIN') OR course_member.user_id IS NOT NULL)`,
    [courseId, companyId, userId],
  )
  return rows[0] ?? null
}

export async function courseManager(
  db: Queryable,
  courseId: string,
  userId: string,
  lock = false,
): Promise<CourseManager | null> {
  const { rows } = await db.query<{
    company_id: string; company_role: string; course_role: string | null; project_id: string; status: string
  }>(
    `SELECT course.company_id,LOWER(company_member.role) AS company_role,
            CASE WHEN course_member.role IS NULL THEN NULL
                 WHEN course_member.role IN ('STUDENT','OBSERVER') THEN 'learner' ELSE 'teacher' END AS course_role,
            course.project_id,project.status
       FROM courses course JOIN projects project ON project.id=course.project_id AND project.company_id=course.company_id
       JOIN company_memberships company_member ON company_member.company_id=course.company_id AND company_member.user_id=$2
        AND company_member.status='ACTIVE'
       LEFT JOIN project_memberships course_member
         ON course_member.project_id=course.project_id AND course_member.company_id=course.company_id
        AND course_member.user_id=$2 AND course_member.status='ACTIVE'
      WHERE course.id=$1${lock ? ' FOR UPDATE OF course,project,company_member' : ''}`,
    [courseId, userId],
  )
  const row = rows[0]
  let courseRole = row?.course_role ?? null
  if (row && lock && row.company_role !== 'owner' && row.company_role !== 'admin') {
    const lockedRole = await db.query<{ role: string }>(
      `SELECT CASE WHEN role IN ('STUDENT','OBSERVER') THEN 'learner' ELSE 'teacher' END AS role
         FROM project_memberships
        WHERE project_id=$1 AND company_id=$2 AND user_id=$3 AND status='ACTIVE' FOR UPDATE`,
      [row.project_id, row.company_id, userId],
    )
    courseRole = lockedRole.rows[0]?.role ?? null
  }
  return row ? {
    userId, companyId: row.company_id, companyRole: row.company_role,
    courseRole, projectId: row.project_id, status: row.status,
  } : null
}

export async function updateCourseMetadata(db: Queryable, args: {
  courseId: string; companyId: string; projectId: string; patch: UpdateCourseInput
}): Promise<void> {
  const values: unknown[] = []
  const sets: string[] = []
  for (const [field, column] of Object.entries({ name: 'name', description: 'description', color: 'color' }) as Array<[keyof UpdateCourseInput, string]>) {
    if (!Object.hasOwn(args.patch, field)) continue
    values.push(args.patch[field]); sets.push(`${column}=$${values.length}`)
  }
  values.push(args.projectId, args.companyId)
  await db.query(
    `UPDATE projects SET ${sets.join(',')},updated_at=NOW()
      WHERE id=$${values.length - 1} AND company_id=$${values.length}`,
    values,
  )
  if (args.patch.name !== undefined) {
    await db.query(
      `UPDATE conversations conversation SET title=$3,updated_at=NOW()
        FROM courses course
       WHERE course.id=$1 AND course.company_id=$2
         AND conversation.id=course.study_room_conversation_id AND conversation.company_id=course.company_id`,
      [args.courseId, args.companyId, `${args.patch.name} · Study Room`],
    )
    await db.query(
      `UPDATE participants participant SET name=$3,updated_at=NOW()
       FROM courses course JOIN learning_project_teacher_agents pulse
         ON pulse.project_id=course.project_id AND pulse.company_id=course.company_id
      WHERE course.id=$1 AND course.company_id=$2
        AND participant.id=pulse.agent_id AND participant.company_id=pulse.company_id`,
      [args.courseId, args.companyId, `Pulse · ${args.patch.name}`.slice(0, 80)],
    )
  }
}

export async function setCourseArchived(
  db: Queryable,
  companyId: string,
  projectId: string,
  archive: boolean,
): Promise<void> {
  await db.query(
    `UPDATE projects SET status=$3,archived_at=CASE WHEN $3='archived' THEN NOW() ELSE NULL END,updated_at=NOW()
      WHERE id=$1 AND company_id=$2`,
    [projectId, companyId, archive ? 'archived' : 'active'],
  )
}

export async function listCourseMembers(db: Queryable, courseId: string, companyId: string) {
  const { rows } = await db.query(
    `SELECT user_account.id,user_account.display_name AS name,user_account.email,
            CASE WHEN course_member.role IN ('STUDENT','OBSERVER') THEN 'learner' ELSE 'teacher' END AS role,
            course_member.created_at AS "joinedAt"
       FROM project_memberships course_member JOIN users user_account ON user_account.id=course_member.user_id
       JOIN courses course ON course.project_id=course_member.project_id AND course.company_id=course_member.company_id
      WHERE course.id=$1 AND course_member.company_id=$2 AND course_member.status='ACTIVE'
      ORDER BY CASE WHEN course_member.role IN ('OWNER','TEACHER') THEN 0 ELSE 1 END,course_member.created_at`,
    [courseId, companyId],
  )
  return rows
}

export async function changeCourseMember(db: Queryable, args: {
  courseId: string; companyId: string; userId: string; role: 'teacher' | 'learner' | null
}): Promise<'updated' | 'not_found' | 'last_teacher'> {
  const { rows: locked } = await db.query<{ project_id: string }>(
    `SELECT project_id FROM courses WHERE id=$1 AND company_id=$2 FOR UPDATE`,
    [args.courseId, args.companyId],
  )
  if (!locked[0]) return 'not_found'
  const projectId = locked[0].project_id
  const { rows } = await db.query<{ role: ProjectRole }>(
    `SELECT role FROM project_memberships
      WHERE project_id=$1 AND company_id=$2 AND user_id=$3 AND status='ACTIVE'`,
    [projectId, args.companyId, args.userId],
  )
  const current = rows[0]?.role
  if (!current) return 'not_found'
  if ((current === 'OWNER' || current === 'TEACHER') && args.role !== 'teacher') {
    const { rows: counts } = await db.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM project_memberships
        WHERE project_id=$1 AND company_id=$2 AND status='ACTIVE' AND role IN ('OWNER','TEACHER')`,
      [projectId, args.companyId],
    )
    if ((counts[0]?.count ?? 0) <= 1) return 'last_teacher'
  }
  if (args.role) {
    await db.query(
      `UPDATE project_memberships SET role=$4,updated_at=NOW()
        WHERE project_id=$1 AND company_id=$2 AND user_id=$3 AND status='ACTIVE'`,
      [projectId, args.companyId, args.userId, projectRoleFromLearningWire(args.role)],
    )
  } else {
    await db.query(
      `DELETE FROM project_memberships WHERE project_id=$1 AND company_id=$2 AND user_id=$3`,
      [projectId, args.companyId, args.userId],
    )
  }
  return 'updated'
}

export async function removeMemberFromProjectChannels(db: Queryable, args: {
  companyId: string; projectId: string; userId: string
}) {
  const { rows } = await db.query<{ id: string; title: string; members: string[] }>(
    `UPDATE conversations conversation
        SET members=(SELECT COALESCE(jsonb_agg(value),'[]'::jsonb)
                       FROM jsonb_array_elements(conversation.members) value
                      WHERE value<>to_jsonb($3::text)),updated_at=NOW()
      WHERE conversation.company_id=$1 AND conversation.project_id=$2
        AND conversation.members@>to_jsonb(ARRAY[$3::text])
      RETURNING conversation.id,conversation.title,conversation.members`,
    [args.companyId, args.projectId, args.userId],
  )
  await db.query(
    `UPDATE im_channel_bindings binding
        SET profile=jsonb_set(binding.profile,'{members}',conversation.members,TRUE),updated_at=NOW()
       FROM conversations conversation
      WHERE binding.channel_id=conversation.id AND binding.company_id=$1 AND conversation.company_id=$1
        AND conversation.project_id=$2`,
    [args.companyId, args.projectId],
  )
  return rows
}

export async function listProjectChannels(db: Queryable, args: {
  companyId: string; projectId: string
}) {
  const { rows } = await db.query<{ id: string; title: string; members: string[] }>(
    `SELECT conversation.id,conversation.title,conversation.members
       FROM conversations conversation
      WHERE conversation.company_id=$1 AND conversation.project_id=$2
      ORDER BY conversation.id`,
    [args.companyId, args.projectId],
  )
  return rows
}
