import { createHash, randomBytes } from 'node:crypto'
import { env } from '../../env.js'
import { isAllowedReturnUrl } from '../../oauth-return-url.js'
import { discoverOidc, normalizeOidcProfile, type OidcProfile } from '../../oidc.js'
import { redis } from '../../redis.js'
import type { IdentityProvider, NormalizedIdentityProfile } from './contracts.js'

interface ProviderConfig {
  authorizeUrl: string
  tokenUrl: string
  userInfoUrl: string
  scope: string
  clientId: string
  clientSecret: string
  tokenAuthMethod: 'client_secret_basic' | 'client_secret_post'
}

export interface ClaimedIdentityState {
  provider: IdentityProvider
  returnUrl: string | null
  inviteToken: string | null
  inviteKind: 'company' | 'course' | null
}

async function providerConfig(): Promise<ProviderConfig> {
  const discovered = await discoverOidc(env.LINGXI_IDENTITY_ISSUER)
  return {
    authorizeUrl: discovered.authorization_endpoint,
    tokenUrl: discovered.token_endpoint,
    userInfoUrl: discovered.userinfo_endpoint,
    scope: env.LINGXI_IDENTITY_SCOPES,
    clientId: env.LINGXI_IDENTITY_CLIENT_ID,
    clientSecret: env.LINGXI_IDENTITY_CLIENT_SECRET,
    tokenAuthMethod: discovered.token_endpoint_auth_methods_supported?.includes('client_secret_basic')
      ? 'client_secret_basic'
      : 'client_secret_post',
  }
}

function redirectUri(provider: IdentityProvider): string {
  return `${env.PUBLIC_ORIGIN}/api/auth/callback/${provider}`
}

function hashState(state: string): string {
  return createHash('sha256').update(state).digest('base64url')
}

export function identityProviderEnabled(provider: IdentityProvider): boolean {
  return provider === 'lingxi' && Boolean(
    env.LINGXI_IDENTITY_ISSUER
      && env.LINGXI_IDENTITY_CLIENT_ID
      && env.LINGXI_IDENTITY_CLIENT_SECRET,
  )
}

export function identityReturnUrlAllowed(url: string): boolean {
  return isAllowedReturnUrl(url, env.AUTH_RETURN_ALLOWLIST)
}

export async function createIdentityState(
  provider: IdentityProvider,
  returnUrl: string | null,
  inviteToken: string | null,
  inviteKind: 'company' | 'course' | null,
): Promise<string> {
  const state = randomBytes(32).toString('base64url')
  const data: ClaimedIdentityState = { provider, returnUrl, inviteToken, inviteKind }
  await redis.set(`oauth:state:${hashState(state)}`, JSON.stringify(data), 'EX', 300)
  return state
}

export async function consumeIdentityState(state: string): Promise<ClaimedIdentityState | null> {
  const value = await redis.getdel(`oauth:state:${hashState(state)}`)
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as ClaimedIdentityState
    return parsed.provider === 'lingxi' ? parsed : null
  } catch {
    return null
  }
}

export async function identityAuthorizeUrl(provider: IdentityProvider, state: string): Promise<string> {
  const config = await providerConfig()
  const parameters = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri(provider),
    response_type: 'code',
    scope: config.scope,
    state,
  })
  return `${config.authorizeUrl}?${parameters.toString()}`
}

export async function fetchIdentityProfile(
  provider: IdentityProvider,
  code: string,
): Promise<NormalizedIdentityProfile> {
  const config = await providerConfig()
  const body = new URLSearchParams({
    code,
    redirect_uri: redirectUri(provider),
    grant_type: 'authorization_code',
  })
  const headers: Record<string, string> = {
    'content-type': 'application/x-www-form-urlencoded',
    accept: 'application/json',
  }
  if (config.tokenAuthMethod === 'client_secret_basic') {
    headers.authorization = `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`
  } else {
    body.set('client_id', config.clientId)
    body.set('client_secret', config.clientSecret)
  }
  const tokenResponse = await fetch(config.tokenUrl, { method: 'POST', headers, body })
  if (!tokenResponse.ok) {
    throw new Error(`${provider} token exchange ${tokenResponse.status}: ${await tokenResponse.text()}`)
  }
  const token = await tokenResponse.json() as {
    access_token?: string
    error?: string
    error_description?: string
  }
  if (!token.access_token) {
    throw new Error(`${provider} token response missing access_token: ${token.error_description ?? token.error ?? 'unknown'}`)
  }
  const profileResponse = await fetch(config.userInfoUrl, {
    headers: { authorization: `Bearer ${token.access_token}`, accept: 'application/json' },
  })
  if (!profileResponse.ok) throw new Error(`LingxiIdentity userinfo ${profileResponse.status}`)
  return normalizeOidcProfile(await profileResponse.json() as OidcProfile)
}
