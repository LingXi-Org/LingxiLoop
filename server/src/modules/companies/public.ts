import type { Queryable } from '../../db/queryable.js'
import { companyApplication } from './facade.js'

export function provisionPersonalCompany(
  db: Queryable,
  input: { id: string; name: string; slug: string; userId: string; projectId: string },
): Promise<boolean> {
  return companyApplication.provisionPersonalCompany(db, input)
}
