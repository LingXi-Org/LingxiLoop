import type { Queryable } from '../../db/queryable.js'
import { HttpError } from '../../http/errors.js'
import type { z } from 'zod'
import type { adminUserListQuerySchema, adminUserPatchSchema } from './contracts.js'
import { findUser, isAdmin, listUserCompanies, listUsers, readStats, setAdmin } from './repository.js'

export class AdminApplicationError extends HttpError {}

export interface AdminInfrastructure {
  suspendUser: (input: { userId: string; adminId: string; reason: string | null }) => Promise<void>
  unsuspendUser: (input: { userId: string; adminId: string }) => Promise<void>
}

export class AdminApplication {
  constructor(
    private readonly db: Queryable,
    private readonly infrastructure: AdminInfrastructure,
  ) {}

  async authorize(userId: string | undefined): Promise<string> {
    if (!userId) throw new AdminApplicationError(401, 'authentication required')
    if (!await isAdmin(this.db, userId)) throw new AdminApplicationError(403, 'admin only')
    return userId
  }

  async users(actorId: string | undefined, input: z.infer<typeof adminUserListQuerySchema>) {
    await this.authorize(actorId)
    return { ...(await listUsers(this.db, input)), limit: input.limit, offset: input.offset }
  }

  async user(actorId: string | undefined, userId: string) {
    await this.authorize(actorId)
    const user = await findUser(this.db, userId)
    if (!user) throw new AdminApplicationError(404, 'user not found')
    return { ...user, companies: await listUserCompanies(this.db, userId) }
  }

  async patchUser(
    actorId: string | undefined,
    userId: string,
    patch: z.infer<typeof adminUserPatchSchema>,
  ) {
    const adminId = await this.authorize(actorId)
    if (patch.isAdmin !== undefined) {
      if (userId === adminId && !patch.isAdmin) {
        throw new AdminApplicationError(409, 'cannot demote yourself')
      }
      if (!await setAdmin(this.db, userId, patch.isAdmin)) {
        throw new AdminApplicationError(404, 'user not found')
      }
    }
    if (patch.suspended !== undefined) {
      if (patch.suspended) {
        await this.infrastructure.suspendUser({
          userId,
          adminId,
          reason: patch.suspensionReason?.trim() || null,
        })
      } else {
        await this.infrastructure.unsuspendUser({ userId, adminId })
      }
    }
    const user = await findUser(this.db, userId)
    if (!user) throw new AdminApplicationError(404, 'user not found')
    return user
  }

  async stats(actorId: string | undefined) {
    await this.authorize(actorId)
    return readStats(this.db)
  }
}
