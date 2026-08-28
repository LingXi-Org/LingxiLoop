import { randomUUID } from 'node:crypto'
import type { Queryable } from '../../db/queryable.js'
import type { AuditInput } from './session-application.js'
import type { IdentityProvider, NormalizedIdentityProfile } from './contracts.js'
import {
  finalizeIdentityLogin,
  findActiveUserByEmail,
  findLinkedIdentityUser,
  insertIdentityUser,
  linkIdentity,
  updateIdentityAvatar,
} from './oauth-repository.js'

interface CompletionResult {
  kind: 'completed'
  userId: string
  email: string
  displayName: string
  companyId: string | null
  installedCompany: boolean
}

interface WaitlistedResult {
  kind: 'waitlisted'
}

interface OAuthApplicationDependencies {
  transaction<T>(work: (db: Queryable) => Promise<T>): Promise<T>
  fetchProfile(provider: IdentityProvider, code: string): Promise<NormalizedIdentityProfile>
  waitlistEnabled(): Promise<boolean>
  isAllowlistedAdmin(email: string): boolean
  enqueueWaitlist(input: {
    provider: IdentityProvider
    providerId: string
    email: string
    displayName: string
    avatarUrl: string | null
  }): Promise<unknown>
  mirrorAvatar(userId: string, providerUrl: string | null): Promise<string | null>
  provisionCompany(
    db: Queryable,
    input: { id: string; name: string; slug: string; userId: string; projectId: string },
  ): Promise<boolean>
  finalizeCompany(installed: boolean): Promise<void>
  createLoginSession(
    userId: string,
    options: { ip?: string; ua?: string },
    audit: AuditInput,
  ): Promise<{ token: string; expiresAt: Date }>
  audit(input: AuditInput): Promise<void>
  defaultDoneUrl: string
  doneUrl(base: string, token: string, companyId: string | null): string
  waitlistUrl(base: string, email: string): string
  suspendedUrl(base: string, email: string, reason: string | null): string
  userId(): string
  companyId(): string
  projectId(): string
}

class WaitlistedIdentityError extends Error {
  constructor(readonly email: string, readonly displayName: string) {
    super(`waitlisted: ${email}`)
  }
}

class SuspendedIdentityError extends Error {
  constructor(readonly email: string, readonly reason: string | null) {
    super(`suspended: ${email}`)
  }
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === '23505')
}

function personalSlug(email: string, companyId: string): string {
  const base = (email.split('@')[0] || 'workspace')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30) || 'workspace'
  return `${base}-${companyId.replace(/^co-/, '').slice(0, 8)}`
}

export class OAuthApplication {
  constructor(private readonly dependencies: OAuthApplicationDependencies) {}

  async handleCallback(args: {
    provider: IdentityProvider
    code: string
    returnUrl: string | null
    ip: string | null
    userAgent: string | null
    inviteToken?: string | null
  }): Promise<string> {
    const profile = await this.dependencies.fetchProfile(args.provider, args.code)
    try {
      const result = await this.completeIdentity(args.provider, profile, args.inviteToken ?? null)
      const avatarUrl = await this.dependencies.mirrorAvatar(result.userId, profile.avatarUrl)
      await this.dependencies.transaction((db) => updateIdentityAvatar(db, result.userId, avatarUrl))
      if (result.companyId) await this.dependencies.finalizeCompany(result.installedCompany)
      const { token } = await this.dependencies.createLoginSession(
        result.userId,
        { ip: args.ip ?? undefined, ua: args.userAgent ?? undefined },
        {
          kind: 'login',
          userId: result.userId,
          companyId: result.companyId,
          ip: args.ip,
          userAgent: args.userAgent,
          detail: { provider: args.provider, email: result.email },
        },
      )
      return this.dependencies.doneUrl(
        args.returnUrl ?? this.dependencies.defaultDoneUrl,
        token,
        result.companyId,
      )
    } catch (error) {
      if (error instanceof WaitlistedIdentityError) {
        await this.dependencies.audit({
          kind: 'signup_waitlisted',
          ip: args.ip,
          userAgent: args.userAgent,
          detail: { provider: args.provider, email: error.email },
        })
        return this.dependencies.waitlistUrl(
          args.returnUrl ?? this.dependencies.defaultDoneUrl,
          error.email,
        )
      }
      if (error instanceof SuspendedIdentityError) {
        await this.dependencies.audit({
          kind: 'login_suspended',
          ip: args.ip,
          userAgent: args.userAgent,
          detail: { provider: args.provider, email: error.email, reason: error.reason },
        })
        return this.dependencies.suspendedUrl(
          args.returnUrl ?? this.dependencies.defaultDoneUrl,
          error.email,
          error.reason,
        )
      }
      throw error
    }
  }

  private async completeIdentity(
    provider: IdentityProvider,
    profile: NormalizedIdentityProfile,
    inviteToken: string | null,
  ): Promise<CompletionResult> {
    const waitlistEnabled = await this.dependencies.waitlistEnabled()
    const isAdmin = this.dependencies.isAllowlistedAdmin(profile.email)
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const result = await this.dependencies.transaction<CompletionResult | WaitlistedResult>(async (db) => {
          const linkedUserId = await findLinkedIdentityUser(db, provider, profile.providerId)
          if (linkedUserId) return this.finalize(db, linkedUserId, profile, false)

          const emailUserId = await findActiveUserByEmail(db, profile.email)
          if (emailUserId) {
            const authoritativeUserId = await linkIdentity(db, {
              provider,
              providerId: profile.providerId,
              userId: emailUserId,
              email: profile.email,
            })
            return this.finalize(db, authoritativeUserId, profile, false)
          }

          if (waitlistEnabled && !isAdmin) return { kind: 'waitlisted' as const }

          const userId = this.dependencies.userId()
          await insertIdentityUser(db, { userId, provider, profile, isAdmin })
          let companyId: string | null = null
          let installedCompany = false
          if (!inviteToken) {
            companyId = this.dependencies.companyId()
            installedCompany = await this.dependencies.provisionCompany(db, {
              id: companyId,
              name: `${profile.displayName}'s workspace`,
              slug: personalSlug(profile.email, companyId),
              userId,
              projectId: this.dependencies.projectId(),
            })
          }
          return this.finalize(db, userId, profile, installedCompany)
        })
        if (result.kind === 'waitlisted') {
          await this.dependencies.enqueueWaitlist({
            provider,
            providerId: profile.providerId,
            email: profile.email,
            displayName: profile.displayName,
            avatarUrl: profile.avatarUrl,
          })
          throw new WaitlistedIdentityError(profile.email, profile.displayName)
        }
        return result
      } catch (error) {
        if (!isUniqueViolation(error) || attempt === 2) throw error
      }
    }
    throw new Error('identity transaction retries exhausted')
  }

  private async finalize(
    db: Queryable,
    userId: string,
    profile: NormalizedIdentityProfile,
    installedCompany: boolean,
  ): Promise<CompletionResult> {
    const finalized = await finalizeIdentityLogin(db, userId)
    if (finalized.suspendedAt) {
      throw new SuspendedIdentityError(profile.email, finalized.suspensionReason)
    }
    return {
      kind: 'completed',
      userId,
      email: profile.email,
      displayName: profile.displayName,
      companyId: finalized.companyId,
      installedCompany,
    }
  }
}

export const oauthIds = {
  userId: () => `u-${randomUUID().slice(0, 12)}`,
  companyId: () => `co-${randomUUID().slice(0, 10)}`,
  projectId: () => `general-${randomUUID().slice(0, 18)}`,
}
