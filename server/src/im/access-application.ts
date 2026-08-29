import type { Queryable } from '../db/queryable.js'
import { createPermissionService } from '../modules/access/public.js'

export class ImAccessApplication {
  constructor(private readonly db: Queryable) {}

  async authorize(input: { userId: string; companyId: string }): Promise<boolean> {
    const decision = await createPermissionService(this.db).can({
      actorUserId: input.userId,
      action: 'company:read',
      companyId: input.companyId,
    })
    return decision.allowed
  }
}
