import type { Queryable } from '../../db/queryable.js'
import type { AgentScope, CreateAgentInput, ParticipantScope, UpdateAgentInput } from './contracts.js'

export async function releaseExpiredAgentStatus(db: Queryable, companyId: string, leaseMs: number): Promise<void> {
  await db.query(
    `UPDATE participants SET status='avail',status_updated_at=NOW()
      WHERE company_id=$1 AND kind='agent' AND departed_at IS NULL
        AND status IN ('thinking','working','waiting')
        AND status_updated_at<NOW()-($2::int*INTERVAL '1 millisecond')`,
    [companyId, leaseMs],
  )
}

export async function listParticipants(db: Queryable, scope: ParticipantScope) {
  const { rows } = await db.query<{
    id: string; kind: 'agent' | 'human'; name: string; role: string | null
    initial: string; avatarBg: string; avatarUrl: string | null; status: string
    statusUpdatedAt: string | null; bio: string | null; tools: string[] | null
    capabilities: string[] | null; systemPrompt: string | null; email: string | null
    companySlug: string | null; departedAt: string | null; managed: boolean
    projectId: string | null; presetKey: string | null
  }>(
    `SELECT participant.id,participant.kind,participant.name,participant.role,participant.initial,
            CASE WHEN participant.kind='agent' THEN 'transparent' ELSE participant.avatar_bg END AS "avatarBg",
            CASE WHEN participant.kind='agent' THEN NULL ELSE participant.avatar_url END AS "avatarUrl",
            participant.status,participant.status_updated_at AS "statusUpdatedAt",participant.bio,
            participant.tools,participant.capabilities,participant.system_prompt AS "systemPrompt",
            COALESCE(participant.email,CASE WHEN participant.kind='human' AND company_member.user_id IS NOT NULL THEN user_account.email END) AS email,
            company.slug AS "companySlug",participant.departed_at AS "departedAt",participant.preset_key AS "presetKey",
            EXISTS(SELECT 1 FROM learning_project_teacher_agents pulse
              WHERE pulse.agent_id=participant.id AND pulse.company_id=participant.company_id) AS managed,
            (SELECT pulse.project_id FROM learning_project_teacher_agents pulse
              WHERE pulse.agent_id=participant.id AND pulse.company_id=participant.company_id LIMIT 1) AS "projectId"
       FROM participants participant JOIN companies company ON company.id=participant.company_id
       LEFT JOIN company_members company_member
         ON company_member.user_id=participant.id AND company_member.company_id=participant.company_id
       LEFT JOIN users user_account ON user_account.id=company_member.user_id
      WHERE participant.company_id=$1
        AND (NOT EXISTS(SELECT 1 FROM learning_project_teacher_agents pulse
              WHERE pulse.agent_id=participant.id AND pulse.company_id=participant.company_id)
          OR EXISTS(SELECT 1 FROM learning_project_teacher_agents pulse
              JOIN courses course ON course.project_id=pulse.project_id AND course.company_id=pulse.company_id
              JOIN course_members teacher ON teacher.course_id=course.id AND teacher.company_id=course.company_id
                AND teacher.user_id=$3 AND teacher.role='teacher'
             WHERE pulse.agent_id=participant.id AND pulse.company_id=participant.company_id AND pulse.project_id=$2))
        AND (participant.kind='agent' OR EXISTS(SELECT 1 FROM projects project
              LEFT JOIN courses course ON course.project_id=project.id AND course.company_id=project.company_id
              LEFT JOIN course_members member ON member.course_id=course.id AND member.user_id=participant.id
             WHERE project.id=$2 AND project.company_id=participant.company_id
               AND (project.is_general=TRUE OR member.user_id IS NOT NULL)))
      ORDER BY participant.kind DESC,participant.name`,
    [scope.companyId, scope.projectId, scope.userId],
  )
  return rows
}

export async function agentIdExists(db: Queryable, id: string): Promise<boolean> {
  const { rows } = await db.query(`SELECT 1 FROM participants WHERE id=$1 LIMIT 1`, [id])
  return Boolean(rows[0])
}

export async function insertAgent(db: Queryable, args: {
  id: string; scope: AgentScope; input: CreateAgentInput
}): Promise<void> {
  const initial = args.input.name.charAt(0).toUpperCase()
  await db.query(
    `INSERT INTO participants
       (id,kind,name,role,initial,avatar_bg,status,bio,tools,capabilities,system_prompt,company_id)
     VALUES ($1,'agent',$2,$3,$4,'transparent','avail',$5,'["ipython"]'::jsonb,$6::jsonb,$7,$8)`,
    [args.id, args.input.name, args.input.role, initial, args.input.bio,
      JSON.stringify(args.input.capabilities), args.input.systemPrompt, args.scope.companyId],
  )
  const identity = `# ${args.input.name}\n\n**Role:** ${args.input.role || 'agent'}\n\n${args.input.bio ? `**Bio:**\n${args.input.bio}\n\n` : ''}_This file is your identity. Edit it as you grow — what you write here_\n_loads into your system prompt on every wake._\n`
  const soul = `# Soul of ${args.input.name}\n\n## Voice\n\n${args.input.systemPrompt}\n\n## Principles\n\n- Speak like a real person, not like a tech blog.\n- Match the user's language.\n- Save things worth remembering — they outlive any single conversation.\n\n_This file is your voice + values. Edit it freely to evolve who you are._\n`
  await db.query(
    `INSERT INTO agent_workspace (agent_id,path,body,company_id,updated_at)
     VALUES ($1,'IDENTITY.md',$2,$3,NOW()),($1,'SOUL.md',$4,$3,NOW())`,
    [args.id, identity, args.scope.companyId, soul],
  )
}

export async function findAgent(db: Queryable, companyId: string, id: string) {
  const { rows } = await db.query<{ kind: string; departed_at: string | null }>(
    `SELECT kind,departed_at FROM participants WHERE id=$1 AND company_id=$2`, [id, companyId],
  )
  return rows[0] ?? null
}

export async function updateAgent(db: Queryable, companyId: string, id: string, patch: UpdateAgentInput): Promise<boolean> {
  const columns: Record<keyof UpdateAgentInput, string> = {
    name: 'name', role: 'role', systemPrompt: 'system_prompt', bio: 'bio', capabilities: 'capabilities',
  }
  const sets: string[] = []
  const values: unknown[] = []
  for (const [field, column] of Object.entries(columns) as Array<[keyof UpdateAgentInput, string]>) {
    if (!Object.hasOwn(patch, field)) continue
    const value = field === 'capabilities' ? JSON.stringify(patch[field]) : patch[field]
    values.push(value); sets.push(`${column}=$${values.length}${field === 'capabilities' ? '::jsonb' : ''}`)
  }
  values.push(id, companyId)
  const result = await db.query(
    `UPDATE participants SET ${sets.join(',')},tools='["ipython"]'::jsonb,updated_at=NOW()
      WHERE id=$${values.length - 1} AND company_id=$${values.length} AND kind='agent'`, values,
  )
  return (result.rowCount ?? 0) > 0
}

export async function ledGroups(db: Queryable, companyId: string, id: string) {
  const { rows } = await db.query<{ id: string; title: string }>(
    `SELECT id,title FROM conversations WHERE company_id=$1 AND kind='group' AND leader_id=$2 LIMIT 5`,
    [companyId, id],
  )
  return rows
}

export async function setAgentDeparted(db: Queryable, companyId: string, id: string, departed: boolean): Promise<void> {
  await db.query(
    `UPDATE participants SET departed_at=${departed ? 'NOW()' : 'NULL'},status=$3,status_updated_at=NOW()
      WHERE id=$1 AND company_id=$2 AND kind='agent'`,
    [id, companyId, departed ? 'resting' : 'avail'],
  )
}

export async function preferences(db: Queryable, userId: string) {
  const { rows } = await db.query<{ prefs: Record<string, unknown> }>(
    `SELECT prefs FROM user_preferences WHERE user_id=$1`, [userId],
  )
  return rows[0]?.prefs ?? {}
}

export async function savePreferences(db: Queryable, userId: string, value: Record<string, unknown>): Promise<void> {
  await db.query(
    `INSERT INTO user_preferences (user_id,prefs,updated_at) VALUES ($1,$2::jsonb,NOW())
     ON CONFLICT(user_id) DO UPDATE SET prefs=EXCLUDED.prefs,updated_at=NOW()`,
    [userId, JSON.stringify(value)],
  )
}

export async function autonomy(db: Queryable, userId: string, agentId: string) {
  const { rows } = await db.query(
    `SELECT user_id AS "userId",agent_id AS "agentId",threshold,pulled,led,dissolved
       FROM agent_autonomy WHERE user_id=$1 AND agent_id=$2`, [userId, agentId],
  )
  return rows[0] ?? { userId, agentId, threshold: 0.6, pulled: 0, led: 0, dissolved: 0 }
}

export async function saveAutonomy(db: Queryable, userId: string, agentId: string, threshold: number): Promise<void> {
  await db.query(
    `INSERT INTO agent_autonomy (user_id,agent_id,threshold) VALUES ($1,$2,$3)
     ON CONFLICT(user_id,agent_id) DO UPDATE SET threshold=EXCLUDED.threshold`,
    [userId, agentId, threshold],
  )
}

export async function allAutonomy(db: Queryable, userId: string, companyId: string) {
  const { rows } = await db.query(
    `SELECT autonomy.user_id AS "userId",autonomy.agent_id AS "agentId",
            autonomy.threshold,autonomy.pulled,autonomy.led,autonomy.dissolved
       FROM agent_autonomy autonomy JOIN participants participant ON participant.id=autonomy.agent_id
      WHERE autonomy.user_id=$1 AND participant.company_id=$2
        AND (NOT EXISTS(SELECT 1 FROM learning_project_teacher_agents pulse
              WHERE pulse.agent_id=participant.id AND pulse.company_id=participant.company_id)
          OR EXISTS(SELECT 1 FROM learning_project_teacher_agents pulse
              JOIN courses course ON course.project_id=pulse.project_id AND course.company_id=pulse.company_id
              JOIN course_members teacher ON teacher.course_id=course.id AND teacher.company_id=course.company_id
                AND teacher.user_id=$1 AND teacher.role='teacher'
             WHERE pulse.agent_id=participant.id AND pulse.company_id=participant.company_id))`,
    [userId, companyId],
  )
  return rows
}
