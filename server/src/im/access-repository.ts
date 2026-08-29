import type { Queryable } from '../db/queryable.js'

export async function isCompanyMember(
  db: Queryable,
  input: { userId: string; companyId: string },
): Promise<boolean> {
  const { rows } = await db.query(
    `SELECT 1 FROM company_members WHERE user_id=$1 AND company_id=$2`,
    [input.userId, input.companyId],
  )
  return Boolean(rows[0])
}
