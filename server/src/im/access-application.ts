import type { Queryable } from '../db/queryable.js'
import { isCompanyMember } from './access-repository.js'

export class ImAccessApplication {
  constructor(private readonly db: Queryable) {}

  authorize(input: { userId: string; companyId: string }): Promise<boolean> {
    return isCompanyMember(this.db, input)
  }
}
