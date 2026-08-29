export function identityDoneUrl(base: string, token: string, companyId: string): string {
  const fragment = new URLSearchParams({ token, companyId })
  return `${base}#${fragment.toString()}`
}

export function identitySuspendedUrl(base: string, email: string, reason: string | null): string {
  const fragment = new URLSearchParams({ suspended: '1', email })
  if (reason) fragment.set('reason', reason)
  return `${base}#${fragment.toString()}`
}

export function identityErrorUrl(base: string | null, defaultBase: string, error: string): string {
  return `${base ?? defaultBase}#${new URLSearchParams({ error }).toString()}`
}
