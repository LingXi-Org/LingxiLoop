import { randomUUID } from 'node:crypto'
import type { Queryable } from '../../db/queryable.js'
import { HttpError } from '../../http/errors.js'
import type { z } from 'zod'
import type {
  AppSettingKey,
  EnqueueWaitlistInput,
  WaitlistFilter,
  adminUserListQuerySchema,
  adminUserPatchSchema,
} from './contracts.js'
import {
  attachApprovedAvatar,
  findUser,
  hasPendingInvitation,
  insertApprovedUser,
  insertCompanyOwner,
  insertPersonalCompany,
  isAdmin,
  listUserCompanies,
  listUsers,
  listWaitlistRows,
  lockWaitlistRow,
  markWaitlistApproved,
  readSettings,
  readStats,
  readWaitlistEnabled,
  rejectPendingWaitlist,
  revokeUserSessions,
  seedAdminEmails,
  setAdmin,
  suspendUserRecord,
  unsuspendUserRecord,
  upsertWaitlist,
  userExistsByEmail,
  writeSetting,
} from './repository.js'

export class AdminApplicationError extends HttpError {}

export interface AdminInfrastructure {
  db: Queryable
  transaction<T>(work: (db: Queryable) => Promise<T>): Promise<T>
  adminEmails: readonly string[]
  mirrorAvatar(userId: string, providerUrl: string | null): Promise<string | null>
  installStarterAgents(db: Queryable, companyId: string): Promise<boolean>
  finalizeStarterAgents(installed: boolean): Promise<void>
  sendWaitlistApprovedEmail(input: { email: string; displayName: string }): Promise<void>
  audit(input: {
    kind: 'user_suspend' | 'user_unsuspend'
    userId: string
    detail: Record<string, unknown>
  }): Promise<void>
}

export class AdminApplication {
  constructor(private readonly infrastructure: AdminInfrastructure) {}

  private get db(): Queryable {
    return this.infrastructure.db
  }

  isAllowlistedAdmin(email: string): boolean {
    return this.infrastructure.adminEmails.includes(email.trim().toLowerCase())
  }

  async seedAdmins(): Promise<number> {
    return seedAdminEmails(this.db, this.infrastructure.adminEmails)
  }

  async authorize(userId: string | undefined): Promise<string> {
    if (!userId) throw new AdminApplicationError(401, 'authentication required')
    if (!await isAdmin(this.db, userId)) throw new AdminApplicationError(403, 'admin only')
    return userId
  }

  async getSettings() {
    return readSettings(this.db)
  }

  async setSetting(key: AppSettingKey, value: boolean, updatedBy: string): Promise<void> {
    await writeSetting(this.db, key, value, updatedBy)
  }

  async isWaitlistEnabled(): Promise<boolean> {
    return readWaitlistEnabled(this.db)
  }

  async enqueueWaitlist(input: EnqueueWaitlistInput) {
    return upsertWaitlist(this.db, `wl-${randomUUID().slice(0, 12)}`, input)
  }

  async listWaitlist(filter: WaitlistFilter) {
    return listWaitlistRows(this.db, filter)
  }

  async approveWaitlist(waitlistId: string, decidedBy: string) {
    const approved = await this.infrastructure.transaction(async (db) => {
      const row = await lockWaitlistRow(db, waitlistId)
      if (!row) throw new AdminApplicationError(404, 'waitlist entry not found')
      if (row.status !== 'pending') throw new AdminApplicationError(409, `already ${row.status}`)
      if (await userExistsByEmail(db, row.email)) {
        throw new AdminApplicationError(409, `a user with email ${row.email} already exists; reject this entry`)
      }

      const userId = `u-${randomUUID().slice(0, 12)}`
      const skipPersonalWorkspace = await hasPendingInvitation(db, row.email)
      await insertApprovedUser(db, {
        userId,
        row,
        isAdmin: this.isAllowlistedAdmin(row.email),
      })

      let companyId: string | null = null
      if (!skipPersonalWorkspace) {
        companyId = `co-${randomUUID().slice(0, 10)}`
        const slugSeed = (row.email.split('@')[0] || 'workspace')
          .replace(/[^a-z0-9]+/g, '-')
          .slice(0, 30) || 'workspace'
        let inserted = false
        for (let attempt = 0; attempt < 5 && !inserted; attempt += 1) {
          const slug = attempt === 0 ? slugSeed : `${slugSeed}-${randomUUID().slice(0, 4)}`
          inserted = await insertPersonalCompany(db, {
            companyId,
            userId,
            displayName: row.displayName,
            slug,
          })
        }
        if (!inserted) throw new Error('could not allocate a unique company slug')
        await insertCompanyOwner(db, companyId, userId)
      }

      const avatarUrl = await this.infrastructure.mirrorAvatar(userId, row.avatarUrl)
      await attachApprovedAvatar(db, { userId, companyId, displayName: row.displayName, avatarUrl })
      const installedStarterAgents = companyId
        ? await this.infrastructure.installStarterAgents(db, companyId)
        : false
      await markWaitlistApproved(db, waitlistId, decidedBy)
      return { userId, companyId, email: row.email, displayName: row.displayName, installedStarterAgents }
    })

    await Promise.allSettled([
      ...(approved.companyId ? [this.infrastructure.finalizeStarterAgents(approved.installedStarterAgents)] : []),
      this.infrastructure.sendWaitlistApprovedEmail({
        email: approved.email,
        displayName: approved.displayName,
      }),
    ])
    return { userId: approved.userId, companyId: approved.companyId }
  }

  async rejectWaitlist(waitlistId: string, decidedBy: string, note: string | null): Promise<void> {
    if (!await rejectPendingWaitlist(this.db, waitlistId, decidedBy, note)) {
      throw new AdminApplicationError(404, 'no pending waitlist entry')
    }
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
        await this.suspendUser({
          userId,
          adminId,
          reason: patch.suspensionReason?.trim() || null,
        })
      } else {
        await this.unsuspendUser({ userId, adminId })
      }
    }
    const user = await findUser(this.db, userId)
    if (!user) throw new AdminApplicationError(404, 'user not found')
    return user
  }

  async suspendUser(input: { userId: string; adminId: string; reason: string | null }): Promise<void> {
    if (input.userId === input.adminId) throw new AdminApplicationError(409, 'cannot suspend yourself')
    await this.infrastructure.transaction(async (db) => {
      const status = await suspendUserRecord(db, input)
      if (status === 'missing') throw new AdminApplicationError(404, 'user not found')
      if (status === 'already-suspended') throw new AdminApplicationError(409, 'user is already suspended')
      await revokeUserSessions(db, input.userId)
    })
    await this.infrastructure.audit({
      kind: 'user_suspend',
      userId: input.adminId,
      detail: { targetUserId: input.userId, reason: input.reason ?? undefined },
    })
  }

  async unsuspendUser(input: { userId: string; adminId: string }): Promise<void> {
    const status = await unsuspendUserRecord(this.db, input.userId)
    if (status === 'missing') throw new AdminApplicationError(404, 'user not found')
    if (status === 'active') return
    await this.infrastructure.audit({
      kind: 'user_unsuspend',
      userId: input.adminId,
      detail: { targetUserId: input.userId },
    })
  }

  async stats(actorId: string | undefined) {
    await this.authorize(actorId)
    return readStats(this.db)
  }
}
