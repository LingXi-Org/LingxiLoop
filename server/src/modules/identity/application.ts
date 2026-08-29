import type { Queryable } from '../../db/queryable.js'
import type {
  IdentityMePayload,
  IdentityProvider,
  IdentityRequestMetadata,
} from './contracts.js'
import {
  findActiveAccountEmail,
  findIdentityUser,
  listIdentityCompanies,
  listIdentityProviders,
  scrubAccount,
} from './repository.js'

export type IdentityErrorCode =
  | 'provider_not_found'
  | 'provider_unavailable'
  | 'return_url_forbidden'
  | 'account_not_found'
  | 'session_user_missing'

export class IdentityApplicationError extends Error {
  constructor(readonly code: IdentityErrorCode, message: string) {
    super(message)
  }
}

interface ClaimedState {
  provider: IdentityProvider
  returnUrl: string | null
  inviteToken: string | null
}

interface AuditInput {
  kind: string
  userId?: string | null
  ip?: string | null
  userAgent?: string | null
  detail?: Record<string, unknown>
}

export interface IdentityInfrastructure {
  providerEnabled(provider: IdentityProvider): boolean
  returnUrlAllowed(url: string): boolean
  createState(
    provider: IdentityProvider,
    returnUrl: string | null,
    inviteToken: string | null,
    inviteKind: 'company' | 'course' | null,
  ): Promise<string>
  consumeState(state: string): Promise<ClaimedState | null>
  authorizeUrl(provider: IdentityProvider, state: string): Promise<string>
  handleCallback(args: {
    provider: IdentityProvider
    code: string
    returnUrl: string | null
    ip: string | null
    userAgent: string | null
    inviteToken: string | null
  }): Promise<string>
  errorUrl(base: string | null, error: string): string
  audit(input: AuditInput): Promise<void>
  auditInTransaction(db: Queryable, input: AuditInput): Promise<void>
  deleteSession(token: string): Promise<void>
  createWsTicket(userId: string): Promise<{ ticket: string; expiresAt: Date }>
  transaction<T>(work: (db: Queryable) => Promise<T>): Promise<T>
  invitationEmailEnabled: boolean
}

export class IdentityApplication {
  constructor(
    private readonly db: Queryable,
    private readonly infrastructure: IdentityInfrastructure,
  ) {}

  async start(
    provider: string,
    input: { return?: string; invite?: string; inviteKind?: 'company' | 'course' },
  ): Promise<string> {
    const validProvider = this.requireProvider(provider)
    if (!this.infrastructure.providerEnabled(validProvider)) {
      throw new IdentityApplicationError('provider_unavailable', `${validProvider} oauth not configured`)
    }
    const returnUrl = input.return ?? null
    if (returnUrl && !this.infrastructure.returnUrlAllowed(returnUrl)) {
      throw new IdentityApplicationError('return_url_forbidden', 'return URL not allowed')
    }
    const inviteToken = input.invite ?? null
    const inviteKind = inviteToken ? (input.inviteKind === 'course' ? 'course' : 'company') : null
    const state = await this.infrastructure.createState(validProvider, returnUrl, inviteToken, inviteKind)
    return this.infrastructure.authorizeUrl(validProvider, state)
  }

  async callback(
    provider: string,
    input: {
      code: string
      state: string
      error: string
      errorDescription: string
    },
    metadata: IdentityRequestMetadata,
  ): Promise<string> {
    const validProvider = this.requireProvider(provider)
    if (input.error) {
      const claimed = input.state ? await this.infrastructure.consumeState(input.state) : null
      const detail = `${validProvider} oauth error: ${input.error}${input.errorDescription ? ` (${input.errorDescription})` : ''}`
      await this.infrastructure.audit({
        kind: 'login_failed',
        ip: metadata.ip,
        userAgent: metadata.userAgent,
        detail: {
          provider: validProvider,
          error: input.error,
          description: input.errorDescription || null,
        },
      })
      return this.infrastructure.errorUrl(claimed?.returnUrl ?? null, detail.slice(0, 120))
    }
    if (!input.code || !input.state) {
      return this.infrastructure.errorUrl(
        null,
        'OAuth callback missing code or state; verify LINGXILOOP_PUBLIC_ORIGIN and the registered callback URL',
      )
    }
    const claimed = await this.infrastructure.consumeState(input.state)
    if (!claimed || claimed.provider !== validProvider) {
      return this.infrastructure.errorUrl(null, 'bad_state')
    }
    try {
      return await this.infrastructure.handleCallback({
        provider: validProvider,
        code: input.code,
        returnUrl: claimed.returnUrl,
        ip: metadata.ip,
        userAgent: metadata.userAgent,
        inviteToken: claimed.inviteToken,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await this.infrastructure.audit({
        kind: 'login_failed',
        ip: metadata.ip,
        userAgent: metadata.userAgent,
        detail: { provider: validProvider, error: message },
      })
      return this.infrastructure.errorUrl(claimed.returnUrl, message.slice(0, 120))
    }
  }

  async logout(token: string | null, userId: string | null, ip: string | null): Promise<{ ok: true }> {
    if (token) await this.infrastructure.deleteSession(token)
    await this.infrastructure.audit({ kind: 'logout', userId, ip })
    return { ok: true }
  }

  async deleteAccount(
    userId: string,
    metadata: IdentityRequestMetadata,
  ): Promise<{ ok: true }> {
    await this.infrastructure.transaction(async (db) => {
      const activeEmail = await findActiveAccountEmail(db, userId)
      if (!activeEmail) {
        throw new IdentityApplicationError('account_not_found', 'account already deleted or not found')
      }
      await scrubAccount(db, userId)
      await this.infrastructure.auditInTransaction(db, {
        kind: 'account_deleted',
        userId,
        ip: metadata.ip,
        userAgent: metadata.userAgent,
        detail: { email: activeEmail },
      })
    })
    return { ok: true }
  }

  async wsTicket(userId: string): Promise<{ ticket: string; expiresAt: string }> {
    const result = await this.infrastructure.createWsTicket(userId)
    return { ticket: result.ticket, expiresAt: result.expiresAt.toISOString() }
  }

  async me(userId: string): Promise<IdentityMePayload> {
    const [user, companies, providers] = await Promise.all([
      findIdentityUser(this.db, userId),
      listIdentityCompanies(this.db, userId),
      listIdentityProviders(this.db, userId),
    ])
    if (!user) {
      throw new IdentityApplicationError('session_user_missing', 'session points to missing user')
    }
    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.display_name,
        emailVerified: user.email_verified_at !== null,
        providers,
      },
      companies,
      activeCompanyId: companies[0]?.id ?? null,
      serverCapabilities: { invitationEmail: this.infrastructure.invitationEmailEnabled },
    }
  }

  private requireProvider(provider: string): IdentityProvider {
    if (provider !== 'lingxi') {
      throw new IdentityApplicationError('provider_not_found', 'unknown provider')
    }
    return provider
  }
}
