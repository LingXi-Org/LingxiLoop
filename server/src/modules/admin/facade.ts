import { audit } from '../../auth.js'
import { mirrorIdentityAvatar } from '../../avatar.js'
import { pool } from '../../db/pool.js'
import { withTransaction } from '../../db/transaction.js'
import { env } from '../../env.js'
import { onboardStarterAgents } from '../../onboardCompany.js'
import { storage } from '../../storage.js'
import { AdminApplication } from './application.js'
import type { AppSettingKey, EnqueueWaitlistInput, WaitlistFilter } from './contracts.js'
import { sendWaitlistApprovedEmail } from './welcome-email.js'

export const adminApplication = new AdminApplication({
  db: pool,
  transaction: (work) => withTransaction(pool, work),
  adminEmails: env.ADMIN_EMAILS,
  mirrorAvatar: (userId, providerUrl) => mirrorIdentityAvatar(storage, userId, providerUrl),
  onboardStarterAgents,
  sendWaitlistApprovedEmail,
  audit,
})

export async function seedAdmins(): Promise<void> {
  const count = await adminApplication.seedAdmins()
  if (count > 0) console.log(`[admin] promoted ${count} user(s) to admin via env allow-list`)
}

export function isAllowlistedAdmin(email: string): boolean {
  return adminApplication.isAllowlistedAdmin(email)
}

export function getSettings() {
  return adminApplication.getSettings()
}

export function setSetting(key: AppSettingKey, value: boolean, updatedBy: string): Promise<void> {
  return adminApplication.setSetting(key, value, updatedBy)
}

export function isWaitlistEnabled(): Promise<boolean> {
  return adminApplication.isWaitlistEnabled()
}

export function enqueueWaitlist(input: EnqueueWaitlistInput) {
  return adminApplication.enqueueWaitlist(input)
}

export function listWaitlist(filter: WaitlistFilter) {
  return adminApplication.listWaitlist(filter)
}

export function approveWaitlist(waitlistId: string, decidedBy: string) {
  return adminApplication.approveWaitlist(waitlistId, decidedBy)
}

export function rejectWaitlist(waitlistId: string, decidedBy: string, note: string | null): Promise<void> {
  return adminApplication.rejectWaitlist(waitlistId, decidedBy, note)
}
