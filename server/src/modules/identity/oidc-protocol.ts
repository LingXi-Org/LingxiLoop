import type { NormalizedIdentityProfile } from './contracts.js'

export interface OidcDiscovery {
  issuer: string
  authorization_endpoint: string
  token_endpoint: string
  userinfo_endpoint: string
  token_endpoint_auth_methods_supported?: string[]
}

export interface OidcProfile {
  sub?: unknown
  email?: unknown
  email_verified?: unknown
  name?: unknown
  picture?: unknown
}

let discoveryCache: { issuer: string; value: OidcDiscovery } | null = null

export async function discoverOidc(issuerValue: string): Promise<OidcDiscovery> {
  const issuer = issuerValue.replace(/\/+$/, '')
  if (!issuer) throw new Error('LingxiIdentity issuer is not configured')
  if (discoveryCache?.issuer === issuer) return discoveryCache.value
  const response = await fetch(`${issuer}/.well-known/openid-configuration`, {
    headers: { accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`LingxiIdentity discovery ${response.status}`)
  const value = await response.json() as Partial<OidcDiscovery>
  if (value.issuer !== issuer) throw new Error('LingxiIdentity discovery issuer mismatch')
  if (!value.authorization_endpoint || !value.token_endpoint || !value.userinfo_endpoint) {
    throw new Error('LingxiIdentity discovery is missing required endpoints')
  }
  for (const endpoint of [value.authorization_endpoint, value.token_endpoint, value.userinfo_endpoint]) {
    if (new URL(endpoint).protocol !== 'https:' && process.env.NODE_ENV === 'production') {
      throw new Error('LingxiIdentity discovery endpoints must use HTTPS')
    }
  }
  const discovered = value as OidcDiscovery
  discoveryCache = { issuer, value: discovered }
  return discovered
}

export function normalizeOidcProfile(profile: OidcProfile): NormalizedIdentityProfile {
  const providerId = typeof profile.sub === 'string' ? profile.sub.trim() : ''
  const email = typeof profile.email === 'string' ? profile.email.trim().toLowerCase() : ''
  if (!providerId) throw new Error('LingxiIdentity account has no subject')
  if (!email || profile.email_verified !== true) {
    throw new Error('LingxiIdentity account has no verified email')
  }
  const name = typeof profile.name === 'string' ? profile.name.trim() : ''
  return {
    providerId,
    email,
    displayName: name || email.split('@')[0]!,
    avatarUrl: typeof profile.picture === 'string' && profile.picture ? profile.picture : null,
  }
}

export function clearOidcDiscoveryCacheForTest(): void {
  discoveryCache = null
}
