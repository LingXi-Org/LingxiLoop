import type { Queryable } from '../../db/queryable.js'


export interface TeacherScopeBindingRow {
  company_id: string
  project_id: string
  project_name: string
  course_id: string
  course_title: string
  course_status: 'ACTIVE' | 'ARCHIVED'
  room_id: string
  room_status: 'active' | 'closed'
  agent_id: string
  agent_name: string
  has_teacher: boolean
}


export async function findTeacherScopeBinding(
  db: Queryable,
  companyId: string,
  agentId: string,
  channelId: string,
): Promise<TeacherScopeBindingRow | undefined> {
  const { rows } = await db.query<TeacherScopeBindingRow>(
    `SELECT project_agent.company_id,project_agent.project_id,project.name AS project_name,
            course.id AS course_id,project.name AS course_title,
            project.status AS course_status,teacher_room.conversation_id AS room_id,
            teacher_room.status AS room_status,project_agent.agent_id,
            participant.name AS agent_name,
            EXISTS(
              SELECT 1 FROM project_memberships member
               WHERE member.company_id=course.company_id AND member.project_id=course.project_id
                 AND member.status='ACTIVE' AND member.role = 'TEACHER'
            ) AS has_teacher
       FROM learning_project_teacher_agents project_agent
       JOIN projects project
         ON project.id=project_agent.project_id AND project.company_id=project_agent.company_id
       JOIN courses course
         ON course.project_id=project_agent.project_id AND course.company_id=project_agent.company_id
       JOIN learning_course_teacher_rooms teacher_room
         ON teacher_room.course_id=course.id AND teacher_room.company_id=course.company_id
       JOIN participants participant
         ON participant.id=project_agent.agent_id
        AND participant.company_id=project_agent.company_id
        AND participant.departed_at IS NULL
      WHERE project_agent.company_id=$1 AND project_agent.agent_id=$2
        AND teacher_room.conversation_id=$3
      LIMIT 1`,
    [companyId, agentId, channelId],
  )
  return rows[0]
}
