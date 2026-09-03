import { randomUUID } from 'node:crypto'
import type { Queryable } from '../../db/queryable.js'
import { ensurePersonalFreePlan } from '../entitlements/public.js'

export interface PersonalWorkspaceProvisioningResult {
  companyId: string
  projectId: string
  created: boolean
}

interface LockedUser {
  id: string
  email: string
  display_name: string
  avatar_url: string | null
}

interface PersonalContextRow {
  company_id: string
  company_status: string
  company_plan_code: string
  company_plan_status: string
  company_role: string | null
  company_membership_status: string | null
  project_id: string | null
  project_kind: string | null
  project_status: string | null
  project_plan_id: string | null
  project_role: string | null
  project_membership_status: string | null
}

function personalSlug(email: string, companyId: string): string {
  const base = (email.split('@')[0] || 'learning')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30) || 'learning'
  return `${base}-${companyId.replace(/^co-/, '').slice(0, 12)}`
}

async function lockUser(db: Queryable, userId: string): Promise<LockedUser> {
  const { rows } = await db.query<LockedUser>(
    `SELECT id,email,display_name,avatar_url FROM users
      WHERE id=$1 AND deleted_at IS NULL
      FOR UPDATE`,
    [userId],
  )
  const user = rows[0]
  if (!user) throw new Error(`cannot provision Personal Context for missing user: ${userId}`)
  return user
}

async function findPersonalContext(db: Queryable, userId: string): Promise<PersonalContextRow | null> {
  const { rows } = await db.query<PersonalContextRow>(
    `SELECT company.id AS company_id,company.status AS company_status,plan.code AS company_plan_code,
            plan.status AS company_plan_status,
            company_member.role AS company_role,company_member.status AS company_membership_status,
            project.id AS project_id,project.kind AS project_kind,
            project.status AS project_status,project.plan_id AS project_plan_id,
            project_member.role AS project_role,project_member.status AS project_membership_status
       FROM companies company
       JOIN plans plan ON plan.id=company.plan_id
       LEFT JOIN company_memberships company_member
         ON company_member.company_id=company.id AND company_member.user_id=$1
       LEFT JOIN projects project
         ON project.company_id=company.id AND project.is_default=TRUE
       LEFT JOIN project_memberships project_member
         ON project_member.company_id=company.id AND project_member.project_id=project.id
        AND project_member.user_id=$1
      WHERE company.type='PERSONAL' AND company.personal_owner_user_id=$1`,
    [userId],
  )
  return rows[0] ?? null
}

function assertCompletePersonalContext(row: PersonalContextRow): void {
  if (
    row.company_status !== 'ACTIVE'
    || row.company_plan_code !== 'PERSONAL_FREE'
    || row.company_plan_status !== 'ACTIVE'
    || row.company_role !== 'OWNER'
    || row.company_membership_status !== 'ACTIVE'
    || !row.project_id
    || row.project_kind !== 'PERSONAL_LEARNING'
    || row.project_status !== 'ACTIVE'
    || row.project_plan_id !== null
    || row.project_role !== 'OWNER'
    || row.project_membership_status !== 'ACTIVE'
  ) {
    throw new Error(`Personal Context invariant violated for company ${row.company_id}`)
  }
}

/**
 * Create or verify the one Personal Context owned by a user.
 * The caller must supply a transaction-scoped Queryable so User creation and
 * all four owned rows commit or roll back together.
 */
export async function provisionPersonalWorkspace(
  db: Queryable,
  userId: string,
): Promise<PersonalWorkspaceProvisioningResult> {
  const user = await lockUser(db, userId)
  const existing = await findPersonalContext(db, userId)
  let result: PersonalWorkspaceProvisioningResult
  if (existing) {
    assertCompletePersonalContext(existing)
    result = { companyId: existing.company_id, projectId: existing.project_id!, created: false }
  } else {
    const planId = await ensurePersonalFreePlan(db)
    const companyId = `co-${randomUUID().slice(0, 12)}`
    const projectId = `project-${randomUUID().slice(0, 18)}`
    await db.query(
      `INSERT INTO companies (id,name,slug,type,status,personal_owner_user_id,plan_id)
       VALUES ($1,$2,$3,'PERSONAL','ACTIVE',$4,$5)`,
      [companyId, `${user.display_name}'s workspace`, personalSlug(user.email, companyId), user.id, planId],
    )
    await db.query(
      `INSERT INTO company_memberships (company_id,user_id,role,status)
       VALUES ($1,$2,'OWNER','ACTIVE')`,
      [companyId, user.id],
    )
    await db.query(
      `INSERT INTO projects (id,company_id,kind,plan_id,name,description,color,status,created_by,is_default)
       VALUES ($1,$2,'PERSONAL_LEARNING',NULL,'我的学习','个人学习的默认空间','#64748b','ACTIVE',$3,TRUE)`,
      [projectId, companyId, user.id],
    )
    await db.query(
      `INSERT INTO project_memberships (company_id,project_id,user_id,role,status)
       VALUES ($1,$2,$3,'OWNER','ACTIVE')`,
      [companyId, projectId, user.id],
    )
    result = { companyId, projectId, created: true }
  }
  await db.query(
    `INSERT INTO participants (id,kind,name,role,initial,avatar_bg,avatar_url,status,company_id)
     VALUES ($1,'human',$2,NULL,upper(left($2,1)),'#FF8870',$3,'avail',$4)
     ON CONFLICT (id,company_id) DO UPDATE SET
       name=EXCLUDED.name,initial=EXCLUDED.initial,avatar_url=EXCLUDED.avatar_url,
       status='avail',departed_at=NULL`,
    [user.id, user.display_name, user.avatar_url, result.companyId],
  )
  return result
}
