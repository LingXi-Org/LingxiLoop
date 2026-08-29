import type { Queryable } from '../../db/queryable.js'

export interface TeacherProvisioningCourse {
  companyId: string
  projectId: string
  courseTitle: string
  projectName: string
}

export interface TeacherProvisioningInput extends TeacherProvisioningCourse {
  courseId: string
  agentId: string
  roomId: string
  displayName: string
  role: string
  capabilities: readonly string[]
  prompt: string
  presetVersion: number
}

export interface TeacherRoomRoutineRow {
  id: string
  schedule: Record<string, unknown>
  timezone: string
}

export interface TeacherAgentSummaryRow {
  agent_id: string
  name: string
  project_id: string
  conversation_id: string
  room_status: 'active' | 'closed'
  company_id: string
  pending: number
}

export async function findTeacherProvisioningCourse(
  db: Queryable,
  companyId: string,
  courseId: string,
): Promise<TeacherProvisioningCourse | undefined> {
  const { rows } = await db.query<{
    company_id: string
    project_id: string
    course_title: string
    project_name: string
  }>(
    `SELECT course.company_id,course.project_id,project.name AS course_title,
            project.name AS project_name
       FROM courses course
       JOIN projects project
         ON project.id=course.project_id AND project.company_id=course.company_id
      WHERE course.company_id=$1 AND course.id=$2 AND project.status='ACTIVE'
      LIMIT 1`,
    [companyId, courseId],
  )
  const row = rows[0]
  return row ? {
    companyId: row.company_id,
    projectId: row.project_id,
    courseTitle: row.course_title,
    projectName: row.project_name,
  } : undefined
}

export async function findProjectTeacherAgentId(
  db: Queryable,
  companyId: string,
  projectId: string,
): Promise<string | undefined> {
  const { rows } = await db.query<{ agent_id: string }>(
    `SELECT agent_id FROM learning_project_teacher_agents
      WHERE company_id=$1 AND project_id=$2`,
    [companyId, projectId],
  )
  return rows[0]?.agent_id
}

export async function persistTeacherProvisioning(
  db: Queryable,
  input: TeacherProvisioningInput,
): Promise<{ created: boolean }> {
  await db.query(
    `INSERT INTO participants(
      id,preset_key,kind,name,role,initial,avatar_bg,status,bio,tools,
      capabilities,system_prompt,company_id
    ) VALUES(
      $1,$2,'agent',$3,$4,'P','transparent','avail',
      '项目级教师专用智能体；负责课程管理与学情汇总',$5::jsonb,$6::jsonb,$7,$8
    )
    ON CONFLICT(id,company_id) DO UPDATE SET
      name=EXCLUDED.name,role=EXCLUDED.role,tools=EXCLUDED.tools,
      capabilities=EXCLUDED.capabilities,system_prompt=EXCLUDED.system_prompt,
      departed_at=NULL`,
    [
      input.agentId,
      `teacher-agent:${input.projectId}`,
      input.displayName,
      input.role,
      JSON.stringify(['ipython']),
      JSON.stringify(input.capabilities),
      input.prompt,
      input.companyId,
    ],
  )
  await db.query(
    `INSERT INTO learning_project_teacher_agents(project_id,company_id,agent_id,preset_version)
     VALUES($1,$2,$3,$4)
     ON CONFLICT(project_id) DO UPDATE SET
       preset_version=EXCLUDED.preset_version,updated_at=NOW()`,
    [input.projectId, input.companyId, input.agentId, input.presetVersion],
  )
  const teacherIds = await listCourseTeacherIds(db, input.companyId, input.courseId)
  const members = [...teacherIds, input.agentId]
  const title = `教师室｜${input.courseTitle}`.slice(0, 80)
  const { rowCount } = await db.query(
    `INSERT INTO conversations(
      id,preset_key,kind,title,subtitle,topic,members,leader_id,pinned,tag,company_id,project_id
    ) VALUES(
      $1,$2,'group',$3,$4,'课程管理、学情汇总与教师审批',$5::jsonb,$6,TRUE,'teacher',$7,$8
    ) ON CONFLICT(id) DO NOTHING`,
    [
      input.roomId,
      `teacher-room:${input.courseId}`,
      title,
      `教师 · ${teacherIds.length}`,
      JSON.stringify(members),
      input.agentId,
      input.companyId,
      input.projectId,
    ],
  )
  await db.query(
    `INSERT INTO im_channel_bindings(channel_id,company_id,profile,leader_agent_id,preset_key)
     VALUES($1,$2,$3::jsonb,$4,$5)
     ON CONFLICT(channel_id) DO UPDATE SET
       profile=EXCLUDED.profile,leader_agent_id=EXCLUDED.leader_agent_id,
       preset_key=EXCLUDED.preset_key`,
    [
      input.roomId,
      input.companyId,
      JSON.stringify({
        channelId: input.roomId,
        channelType: 2,
        kind: 'group',
        title,
        members,
        topic: '课程管理、学情汇总与教师审批',
        pinned: true,
        createdAt: new Date().toISOString(),
      }),
      input.agentId,
      `teacher-room:${input.courseId}`,
    ],
  )
  await db.query(
    `INSERT INTO learning_course_teacher_rooms(course_id,company_id,conversation_id,status)
     VALUES($1,$2,$3,'active')
     ON CONFLICT(course_id) DO UPDATE SET status='active',closed_at=NULL`,
    [input.courseId, input.companyId, input.roomId],
  )
  await db.query(
    `INSERT INTO agent_workspace(agent_id,path,body,company_id,updated_at)
     VALUES($1,'IDENTITY.md',$2,$3,NOW()),($1,'SOUL.md',$4,$3,NOW())
     ON CONFLICT(agent_id,path) DO NOTHING`,
    [
      input.agentId,
      `# ${input.displayName}\n\n**Role:** ${input.role}\n`,
      input.companyId,
      `# Pulse operating policy\n\n${input.prompt}\n`,
    ],
  )
  return { created: (rowCount ?? 0) > 0 }
}

export async function findTeacherWelcomeDescriptor(
  db: Queryable,
  companyId: string,
  courseId: string,
): Promise<{ conversationId: string; agentId: string; courseTitle: string } | undefined> {
  const { rows } = await db.query<{
    conversation_id: string
    agent_id: string
    course_title: string
  }>(
    `SELECT teacher_room.conversation_id,project_agent.agent_id,
            project.name AS course_title
       FROM learning_course_teacher_rooms teacher_room
       JOIN courses course
         ON course.id=teacher_room.course_id AND course.company_id=teacher_room.company_id
       JOIN projects project
         ON project.id=course.project_id AND project.company_id=course.company_id
       JOIN learning_project_teacher_agents project_agent
         ON project_agent.project_id=course.project_id
        AND project_agent.company_id=course.company_id
      WHERE teacher_room.company_id=$1 AND teacher_room.course_id=$2`,
    [companyId, courseId],
  )
  const row = rows[0]
  return row ? {
    conversationId: row.conversation_id,
    agentId: row.agent_id,
    courseTitle: row.course_title,
  } : undefined
}

export async function findActiveTeacherRoom(
  db: Queryable,
  companyId: string,
  courseId: string,
): Promise<{ conversationId: string; agentId: string } | undefined> {
  const { rows } = await db.query<{
    conversation_id: string
    status: string
    agent_id: string
  }>(
    `SELECT teacher_room.conversation_id,teacher_room.status,project_agent.agent_id
       FROM learning_course_teacher_rooms teacher_room
       JOIN courses course
         ON course.id=teacher_room.course_id AND course.company_id=teacher_room.company_id
       JOIN learning_project_teacher_agents project_agent
         ON project_agent.project_id=course.project_id
        AND project_agent.company_id=course.company_id
      WHERE teacher_room.company_id=$1 AND teacher_room.course_id=$2`,
    [companyId, courseId],
  )
  const row = rows[0]
  return row?.status === 'active'
    ? { conversationId: row.conversation_id, agentId: row.agent_id }
    : undefined
}

export async function listCourseTeacherIds(
  db: Queryable,
  companyId: string,
  courseId: string,
): Promise<string[]> {
  const { rows } = await db.query<{ user_id: string }>(
    `SELECT member.user_id FROM project_memberships member
       JOIN courses course ON course.project_id=member.project_id AND course.company_id=member.company_id
      WHERE member.company_id=$1 AND course.id=$2 AND member.status='ACTIVE'
        AND member.role IN ('OWNER','TEACHER')
      ORDER BY member.user_id`,
    [companyId, courseId],
  )
  return rows.map((row) => row.user_id)
}

export async function updateTeacherRoomMembers(
  db: Queryable,
  input: {
    companyId: string
    conversationId: string
    members: string[]
    teacherCount: number
  },
): Promise<Record<string, unknown> | undefined> {
  await db.query(
    `UPDATE conversations
        SET members=$3::jsonb,subtitle=$4,updated_at=NOW()
      WHERE id=$2 AND company_id=$1`,
    [input.companyId, input.conversationId, JSON.stringify(input.members), `教师 · ${input.teacherCount}`],
  )
  const { rows } = await db.query<{ profile: Record<string, unknown> }>(
    `UPDATE im_channel_bindings
        SET profile=profile||jsonb_build_object('members',$3::jsonb),updated_at=NOW()
      WHERE company_id=$1 AND channel_id=$2
      RETURNING profile`,
    [input.companyId, input.conversationId, JSON.stringify(input.members)],
  )
  return rows[0]?.profile
}

export async function closeTeacherRoomState(
  db: Queryable,
  companyId: string,
  courseId: string,
): Promise<void> {
  await db.query(
    `UPDATE learning_course_teacher_rooms
        SET status='closed',closed_at=NOW()
      WHERE company_id=$1 AND course_id=$2 AND status='active'`,
    [companyId, courseId],
  )
  await db.query(
    `UPDATE agent_routines routine
        SET status='paused',next_run_at=NULL,updated_at=NOW()
       FROM learning_course_teacher_rooms teacher_room
      WHERE teacher_room.company_id=$1 AND teacher_room.course_id=$2
        AND routine.company_id=teacher_room.company_id
        AND routine.channel_id=teacher_room.conversation_id
        AND routine.kind='teacher_project_digest'`,
    [companyId, courseId],
  )
}

export async function reactivateTeacherRoomState(
  db: Queryable,
  companyId: string,
  courseId: string,
): Promise<string | undefined> {
  const { rows } = await db.query<{ conversation_id: string }>(
    `UPDATE learning_course_teacher_rooms teacher_room
        SET status='active',closed_at=NULL
       FROM courses course
       JOIN projects project
         ON project.id=course.project_id AND project.company_id=course.company_id
      WHERE teacher_room.company_id=$1 AND teacher_room.course_id=$2
        AND teacher_room.course_id=course.id AND teacher_room.company_id=course.company_id
        AND project.status='ACTIVE'
      RETURNING teacher_room.conversation_id`,
    [companyId, courseId],
  )
  return rows[0]?.conversation_id
}

export async function listTeacherRoomRoutines(
  db: Queryable,
  companyId: string,
  conversationId: string,
): Promise<TeacherRoomRoutineRow[]> {
  const { rows } = await db.query<TeacherRoomRoutineRow>(
    `SELECT id,schedule,timezone FROM agent_routines
      WHERE company_id=$1 AND channel_id=$2 AND kind='teacher_project_digest'`,
    [companyId, conversationId],
  )
  return rows
}

export async function activateTeacherRoomRoutine(
  db: Queryable,
  companyId: string,
  routineId: string,
  nextRunAt: string,
): Promise<void> {
  await db.query(
    `UPDATE agent_routines
        SET status='active',next_run_at=$3,updated_at=NOW()
      WHERE company_id=$1 AND id=$2`,
    [companyId, routineId, nextRunAt],
  )
}

export async function findTeacherAgentSummaryRow(
  db: Queryable,
  companyId: string,
  courseId: string,
): Promise<TeacherAgentSummaryRow | undefined> {
  const { rows } = await db.query<TeacherAgentSummaryRow>(
    `SELECT project_agent.agent_id,participant.name,course.project_id,
            teacher_room.conversation_id,teacher_room.status AS room_status,
            course.company_id,
            (SELECT COUNT(*)::int FROM agent_os_approvals approval
              WHERE approval.company_id=course.company_id
                AND approval.channel_id=teacher_room.conversation_id
                AND approval.status='pending') AS pending
       FROM courses course
       JOIN learning_project_teacher_agents project_agent
         ON project_agent.project_id=course.project_id
        AND project_agent.company_id=course.company_id
       JOIN participants participant
         ON participant.id=project_agent.agent_id
        AND participant.company_id=project_agent.company_id
       JOIN learning_course_teacher_rooms teacher_room
         ON teacher_room.course_id=course.id AND teacher_room.company_id=course.company_id
      WHERE course.company_id=$1 AND course.id=$2`,
    [companyId, courseId],
  )
  return rows[0]
}
