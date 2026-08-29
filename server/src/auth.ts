import { resolveSession } from './modules/identity/public.js'

/** Request authentication context populated once by the global API boundary. */
export interface AuthedRequest {
  authUserId?: string
}

/**
 * Parse the single supported bearer/session header and attach its authenticated
 * user. Route-level request-context helpers decide whether authentication is
 * mandatory; session persistence belongs exclusively to the Identity domain.
 */
export async function authMiddleware(
  request: { headers: Record<string, string | string[] | undefined> } & AuthedRequest,
  _response: unknown,
  next: () => void,
): Promise<void> {
  const authorization = request.headers.authorization
  const bearer = typeof authorization === 'string' && authorization.startsWith('Bearer ')
    ? authorization.slice(7).trim()
    : ''
  const sessionHeader = request.headers['x-session-token']
  const token = bearer || (typeof sessionHeader === 'string' ? sessionHeader.trim() : '')
  if (token) {
    const session = await resolveSession(token)
    if (session) request.authUserId = session.userId
  }
  next()
}
