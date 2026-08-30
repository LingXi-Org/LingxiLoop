import type { Queryable } from '../../db/queryable.js'
import type { CreateEducationCompanyInput } from './contracts.js'

export interface EducationCoreIds { companyId: string; contractId: string; seatId: string }

export async function insertEducationCore(db: Queryable, input: CreateEducationCompanyInput & EducationCoreIds & { creatorUserId: string }): Promise<boolean> {
  const { rows: users } = await db.query<{ display_name: string; avatar_url: string | null }>(
    `SELECT display_name,avatar_url FROM users WHERE id=$1 AND deleted_at IS NULL AND suspended_at IS NULL FOR UPDATE`, [input.creatorUserId],
  )
  if (!users[0]) throw new Error('active creator user required')
  const { rows: plans } = await db.query(`SELECT 1 FROM plans WHERE id=$1 AND status='ACTIVE'`, [input.planId])
  if (!plans[0]) throw new Error('active Education Plan required')
  const company = await db.query(
    `INSERT INTO companies(id,name,slug,type,status,personal_owner_user_id,plan_id)
     VALUES ($1,$2,$3,'EDUCATION','TRIAL',NULL,$4) ON CONFLICT (id) DO NOTHING`,
    [input.companyId, input.name, input.slug, input.planId],
  )
  if (company.rowCount === 0) {
    const { rows } = await db.query<{ name: string; slug: string; plan_id: string; type: string }>(
      `SELECT name,slug,plan_id,type FROM companies WHERE id=$1 FOR UPDATE`, [input.companyId],
    )
    if (!rows[0] || rows[0].type !== 'EDUCATION' || rows[0].name !== input.name || rows[0].slug !== input.slug || rows[0].plan_id !== input.planId) {
      throw new Error('Education Company idempotency identity was reused')
    }
  }
  await db.query(
    `INSERT INTO company_memberships(company_id,user_id,role,status) VALUES ($1,$2,'OWNER','ACTIVE')
     ON CONFLICT (company_id,user_id) DO NOTHING`, [input.companyId, input.creatorUserId],
  )
  const user = users[0]
  await db.query(
    `INSERT INTO participants(id,kind,name,role,initial,avatar_bg,status,avatar_url,company_id)
     VALUES ($1,'human',$2,NULL,$3,'#FF8870','avail',$4,$5)
     ON CONFLICT (id,company_id) DO UPDATE SET name=EXCLUDED.name,avatar_url=EXCLUDED.avatar_url,departed_at=NULL`,
    [input.creatorUserId, user.display_name, user.display_name.slice(0, 1).toUpperCase() || '?', user.avatar_url, input.companyId],
  )
  await db.query(
    `INSERT INTO education_contracts(id,company_id,plan_id,status,starts_at,ends_at,seat_limit,config)
     VALUES ($1,$2,$3,'TRIAL',$4,$5,$6,$7::jsonb) ON CONFLICT (id) DO NOTHING`,
    [input.contractId, input.companyId, input.planId, input.contract.startsAt, input.contract.endsAt, input.contract.seatLimit, JSON.stringify(input.contract.config)],
  )
  await db.query(
    `INSERT INTO organization_seats(id,company_id,contract_id,user_id,status)
     VALUES ($1,$2,$3,$4,'ACTIVE') ON CONFLICT (id) DO NOTHING`,
    [input.seatId, input.companyId, input.contractId, input.creatorUserId],
  )
  return company.rowCount === 1
}
