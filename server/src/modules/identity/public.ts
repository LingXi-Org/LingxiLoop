export { gravatarUrlForEmail } from './avatar-policy.js'
export async function mirrorTrustedIdentityAvatar(
  userId: string,
  providerUrl: string | null,
): Promise<string | null> {
  const { mirrorTrustedIdentityAvatar: mirror } = await import('./avatar-facade.js')
  return mirror(userId, providerUrl)
}
export {
  audit,
  auditInTransaction,
  consumeWsTicket,
  createLoginSession,
  createSession,
  createWsTicket,
  deleteSession,
  resolveSession,
} from './session-facade.js'
export type { AuditInput } from './session-application.js'
