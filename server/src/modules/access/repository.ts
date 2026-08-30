import type { Queryable } from '../../db/queryable.js'
import type {
  CompanyRole,
  CompanyStatus,
  CompanyType,
  EntitlementCode,
  EntitlementValue,
  MembershipStatus,
  PermissionResource,
  PlanStatus,
  ProjectKind,
  ProjectRole,
  ProjectStatus,
} from '../../domain/public.js'

export interface ActorRecord {
  id: string
  deletedAt: Date | null
  suspendedAt: Date | null
}

export interface CompanyRecord {
  id: string
  type: CompanyType
  status: CompanyStatus
  planId: string
}

export interface ProjectRecord {
  id: string
  companyId: string
  kind: ProjectKind
  planId: string | null
  status: ProjectStatus
}

export interface MembershipRecord<Role> {
  role: Role
  status: MembershipStatus
}

export interface PlanRecord {
  id: string
  code: string
  status: PlanStatus
}

export interface EntitlementRecord {
  code: EntitlementCode
  value: EntitlementValue
}

export interface ResourceRecord {
  companyId: string
  projectId: string | null
  createdBy: string | null
  conversationMembers: string[] | null
  leaderId: string | null
  status: string | null
}

interface ActorRow {
  id: string
  deleted_at: Date | null
  suspended_at: Date | null
}

interface CompanyRow {
  id: string
  type: CompanyType
  status: CompanyStatus
  plan_id: string
}

interface ProjectRow {
  id: string
  company_id: string
  kind: ProjectKind
  plan_id: string | null
  status: ProjectStatus
}

interface MembershipRow<Role> {
  role: Role
  status: MembershipStatus
}

interface PlanRow {
  id: string
  code: string
  status: PlanStatus
}

interface EntitlementRow {
  code: EntitlementCode
  value: EntitlementValue
}

interface OrganizationSeatPlanRow {
  plan_id: string
}

interface ResourceRow {
  company_id: string
  project_id: string | null
  created_by: string | null
  conversation_members: string[] | null
  leader_id: string | null
  resource_status: string | null
}

export class AccessRepository {
  constructor(
    private readonly db: Queryable,
    private readonly lockDependencies = false,
  ) {}

  private get lockClause(): string {
    return this.lockDependencies ? ' FOR UPDATE' : ''
  }

  async isActiveProjectStudent(companyId: string, projectId: string, userId: string): Promise<boolean> {
    const { rows } = await this.db.query(
      `SELECT 1 FROM project_memberships
        WHERE company_id=$1 AND project_id=$2 AND user_id=$3
          AND role='STUDENT' AND status='ACTIVE'${this.lockClause}`,
      [companyId, projectId, userId],
    )
    return Boolean(rows[0])
  }

  async isActiveProjectMember(companyId: string, projectId: string, userId: string): Promise<boolean> {
    const { rows } = await this.db.query(
      `SELECT 1 FROM project_memberships
        WHERE company_id=$1 AND project_id=$2 AND user_id=$3
          AND status='ACTIVE'${this.lockClause}`,
      [companyId, projectId, userId],
    )
    return Boolean(rows[0])
  }

  async activeProjectTeacherIds(companyId: string, projectId: string): Promise<string[]> {
    const { rows } = await this.db.query<{ user_id: string }>(
      `SELECT user_id FROM project_memberships
        WHERE company_id=$1 AND project_id=$2 AND status='ACTIVE'
          AND role IN ('OWNER','TEACHER')
        ORDER BY user_id${this.lockClause}`,
      [companyId, projectId],
    )
    return rows.map((row) => row.user_id)
  }

  async actor(id: string): Promise<ActorRecord | null> {
    const { rows } = await this.db.query<ActorRow>(
      `SELECT id,deleted_at,suspended_at FROM users WHERE id=$1${this.lockClause}`,
      [id],
    )
    const row = rows[0]
    return row ? { id: row.id, deletedAt: row.deleted_at, suspendedAt: row.suspended_at } : null
  }

  async company(id: string): Promise<CompanyRecord | null> {
    const { rows } = await this.db.query<CompanyRow>(
      `SELECT id,type,status,plan_id FROM companies WHERE id=$1${this.lockClause}`,
      [id],
    )
    const row = rows[0]
    return row ? { id: row.id, type: row.type, status: row.status, planId: row.plan_id } : null
  }

  async project(id: string): Promise<ProjectRecord | null> {
    const { rows } = await this.db.query<ProjectRow>(
      `SELECT id,company_id,kind,plan_id,status FROM projects WHERE id=$1${this.lockClause}`,
      [id],
    )
    const row = rows[0]
    return row ? {
      id: row.id,
      companyId: row.company_id,
      kind: row.kind,
      planId: row.plan_id,
      status: row.status,
    } : null
  }

  async companyMembership(companyId: string, userId: string): Promise<MembershipRecord<CompanyRole> | null> {
    const { rows } = await this.db.query<MembershipRow<CompanyRole>>(
      `SELECT role,status FROM company_memberships WHERE company_id=$1 AND user_id=$2${this.lockClause}`,
      [companyId, userId],
    )
    return rows[0] ?? null
  }

  async activeOrganizationSeatPlanId(
    companyId: string,
    userId: string,
    companyStatus: CompanyStatus,
  ): Promise<string | null> {
    const { rows } = await this.db.query<OrganizationSeatPlanRow>(
      `SELECT contract.plan_id
         FROM organization_seats seat
         JOIN education_contracts contract ON contract.id=seat.contract_id
          AND contract.company_id=seat.company_id
        WHERE seat.company_id=$1 AND seat.user_id=$2 AND seat.status='ACTIVE'
          AND ((contract.status IN ('TRIAL','ACTIVE')
                AND contract.starts_at <= CURRENT_TIMESTAMP AND contract.ends_at > CURRENT_TIMESTAMP)
            OR (contract.status='EXPIRED'
                AND $3 IN ('GRACE_PERIOD','READ_ONLY','OFFBOARDED','RETENTION','ARCHIVED')))${
            this.lockDependencies ? ' FOR UPDATE OF seat,contract' : ''
          }`,
      [companyId, userId, companyStatus],
    )
    return rows[0]?.plan_id ?? null
  }

  async projectMembership(
    companyId: string,
    projectId: string,
    userId: string,
  ): Promise<MembershipRecord<ProjectRole> | null> {
    const { rows } = await this.db.query<MembershipRow<ProjectRole>>(
      `SELECT role,status FROM project_memberships
        WHERE company_id=$1 AND project_id=$2 AND user_id=$3${this.lockClause}`,
      [companyId, projectId, userId],
    )
    return rows[0] ?? null
  }

  async plan(id: string): Promise<PlanRecord | null> {
    const { rows } = await this.db.query<PlanRow>(
      `SELECT id,code,status FROM plans WHERE id=$1${this.lockClause}`,
      [id],
    )
    return rows[0] ?? null
  }

  async entitlements(planId: string): Promise<EntitlementRecord[]> {
    const { rows } = await this.db.query<EntitlementRow>(
      `SELECT entitlement.code,plan_entitlement.value
         FROM plan_entitlements plan_entitlement
         JOIN entitlements entitlement ON entitlement.id=plan_entitlement.entitlement_id
        WHERE plan_entitlement.plan_id=$1${this.lockDependencies ? ' FOR UPDATE OF plan_entitlement' : ''}`,
      [planId],
    )
    return rows
  }

  async resource(resource: PermissionResource): Promise<ResourceRecord | null> {
    const query = resourceQuery(resource)
    const lockClause = this.lockDependencies ? ` FOR UPDATE OF ${query.lockTarget}` : ''
    const { rows } = await this.db.query<ResourceRow>(`${query.sql}${lockClause}`, query.params)
    const row = rows[0]
    return row ? {
      companyId: row.company_id,
      projectId: row.project_id,
      createdBy: row.created_by,
      conversationMembers: row.conversation_members,
      leaderId: row.leader_id,
      status: row.resource_status,
    } : null
  }
}

function resourceQuery(resource: PermissionResource): {
  sql: string
  params: readonly unknown[]
  lockTarget: string
} {
  switch (resource.type) {
    case 'company':
      return {
        sql: `SELECT id AS company_id,NULL::text AS project_id,NULL::text AS created_by,
                     NULL::jsonb AS conversation_members,NULL::text AS leader_id,status AS resource_status
                FROM companies WHERE id=$1`,
        params: [resource.id],
        lockTarget: 'companies',
      }
    case 'project':
      return {
        sql: `SELECT company_id,id AS project_id,created_by,NULL::jsonb AS conversation_members,
                     NULL::text AS leader_id,status AS resource_status FROM projects WHERE id=$1`,
        params: [resource.id],
        lockTarget: 'projects',
      }
    case 'course':
      return {
        sql: `SELECT company_id,project_id,created_by,NULL::jsonb AS conversation_members,
                     NULL::text AS leader_id,NULL::text AS resource_status FROM courses WHERE id=$1`,
        params: [resource.id],
        lockTarget: 'courses',
      }
    case 'conversation':
      return {
        sql: `SELECT company_id,project_id,NULL::text AS created_by,members AS conversation_members,
                     leader_id,NULL::text AS resource_status FROM conversations WHERE id=$1`,
        params: [resource.id],
        lockTarget: 'conversations',
      }
    case 'message':
      return {
        sql: `SELECT message.company_id,conversation.project_id,message.author_id AS created_by,
                     conversation.members AS conversation_members,conversation.leader_id,
                     NULL::text AS resource_status
                FROM email_messages message
                JOIN conversations conversation ON conversation.id=message.conversation_id
                 AND conversation.company_id=message.company_id
               WHERE message.message_id=$1`,
        params: [resource.id],
        lockTarget: 'message',
      }
    case 'poll':
      return {
        sql: `SELECT poll.company_id,conversation.project_id,poll.author_id AS created_by,
                     conversation.members AS conversation_members,conversation.leader_id,
                     NULL::text AS resource_status
                FROM im_polls poll
                JOIN conversations conversation ON conversation.id=poll.channel_id
                 AND conversation.company_id=poll.company_id
               WHERE poll.poll_client_msg_no=$1`,
        params: [resource.id],
        lockTarget: 'poll',
      }
    case 'knowledge_source':
      return {
        sql: `SELECT company_id,project_id,created_by,NULL::jsonb AS conversation_members,
                     NULL::text AS leader_id,status AS resource_status
                FROM knowledge_sources WHERE id=$1 AND deleted_at IS NULL`,
        params: [resource.id],
        lockTarget: 'knowledge_sources',
      }
    case 'document':
      return {
        sql: `SELECT document.company_id,document.project_id,document.created_by,
                     conversation.members AS conversation_members,conversation.leader_id,
                     NULL::text AS resource_status
                FROM documents document
                LEFT JOIN conversations conversation ON conversation.id=document.conversation_id
                 AND conversation.company_id=document.company_id AND conversation.project_id=document.project_id
               WHERE document.id=$1`,
        params: [resource.id],
        lockTarget: 'document',
      }
    case 'calendar_event':
      return {
        sql: `SELECT company_id,project_id,created_by,NULL::jsonb AS conversation_members,
                     NULL::text AS leader_id,status AS resource_status FROM calendar_events WHERE id=$1`,
        params: [resource.id],
        lockTarget: 'calendar_events',
      }
    case 'canvas':
      return {
        sql: `SELECT canvas.company_id,canvas.project_id,canvas.created_by,
                     conversation.members AS conversation_members,conversation.leader_id,canvas.status AS resource_status
                FROM canvases canvas
                LEFT JOIN conversations conversation ON conversation.id=canvas.conversation_id
                 AND conversation.company_id=canvas.company_id AND conversation.project_id=canvas.project_id
               WHERE canvas.id=$1`,
        params: [resource.id],
        lockTarget: 'canvas',
      }
    case 'canvas_frame':
      return {
        sql: `SELECT canvas.company_id,canvas.project_id,frame.created_by,
                     conversation.members AS conversation_members,conversation.leader_id,canvas.status AS resource_status
                FROM canvas_frames frame
                JOIN canvases canvas ON canvas.id=frame.canvas_id
                LEFT JOIN conversations conversation ON conversation.id=canvas.conversation_id
                 AND conversation.company_id=canvas.company_id AND conversation.project_id=canvas.project_id
               WHERE frame.id=$1`,
        params: [resource.id],
        lockTarget: 'frame',
      }
    case 'agent':
      return {
        sql: `SELECT company_id,NULL::text AS project_id,id AS created_by,NULL::jsonb AS conversation_members,
                     NULL::text AS leader_id,status AS resource_status
                FROM participants WHERE id=$1 AND kind='agent' AND departed_at IS NULL`,
        params: [resource.id],
        lockTarget: 'participants',
      }
    case 'approval':
      return {
        sql: `SELECT approval.company_id,conversation.project_id,NULL::text AS created_by,
                     conversation.members AS conversation_members,conversation.leader_id,approval.status AS resource_status
                FROM approvals approval
                LEFT JOIN conversations conversation ON conversation.id=approval.channel_id
                 AND conversation.company_id=approval.company_id
               WHERE approval.id=$1 AND approval.source='AGENT_OS'`,
        params: [resource.id],
        lockTarget: 'approval',
      }
    case 'routine':
      return {
        sql: `SELECT routine.company_id,conversation.project_id,routine.created_by,
                     conversation.members AS conversation_members,conversation.leader_id,routine.status AS resource_status
                FROM agent_routines routine
                LEFT JOIN conversations conversation ON conversation.id=routine.channel_id
                 AND conversation.company_id=routine.company_id
               WHERE routine.id=$1`,
        params: [resource.id],
        lockTarget: 'routine',
      }
  }
}
