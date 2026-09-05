import type { Queryable } from '../../db/queryable.js'
import type { CompanyStatus } from '../../domain/public.js'

export async function updateCompanyLifecycleStatus(
  db: Queryable,
  input: { companyId: string; expected: CompanyStatus; next: CompanyStatus },
): Promise<boolean> {
  const result = await db.query(
    `UPDATE companies SET status=$3,updated_at=NOW()
      WHERE id=$1 AND status=$2`,
    [input.companyId, input.expected, input.next],
  )
  return (result.rowCount ?? 0) === 1
}
