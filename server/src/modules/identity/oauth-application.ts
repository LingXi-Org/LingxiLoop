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
  companyId: string
}

interface OAuthApplicationDependencies {
  transaction<T>(work: (db: Queryable) => Promise<T>): Promise<T>
  fetchProfile(provider: IdentityProvider, code: string): Promise<NormalizedIdentityProfile>
  mirrorAvatar(userId: string, providerUrl: string | null): Promise<string | null>
  provisionWorkspace(
    db: Queryable,
    userId: string,
  ): Promise<{ companyId: string; projectId: string; created: boolean }>
  finalizeWorkspace(companyId: string): Promise<void>
  createLoginSession(
    userId: string,
    options: { ip?: string; ua?: string },
    audit: AuditInput,
  ): Promise<{ token: string; expiresAt: Date }>
  audit(input: AuditInput): Promise<void>
  defaultDoneUrl: string
  doneUrl(base: string, token: string, companyId: string): string
  suspendedUrl(base: string, email: string, reason: string | null): string
  userId(): string
}

class SuspendedIdentityError extends Error {
  constructor(readonly email: string, readonly reason: string | null) {
    super(`suspended: ${email}`)
  }
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === '23505')
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
      const result = await this.completeIdentity(args.provider, profile)
      const avatarUrl = await this.dependencies.mirrorAvatar(result.userId, profile.avatarUrl)
      await this.dependencies.transaction((db) => updateIdentityAvatar(db, result.userId, avatarUrl))
      await this.dependencies.finalizeWorkspace(result.companyId)
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
  ): Promise<CompletionResult> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const result = await this.dependencies.transaction<CompletionResult>(async (db) => {
          const linkedUserId = await findLinkedIdentityUser(db, provider, profile.providerId)
          if (linkedUserId) return this.finalize(db, linkedUserId, profile)

          const emailUserId = await findActiveUserByEmail(db, profile.email)
          if (emailUserId) {
            const authoritativeUserId = await linkIdentity(db, {
              provider,
              providerId: profile.providerId,
              userId: emailUserId,
              email: profile.email,
            })
            return this.finalize(db, authoritativeUserId, profile)
          }

          const userId = this.dependencies.userId()
          await insertIdentityUser(db, { userId, provider, profile })
          await this.dependencies.provisionWorkspace(db, userId)
          return this.finalize(db, userId, profile)
        })
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
    }
  }
}

export const oauthIds = {
  userId: () => `u-${randomUUID().slice(0, 12)}`,
}
